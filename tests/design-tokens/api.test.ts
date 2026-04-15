import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({ document: { id: '0:1', name: 'Document', type: 'DOCUMENT' } }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

const requestJson = async (baseUrl: string, path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer test-api-token');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { status: response.status, json: (await response.json()) as unknown };
};

test('design token registry stores shared token truth across code and figma', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-tokens-api-'));
  const dbPath = join(dir, 'design-tokens.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const upsert = await requestJson(baseUrl, '/api/design-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: 'color.brand.primary',
          type: 'colors',
          project: 'marketing-site',
          description: 'Primary brand color',
          value: {
            raw: '#265fe0',
            cssVar: '--color-brand-primary',
            tailwind: 'bg-brand-primary',
            meta: { rgba: '38 95 224' }
          },
          code: {
            file: 'src/styles/tokens.ts',
            exportName: 'colorBrandPrimary',
            className: 'bg-brand-primary',
            cssVar: '--color-brand-primary',
            tokenSource: 'tailwind-theme'
          },
          figma: {
            fileKey: 'abc123',
            collectionId: 'VariableCollectionId:1:4',
            variableId: 'VariableID:10:20',
            name: 'Brand / Primary',
            mode: 'Light'
          },
          tags: ['brand', 'primary']
        })
      });
      assert.equal(upsert.status, 200);
      const upsertData = (upsert.json as { data: { token: string; code: { className: string }; figma: { variableId: string } } }).data;
      assert.equal(upsertData.token, 'color.brand.primary');
      assert.equal(upsertData.code.className, 'bg-brand-primary');
      assert.equal(upsertData.figma.variableId, 'VariableID:10:20');

      const resolved = await requestJson(baseUrl, '/api/design-tokens/color.brand.primary');
      assert.equal(resolved.status, 200);
      const resolvedData = (resolved.json as { data: { value: { cssVar: string; tailwind: string }; tags: string[] } }).data;
      assert.equal(resolvedData.value.cssVar, '--color-brand-primary');
      assert.equal(resolvedData.value.tailwind, 'bg-brand-primary');
      assert.equal(resolvedData.tags.includes('brand'), true);

      const search = await requestJson(baseUrl, '/api/search/design-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ className: 'bg-brand-primary' })
      });
      assert.equal(search.status, 200);
      const searchData = (search.json as { data: Array<{ token: string }> }).data;
      assert.equal(searchData[0].token, 'color.brand.primary');

      const list = await requestJson(baseUrl, '/api/design-tokens?project=marketing-site&type=colors&limit=10');
      assert.equal(list.status, 200);
      assert.equal((list.json as { data: Array<{ token: string }> }).data[0].token, 'color.brand.primary');

      const capabilities = await fetch(`${baseUrl}/capabilities`);
      const capabilitiesJson = (await capabilities.json()) as { data: { capabilities: { mvpScope: { tokens: { categories: string[]; sharedSourceOfTruth: boolean } } } } };
      assert.equal(capabilities.status, 200);
      assert.equal(capabilitiesJson.data.capabilities.mvpScope.tokens.categories.includes('colors'), true);
      assert.equal(capabilitiesJson.data.capabilities.mvpScope.tokens.categories.includes('breakpoints'), true);
      assert.equal(capabilitiesJson.data.capabilities.mvpScope.tokens.sharedSourceOfTruth, true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
