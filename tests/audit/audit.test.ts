import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuditService, auditMcpToolExecution, sanitizeAuditParams } from '../../src/core/audit';
import { createApp } from '../../src/api/app';
import { AppError } from '../../src/core/errors';
import type { FigmaReadClient } from '../../src/core/figma-client';
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

test('sanitizeAuditParams redacts secret-like fields recursively', () => {
  const sanitized = sanitizeAuditParams({
    token: 'secret',
    nested: {
      authorization: 'Bearer value',
      plain: 'ok'
    },
    list: [
      {
        apiKey: '123'
      }
    ]
  });

  assert.deepEqual(sanitized, {
    token: '[REDACTED]',
    nested: {
      authorization: '[REDACTED]',
      plain: 'ok'
    },
    list: [
      {
        apiKey: '[REDACTED]'
      }
    ]
  });
});

test('REST requests are persisted to audit trail with success and error states', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-audit-rest-'));
  const dbPath = join(dir, 'audit.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
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
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      await fetch(`${baseUrl}/health`, {
        headers: {
          'x-actor-id': 'gpt-actions'
        }
      });

      await fetch(`${baseUrl}/api/files/file-123`);

      const events = auditService.listRecent(2);
      assert.equal(events.length, 2);

      const errorEvent = events[0];
      assert.equal(errorEvent.target, 'GET /api/files/file-123');
      assert.equal(errorEvent.status, 'error');
      assert.equal(errorEvent.errorCode, 'UNAUTHORIZED');
      assert.equal(errorEvent.actorId, 'anonymous-client');

      const successEvent = events[1];
      assert.equal(successEvent.target, 'GET /health');
      assert.equal(successEvent.status, 'success');
      assert.equal(successEvent.actorId, 'gpt-actions');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MCP tool execution is persisted to audit trail for success and error cases', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-audit-mcp-'));
  const dbPath = join(dir, 'audit.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    const auditService = new AuditService(db);

    await auditMcpToolExecution(auditService, 'figma_get_file', { fileKey: 'file-123' }, async () => ({
      ok: true
    }));

    await assert.rejects(
      () =>
        auditMcpToolExecution(
          auditService,
          'figma_render_node',
          { fileKey: 'file-123', token: 'secret' },
          async () => {
            throw new AppError('Dry run only', 400, 'DRY_RUN_ONLY');
          }
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, 'DRY_RUN_ONLY');
        return true;
      }
    );

    const events = auditService.listRecent(2);
    assert.equal(events.length, 2);
    assert.equal(events[0].target, 'figma_render_node');
    assert.equal(events[0].status, 'error');
    assert.equal(events[0].errorCode, 'DRY_RUN_ONLY');
    assert.deepEqual(events[0].params, {
      fileKey: 'file-123',
      token: '[REDACTED]'
    });
    assert.equal(events[1].target, 'figma_get_file');
    assert.equal(events[1].status, 'success');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
