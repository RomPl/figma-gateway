import assert from 'node:assert/strict';
import test from 'node:test';

import { createCachedFigmaReadClient } from '../../src/core/cache';
import { createMemoryCacheBackend } from '../../src/core/cache-memory';
import type { FigmaReadClient } from '../../src/core/figma-client';
import type {
  FigmaComponentSetsResponse,
  FigmaComponentsResponse,
  FigmaFileNode,
  FigmaFileResponse,
  FigmaImagesResponse,
  FigmaStylesResponse,
  FigmaVariablesResponse
} from '../../src/types/figma';

const createBaseClient = (calls: Record<string, number>): FigmaReadClient => ({
  getFile: async (fileKey: string): Promise<FigmaFileResponse> => {
    calls.getFile += 1;
    return {
      document: {
        id: `doc:${fileKey}`,
        name: `File ${fileKey}`,
        type: 'DOCUMENT'
      }
    };
  },
  getNode: async (fileKey: string, nodeId: string): Promise<FigmaFileNode | null> => {
    calls.getNode += 1;
    return {
      document: {
        id: nodeId,
        name: `${fileKey}:${nodeId}`,
        type: 'FRAME'
      }
    };
  },
  getNodes: async (_fileKey: string, nodeIds: string[]) => {
    calls.getNodes += 1;
    return Object.fromEntries(
      nodeIds.map((nodeId) => [
        nodeId,
        {
          document: {
            id: nodeId,
            name: `Node ${nodeId}`,
            type: 'FRAME'
          }
        }
      ])
    );
  },
  getImages: async (_fileKey: string, nodeIds: string[]): Promise<FigmaImagesResponse> => {
    calls.getImages += 1;
    return {
      images: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, `https://cdn.example/${nodeId}.png`]))
    };
  },
  getStyles: async (fileKey: string): Promise<FigmaStylesResponse> => {
    calls.getStyles += 1;
    return {
      status: 200,
      error: false,
      meta: {
        styles: [{ key: `style:${fileKey}`, file_key: fileKey, node_id: '1:2', style_type: 'FILL', name: 'Primary' }]
      }
    };
  },
  getComponents: async (fileKey: string): Promise<FigmaComponentsResponse> => {
    calls.getComponents += 1;
    return {
      status: 200,
      error: false,
      meta: {
        components: [{ key: `component:${fileKey}`, file_key: fileKey, node_id: '1:2', name: 'Button' }]
      }
    };
  },
  getComponentSets: async (fileKey: string): Promise<FigmaComponentSetsResponse> => {
    calls.getComponentSets += 1;
    return {
      status: 200,
      error: false,
      meta: {
        component_sets: [{ key: `set:${fileKey}`, file_key: fileKey, node_id: '1:2', name: 'Button/Primary' }]
      }
    };
  },
  getVariables: async (): Promise<FigmaVariablesResponse> => {
    calls.getVariables += 1;
    return {
      status: 200,
      error: false,
      meta: {
        variables: {},
        variableCollections: {}
      }
    };
  }
});

test('read-through cache returns hits for repeated file reads', async () => {
  const calls = {
    getFile: 0,
    getNode: 0,
    getNodes: 0,
    getImages: 0,
    getStyles: 0,
    getComponents: 0,
    getComponentSets: 0,
    getVariables: 0
  };
  const { client, cache } = createCachedFigmaReadClient(createBaseClient(calls), {
    backend: createMemoryCacheBackend()
  });

  await client.getFile('file-123');
  await client.getFile('file-123');

  assert.equal(calls.getFile, 1);
  assert.deepEqual(cache.getMetrics().byNamespace.files, {
    hits: 1,
    misses: 1,
    sets: 1,
    deletes: 0,
    clears: 0
  });
});

test('node cache is shared between batch and single-node reads', async () => {
  const calls = {
    getFile: 0,
    getNode: 0,
    getNodes: 0,
    getImages: 0,
    getStyles: 0,
    getComponents: 0,
    getComponentSets: 0,
    getVariables: 0
  };
  const { client, cache } = createCachedFigmaReadClient(createBaseClient(calls), {
    backend: createMemoryCacheBackend()
  });

  const batch = await client.getNodes('file-123', ['1:2', '1:3']);
  const single = await client.getNode('file-123', '1:2');
  const mixed = await client.getNodes('file-123', ['1:2', '1:4']);

  assert.equal(batch['1:2']?.document?.name, 'Node 1:2');
  assert.equal(single?.document?.id, '1:2');
  assert.equal(mixed['1:4']?.document?.id, '1:4');
  assert.equal(calls.getNodes, 2);
  assert.equal(calls.getNode, 0);
  assert.deepEqual(cache.getMetrics().byNamespace.nodes, {
    hits: 2,
    misses: 3,
    sets: 3,
    deletes: 0,
    clears: 0
  });
});

test('ttl expiration forces upstream refresh after expiry', async () => {
  let now = 1_000;
  const calls = {
    getFile: 0,
    getNode: 0,
    getNodes: 0,
    getImages: 0,
    getStyles: 0,
    getComponents: 0,
    getComponentSets: 0,
    getVariables: 0
  };
  const { client, cache } = createCachedFigmaReadClient(createBaseClient(calls), {
    backend: createMemoryCacheBackend({
      now: () => now
    }),
    ttlConfig: {
      files: 50,
      nodes: 50,
      styles: 50,
      components: 50,
      'component-sets': 50,
      variables: 50,
      'render-links': 50
    }
  });

  await client.getStyles('file-123');
  now += 25;
  await client.getStyles('file-123');
  now += 50;
  await client.getStyles('file-123');

  assert.equal(calls.getStyles, 2);
  assert.deepEqual(cache.getMetrics().byNamespace.styles, {
    hits: 1,
    misses: 2,
    sets: 2,
    deletes: 0,
    clears: 0
  });
});

test('manual invalidation clears file-scoped and render cache entries', async () => {
  const calls = {
    getFile: 0,
    getNode: 0,
    getNodes: 0,
    getImages: 0,
    getStyles: 0,
    getComponents: 0,
    getComponentSets: 0,
    getVariables: 0
  };
  const { client, cache } = createCachedFigmaReadClient(createBaseClient(calls), {
    backend: createMemoryCacheBackend()
  });

  await client.getFile('file-123');
  await client.getNode('file-123', '1:2');
  await client.getStyles('file-123');
  await client.getComponents('file-123');
  await client.getImages('file-123', ['1:2'], 'png');

  const deleted = await cache.invalidate({ fileKey: 'file-123' });

  await client.getFile('file-123');
  await client.getNode('file-123', '1:2');
  await client.getStyles('file-123');
  await client.getComponents('file-123');
  await client.getImages('file-123', ['1:2'], 'png');

  assert.equal(deleted, 5);
  assert.equal(calls.getFile, 2);
  assert.equal(calls.getNode, 2);
  assert.equal(calls.getStyles, 2);
  assert.equal(calls.getComponents, 2);
  assert.equal(calls.getImages, 2);
});
