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

test('ui-mapping registry stores durable code-figma correspondence and sync state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-mappings-api-'));
  const dbPath = join(dir, 'ui-mappings.sqlite');

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
      writeAllowedOperations: ['execute-plugin-command', 'execute-plugin-batch']
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const upsert = await requestJson(baseUrl, '/api/ui-mappings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uiId: 'landing.hero',
          project: 'marketing-site',
          semanticRole: 'headline',
          code: {
            file: 'src/components/Hero.tsx',
            component: 'Hero',
            selector: 'section[data-ui-id="landing.hero"]',
            sourceRange: { lineStart: 10, lineEnd: 28 },
            jsxPath: 'Hero > section[0]',
            snapshotHash: 'codehash_123',
            snapshot: { kind: 'section', text: 'Build faster' }
          },
          figma: {
            fileKey: 'abc123',
            nodeId: '12:45',
            snapshotHash: 'figmahash_456',
            snapshot: { kind: 'section', name: 'Hero' }
          },
          sync: {
            lastDirection: 'code_to_figma',
            lastSyncedAt: '2026-04-15T12:00:00Z',
            lastCodeHash: 'codehash_123',
            lastFigmaHash: 'figmahash_456'
          }
        })
      });

      assert.equal(upsert.status, 200);
      const upsertData = (upsert.json as { data: { uiId: string; code: { file: string }; figma: { nodeId: string }; sync: { lastDirection: string } } }).data;
      assert.equal(upsertData.uiId, 'landing.hero');
      assert.equal(upsertData.code.file, 'src/components/Hero.tsx');
      assert.equal(upsertData.figma.nodeId, '12:45');
      assert.equal(upsertData.sync.lastDirection, 'code_to_figma');

      const resolved = await requestJson(baseUrl, '/api/ui-mappings/landing.hero');
      assert.equal(resolved.status, 200);
      const resolvedData = (resolved.json as { data: { semanticRole: string; code: { component: string; sourceRange: { lineStart: number; lineEnd: number } }; sync: { lastSyncedAt: string } } }).data;
      assert.equal(resolvedData.semanticRole, 'headline');
      assert.equal(resolvedData.code.component, 'Hero');
      assert.equal(resolvedData.code.sourceRange.lineStart, 10);
      assert.equal(resolvedData.code.sourceRange.lineEnd, 28);
      assert.equal(resolvedData.sync.lastSyncedAt, '2026-04-15T12:00:00Z');

      const aliasUpsert = await requestJson(baseUrl, '/api/ui-mappings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uiId: 'marketing.hero.alt',
          project: 'marketing-site',
          semanticRole: 'headline',
          code: { file: 'src/components/HeroAlt.tsx', component: 'HeroAlt', snapshot: { kind: 'section', uiId: 'marketing.hero.alt', visible: true, meta: { blockIdentity: { blockId: 'marketing.hero.alt', aliases: ['hero.primary'], semanticName: 'hero.primary', identitySource: 'stable_ui_id', stable: true } } } },
          figma: { fileKey: 'def456', nodeId: '98:76', snapshot: { kind: 'section', name: 'Hero Alt' } },
          sync: { lastDirection: 'code_to_figma' }
        })
      });
      assert.equal(aliasUpsert.status, 200);

      const search = await requestJson(baseUrl, '/api/search/ui-mappings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'hero.primary' })
      });
      assert.equal(search.status, 200);
      const searchData = (search.json as { data: Array<{ uiId: string; figma: { fileKey: string } }> }).data;
      assert.equal(searchData[0].uiId, 'marketing.hero.alt');
      assert.equal(searchData[0].figma.fileKey, 'def456');

      const list = await requestJson(baseUrl, '/api/ui-mappings?project=marketing-site&limit=10');
      assert.equal(list.status, 200);
      assert.equal((list.json as { data: Array<{ uiId: string }> }).data[0].uiId, 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('variant group registry API exposes derived multi-breakpoint groups', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'variant-groups-api-'));
  const dbPath = join(dir, 'variant-groups.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      await requestJson(baseUrl, '/api/ui-mappings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uiId: 'landing.hero', project: 'marketing-site', code: { file: 'src/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true, meta: { breakpointVariantSet: { variantGroupId: 'landing.hero' }, breakpointVariantRef: { originalUiId: 'landing.hero', variantUiId: 'landing.hero--desktop', breakpointFamily: 'desktop' } } } }, figma: { fileKey: 'abc123', nodeId: '1:2', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true } }, sync: { lastDirection: 'code_to_figma' } })
      });
      const search = await requestJson(baseUrl, '/api/search/variant-groups', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'landing.hero--desktop' })
      });
      assert.equal(search.status, 200);
      assert.equal((search.json as { data: Array<{ variantGroupId: string }> }).data[0].variantGroupId, 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
