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

test('write API queues live write commands through plugin bridge and writes audit trail', async () => {
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
      enableWriteActions: true,
      writeAllowedOperations: ['create-frame', 'apply-style-from-alias', 'execute-plugin-command', 'execute-plugin-batch']
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const registration = await requestJson(baseUrl, '/api/plugin-bridge/sessions/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-app',
          localFileKey: 'local:figma',
          fileName: 'Test File',
          clientName: 'test-plugin'
        })
      });

      assert.equal(registration.status, 200);
      const sessionId = (registration.json as { data: { sessionId: string } }).data.sessionId;
      const sessionToken = (registration.json as { data: { sessionToken: string } }).data.sessionToken;

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
          dryRun: false,
          sessionId: sessionId
        })
      });

      assert.equal(live.status, 202);
      const liveData = (live.json as { data: { result: { commandId: string; status: string } } }).data;
      assert.equal(liveData.result.status, 'queued');

      const pending = await fetch(`${baseUrl}/api/plugin-bridge/sessions/${sessionId}/commands/pending`, {
        headers: {
          authorization: 'Bearer test-api-token',
          'x-plugin-session-token': sessionToken
        }
      });
      const pendingJson = (await pending.json()) as { data: Array<{ type: string; payload: { alias?: string; nodeId?: string } }> };
      assert.equal(pending.status, 200);
      assert.equal(pendingJson.data.length, 1);
      assert.equal(pendingJson.data[0].type, 'apply-style-from-alias');
      assert.equal(pendingJson.data[0].payload.alias, 'button-primary-style');
      assert.equal(pendingJson.data[0].payload.nodeId, '9:1');

      const events = auditService.listRecent(3);
      assert.equal(events[0].target, `GET /api/plugin-bridge/sessions/${sessionId}/commands/pending`);
      assert.equal(events[1].target, 'POST /api/write/apply-style-from-alias');
      assert.equal(events[1].status, 'success');
      assert.equal(events[2].target, 'POST /api/write/create-frame');
      assert.equal(events[2].status, 'success');
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
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: false,
      writeAllowedOperations: ['update-text']
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
