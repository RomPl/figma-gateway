import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { createSqliteDatabase } from '../../src/db/sqlite';
import type { FigmaReadClient } from '../../src/core/figma-client';

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
      name: 'Resolved Node',
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

const startServer = async (dbPath: string) => {
  const app = createApp({
    figmaClient: createMockClient(),
    apiBearerToken: 'test-api-token',
    corsAllowedOrigins: ['https://chat.openai.com'],
    db: createSqliteDatabase(dbPath)
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
};

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

test('alias API can create, list, resolve and search aliases', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-alias-api-'));
  const dbPath = join(dir, 'aliases.sqlite');

  try {
    const server = await startServer(dbPath);

    try {
      const createResponse = await requestJson(server.baseUrl, '/api/aliases', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          alias: 'hero-primary',
          fileKey: 'file-1',
          nodeId: '1:2',
          project: 'marketing-site',
          tags: ['hero', 'primary'],
          description: 'Hero block'
        })
      });

      assert.equal(createResponse.status, 200);
      assert.equal((createResponse.json as { success: boolean }).success, true);

      const listResponse = await requestJson(server.baseUrl, '/api/aliases?project=marketing-site&limit=10');
      assert.equal(listResponse.status, 200);
      assert.equal(((listResponse.json as { data: unknown[] }).data).length, 1);

      const resolveResponse = await requestJson(server.baseUrl, '/api/resolve-alias', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          alias: 'hero-primary'
        })
      });

      assert.equal(resolveResponse.status, 200);
      assert.equal((resolveResponse.json as { data: { nodeId: string } }).data.nodeId, '1:2');

      const searchResponse = await requestJson(server.baseUrl, '/api/search/aliases', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          query: 'hero',
          tags: ['primary'],
          limit: 10
        })
      });

      assert.equal(searchResponse.status, 200);
      assert.equal(((searchResponse.json as { data: unknown[] }).data).length, 1);

      const getAliasResponse = await requestJson(server.baseUrl, '/api/aliases/hero-primary');
      assert.equal(getAliasResponse.status, 200);
      assert.equal((getAliasResponse.json as { data: { alias: string } }).data.alias, 'hero-primary');
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
