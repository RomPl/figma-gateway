import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuditService } from '../../src/core/audit';
import { createApp } from '../../src/api/app';
import { AliasRegistry } from '../../src/core/alias-registry';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { createDefaultFigmaWriteAdapter, createFigmaWriteService } from '../../src/core/figma-write-service';
import type { FigmaWriteAdapter } from '../../src/core/figma-write-types';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    document: {
      id: '0:1',
      name: 'Document',
      type: 'DOCUMENT'
    }
  }),
  getNode: async (_fileKey, nodeId) => ({
    document: {
      id: nodeId,
      name: 'Node',
      type: 'FRAME'
    }
  }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

const createAdapter = (): FigmaWriteAdapter => ({
  createFrame: async (request) => ({
    id: 'frame-live',
    name: request.input.name
  }),
  updateText: async (request) => ({
    id: request.input.nodeId,
    text: request.input.text
  }),
  createSection: async (request) => ({
    id: 'section-live',
    name: request.input.name
  }),
  duplicateBlock: async (request) => ({
    id: 'duplicate-live',
    nodeId: request.input.nodeId
  }),
  applyStyleFromAlias: async (request) => ({
    id: request.input.nodeId,
    alias: request.input.sourceAlias.alias
  })
});

const requestJson = async (baseUrl: string, path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer test-api-token');

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  return {
    status: response.status,
    json: (await response.json()) as unknown
  };
};

test('write API supports dry-run and live-mode through abstraction and writes audit trail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-write-api-'));
  const dbPath = join(dir, 'write.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const aliasRegistry = new AliasRegistry(db);
    aliasRegistry.upsert({
      alias: 'button-primary-style',
      fileKey: 'file-style',
      nodeId: '2:3',
      project: 'design-system',
      tags: ['style'],
      description: 'Primary button style source'
    });
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      figmaWriteService: createFigmaWriteService({
        aliasRegistry,
        adapter: createAdapter(),
        enabled: true,
        allowedOperations: ['create-frame', 'apply-style-from-alias']
      })
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const dryRun = await requestJson(baseUrl, '/api/write/create-frame', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-id': 'gpt-actions'
        },
        body: JSON.stringify({
          fileKey: 'file-1',
          parentNodeId: '1:1',
          name: 'Hero',
          width: 1440,
          height: 400,
          dryRun: true
        })
      });

      assert.equal(dryRun.status, 200);
      assert.equal((dryRun.json as { data: { performed: boolean } }).data.performed, false);

      const live = await requestJson(baseUrl, '/api/write/apply-style-from-alias', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-app',
          nodeId: '9:1',
          alias: 'button-primary-style',
          dryRun: false
        })
      });

      assert.equal(live.status, 200);
      assert.deepEqual((live.json as { data: { payload: unknown } }).data.payload, {
        id: '9:1',
        alias: 'button-primary-style'
      });

      const events = auditService.listRecent(2);
      assert.equal(events[0].target, 'POST /api/write/apply-style-from-alias');
      assert.equal(events[0].status, 'success');
      assert.equal(events[1].target, 'POST /api/write/create-frame');
      assert.equal(events[1].status, 'success');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('write API is blocked when write actions are disabled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-write-disabled-'));
  const dbPath = join(dir, 'write.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const aliasRegistry = new AliasRegistry(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      figmaWriteService: createFigmaWriteService({
        aliasRegistry,
        adapter: createDefaultFigmaWriteAdapter(),
        enabled: false,
        allowedOperations: ['update-text']
      })
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await requestJson(baseUrl, '/api/write/update-text', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-1',
          nodeId: '1:2',
          text: 'Updated',
          dryRun: false
        })
      });

      assert.equal(response.status, 403);
      assert.deepEqual(response.json, {
        success: false,
        error: {
          code: 'WRITE_ACTIONS_DISABLED',
          message: 'Write actions are disabled'
        }
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
