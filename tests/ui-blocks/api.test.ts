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
  return {
    status: response.status,
    json: (await response.json()) as unknown
  };
};

test('ui-block registry API stores and resolves stable code-to-figma block ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-blocks-api-'));
  const dbPath = join(dir, 'ui-blocks.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['create-frame', 'execute-plugin-command', 'execute-plugin-batch']
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const upsert = await requestJson(baseUrl, '/api/ui-blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uiId: 'landing.hero',
          project: 'marketing-site',
          fileKey: 'file-hero',
          nodeId: '1:10',
          codeRepository: 'github.com/acme/frontend',
          codePath: 'src/pages/Landing.tsx',
          codeExportName: 'LandingPage',
          codeSelector: 'section[data-ui-id="landing.hero"]',
          codeMarkerType: 'data-ui-id',
          figmaBindingType: 'plugin-data',
          figmaBindingKey: 'figma-gateway.ui-id',
          tags: ['landing', 'hero'],
          metadata: {
            framework: 'react',
            attr: 'data-ui-id'
          }
        })
      });

      assert.equal(upsert.status, 200);
      assert.equal((upsert.json as { data: { uiId: string } }).data.uiId, 'landing.hero');

      const resolved = await requestJson(baseUrl, '/api/ui-blocks/landing.hero');
      assert.equal(resolved.status, 200);
      const resolvedData = (resolved.json as { data: { codePath: string; nodeId: string; figmaBindingKey: string } }).data;
      assert.equal(resolvedData.codePath, 'src/pages/Landing.tsx');
      assert.equal(resolvedData.nodeId, '1:10');
      assert.equal(resolvedData.figmaBindingKey, 'figma-gateway.ui-id');

      await requestJson(baseUrl, '/api/ui-blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uiId: 'marketing.hero.alt',
          project: 'marketing-site',
          codeMarkerType: 'data-ui-id',
          figmaBindingType: 'plugin-data',
          figmaBindingKey: 'figma-gateway.ui-id',
          metadata: { blockIdentity: { blockId: 'marketing.hero.alt', aliases: ['hero.primary'], semanticName: 'hero.primary', identitySource: 'stable_ui_id', stable: true } }
        })
      });

      const search = await requestJson(baseUrl, '/api/search/ui-blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'hero.primary' })
      });
      assert.equal(search.status, 200);
      assert.equal((search.json as { data: Array<{ uiId: string }> }).data[0].uiId, 'marketing.hero.alt');

      const registration = await requestJson(baseUrl, '/api/plugin-bridge/sessions/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileKey: 'file-hero',
          localFileKey: 'local:figma',
          fileName: 'Landing',
          clientName: 'test-plugin'
        })
      });
      const sessionId = (registration.json as { data: { sessionId: string } }).data.sessionId;
      const sessionToken = (registration.json as { data: { sessionToken: string } }).data.sessionToken;

      const createFrame = await requestJson(baseUrl, '/api/write/create-frame', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileKey: 'file-hero',
          sessionId,
          name: 'Hero Frame',
          uiId: 'landing.hero',
          width: 1440,
          height: 700,
          dryRun: false
        })
      });
      assert.equal(createFrame.status, 202);

      const pendingResponse = await fetch(`${baseUrl}/api/plugin-bridge/sessions/${sessionId}/commands/pending`, {
        headers: {
          authorization: 'Bearer test-api-token',
          'x-plugin-session-token': sessionToken
        }
      });
      const pending = (await pendingResponse.json()) as { data: Array<{ type: string; payload: { uiId?: string } }> };
      assert.equal(pendingResponse.status, 200);
      assert.equal(pending.data[0].type, 'create-frame');
      assert.equal(pending.data[0].payload.uiId, 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
