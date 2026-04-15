import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import type { FigmaReadClient } from '../../src/core/figma-client';

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

test('GET /capabilities exposes fixed MVP v1 scope', async () => {
  const app = createApp({
    figmaClient: createMockClient(),
    apiBearerToken: 'test-api-token',
    enableWriteActions: true,
    writeAllowedOperations: ['create-frame', 'execute-plugin-command', 'execute-plugin-batch']
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/capabilities`);
    const json = (await response.json()) as {
      data: {
        capabilities: {
          mvpScope: {
            version: string;
            code: { frameworks: string[]; languages: string[] };
            workflows: { canCreateFigmaMockupFromCode: boolean; canSyncSimpleVisualChangesBackToCode: boolean };
            excludes: string[];
          };
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(json.data.capabilities.mvpScope.version, 'v1');
    assert.deepEqual(json.data.capabilities.mvpScope.code.frameworks, ['React']);
    assert.deepEqual(json.data.capabilities.mvpScope.code.languages, ['TypeScript']);
    assert.equal(json.data.capabilities.mvpScope.workflows.canCreateFigmaMockupFromCode, true);
    assert.equal(json.data.capabilities.mvpScope.workflows.canSyncSimpleVisualChangesBackToCode, true);
    assert.equal(json.data.capabilities.mvpScope.excludes.includes('complex business logic'), true);
    assert.equal(json.data.capabilities.mvpScope.excludes.includes('animations'), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
