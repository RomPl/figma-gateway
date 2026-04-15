import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { FigmaClientError, type FigmaReadClient } from '../../src/core/figma-client';
import type {
  FigmaComponentSetsResponse,
  FigmaComponentsResponse,
  FigmaFileNode,
  FigmaFileResponse,
  FigmaImagesResponse,
  FigmaStylesResponse,
  FigmaVariablesResponse
} from '../../src/types/figma';

type TestServer = {
  baseUrl: string;
  apiToken: string;
  close: () => Promise<void>;
};

const sampleFile: FigmaFileResponse = {
  name: 'Design System',
  document: {
    id: '0:1',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '1:1',
        name: 'Landing Hero',
        type: 'FRAME',
        children: [
          {
            id: '1:2',
            name: 'CTA Button',
            type: 'TEXT',
            characters: 'Get Started'
          },
          {
            id: '1:3',
            name: 'Footer Link',
            type: 'TEXT',
            characters: 'Contact Us'
          }
        ]
      }
    ]
  }
};

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => sampleFile,
  getNode: async (_fileKey: string, nodeId: string): Promise<FigmaFileNode | null> => ({
    document: {
      id: nodeId,
      name: 'Mock Node',
      type: 'FRAME'
    }
  }),
  getNodes: async (_fileKey: string, nodeIds: string[]) =>
    Object.fromEntries(
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
    ),
  getImages: async (_fileKey: string, nodeIds: string[]): Promise<FigmaImagesResponse> => ({
    images: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, `https://cdn.example/${nodeId}.png`]))
  }),
  getStyles: async (): Promise<FigmaStylesResponse> => ({
    status: 200,
    error: false,
    meta: {
      styles: [{ key: 'style', file_key: 'file', node_id: '1:2', style_type: 'FILL', name: 'Primary' }]
    }
  }),
  getComponents: async (): Promise<FigmaComponentsResponse> => ({
    status: 200,
    error: false,
    meta: {
      components: [{ key: 'component', file_key: 'file', node_id: '1:2', name: 'Button' }]
    }
  }),
  getComponentSets: async (): Promise<FigmaComponentSetsResponse> => ({
    status: 200,
    error: false,
    meta: {
      component_sets: [{ key: 'set', file_key: 'file', node_id: '1:2', name: 'Button/Primary' }]
    }
  }),
  getVariables: async (): Promise<FigmaVariablesResponse> => ({
    status: 200,
    error: false,
    meta: {
      variables: {},
      variableCollections: {}
    }
  })
});

const startServer = async (
  figmaClient: FigmaReadClient,
  overrides?: Partial<{
    apiBearerToken: string;
    corsAllowedOrigins: string[];
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  }>
): Promise<TestServer> => {
  const apiToken = overrides?.apiBearerToken ?? 'test-api-token';
  const app = createApp({
    figmaClient,
    apiBearerToken: apiToken,
    corsAllowedOrigins: overrides?.corsAllowedOrigins ?? ['https://chat.openai.com'],
    rateLimitWindowMs: overrides?.rateLimitWindowMs ?? 60000,
    rateLimitMaxRequests: overrides?.rateLimitMaxRequests ?? 60
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiToken,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
};

const requestJson = async (
  baseUrl: string,
  path: string,
  init?: RequestInit,
  token = 'test-api-token'
) => {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });
  const json = (await response.json()) as unknown;

  return {
    status: response.status,
    json,
    headers: response.headers
  };
};

test('GET /api/files/:fileKey returns unified success payload', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json, headers } = await requestJson(
      server.baseUrl,
      '/api/files/file-123',
      undefined,
      server.apiToken
    );

    assert.equal(status, 200);
    assert.ok(headers.get('x-request-id'));
    assert.deepEqual(json, {
      success: true,
      data: sampleFile
    });
  } finally {
    await server.close();
  }
});

test('GET /api/files/:fileKey/nodes/:nodeId returns node data', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/files/file-123/nodes/1%3A2',
      undefined,
      server.apiToken
    );

    assert.equal(status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        document: {
          id: '1:2',
          name: 'Mock Node',
          type: 'FRAME'
        }
      }
    });
  } finally {
    await server.close();
  }
});

test('POST /api/nodes/batch validates request body', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/nodes/batch',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          nodeIds: []
        })
      },
      server.apiToken
    );

    assert.equal(status, 400);
    assert.deepEqual(json, {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'body.nodeIds: Too small: expected array to have >=1 items'
      }
    });
  } finally {
    await server.close();
  }
});

test('GET library routes return read-only figma data', async () => {
  const server = await startServer(createMockClient());

  try {
    const [styles, components, componentSets] = await Promise.all([
      requestJson(server.baseUrl, '/api/files/file-123/styles', undefined, server.apiToken),
      requestJson(server.baseUrl, '/api/files/file-123/components', undefined, server.apiToken),
      requestJson(server.baseUrl, '/api/files/file-123/component-sets', undefined, server.apiToken)
    ]);

    assert.equal(styles.status, 200);
    assert.equal(components.status, 200);
    assert.equal(componentSets.status, 200);
    assert.equal((styles.json as { success: boolean }).success, true);
    assert.equal((components.json as { success: boolean }).success, true);
    assert.equal((componentSets.json as { success: boolean }).success, true);
  } finally {
    await server.close();
  }
});

test('POST /api/render proxies image rendering through internal client', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/render',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          nodeIds: ['1:2'],
          format: 'png'
        })
      },
      server.apiToken
    );

    assert.equal(status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        images: {
          '1:2': 'https://cdn.example/1:2.png'
        }
      }
    });
  } finally {
    await server.close();
  }
});

test('POST /api/search/by-name searches by node name only', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/search/by-name',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          query: 'button',
          limit: 10
        })
      },
      server.apiToken
    );

    assert.equal(status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        query: 'button',
        count: 1,
        results: [
          {
            id: '1:2',
            name: 'CTA Button',
            type: 'TEXT',
            characters: 'Get Started'
          }
        ]
      }
    });
  } finally {
    await server.close();
  }
});

test('POST /api/search/by-text searches by text content only', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/search/by-text',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          query: 'contact',
          limit: 10
        })
      },
      server.apiToken
    );

    assert.equal(status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        query: 'contact',
        count: 1,
        results: [
          {
            id: '1:3',
            name: 'Footer Link',
            type: 'TEXT',
            characters: 'Contact Us'
          }
        ]
      }
    });
  } finally {
    await server.close();
  }
});

test('normalized figma errors preserve unified error payload', async () => {
  const failingClient: FigmaReadClient = {
    ...createMockClient(),
    getFile: async () => {
      throw new FigmaClientError({
        message: 'Invalid scope',
        code: 'FIGMA_FORBIDDEN',
        statusCode: 403,
        endpoint: '/v1/files/file-123/variables/local'
      });
    }
  };

  const server = await startServer(failingClient);

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/search/by-name',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          query: 'button'
        })
      },
      server.apiToken
    );

    assert.equal(status, 403);
    assert.deepEqual(json, {
      success: false,
      error: {
        code: 'FIGMA_FORBIDDEN',
        message: 'Invalid scope'
      }
    });
  } finally {
    await server.close();
  }
});

test('GET /api/files/:fileKey returns 401 without bearer token', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(server.baseUrl, '/api/files/file-123', undefined, '');

    assert.equal(status, 401);
    assert.deepEqual(json, {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing bearer token'
      }
    });
  } finally {
    await server.close();
  }
});

test('GET /api/files/:fileKey returns 403 with invalid bearer token', async () => {
  const server = await startServer(createMockClient());

  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/files/file-123',
      undefined,
      'wrong-token'
    );

    assert.equal(status, 403);
    assert.deepEqual(json, {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid bearer token'
      }
    });
  } finally {
    await server.close();
  }
});
