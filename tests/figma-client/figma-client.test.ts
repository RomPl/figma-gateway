import assert from 'node:assert/strict';
import test from 'node:test';

import { FigmaClient, FigmaClientError } from '../../src/core/figma-client';
import type { FigmaImageFormat } from '../../src/types/figma';

type FetchCall = {
  input: URL | RequestInfo;
  init?: RequestInit;
};

const createJsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });

const createClient = (
  fetchImpl: typeof fetch,
  overrides?: Partial<ConstructorParameters<typeof FigmaClient>[0]>
) =>
  new FigmaClient({
    token: 'test-token',
    baseUrl: 'https://api.figma.com',
    timeoutMs: 50,
    maxRetries: 0,
    fetch: fetchImpl,
    sleep: async () => undefined,
    logger: {
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined
    },
    ...overrides
  });

test('getFile requests /v1/files/:fileKey', async () => {
  const calls: FetchCall[] = [];
  const client = createClient(async (input, init) => {
    calls.push({ input, init });
    return createJsonResponse({
      document: {
        id: '0:1',
        name: 'Document',
        type: 'DOCUMENT'
      }
    });
  });

  const response = await client.getFile('abc123');

  assert.equal(response.document.id, '0:1');
  assert.equal((calls[0].input as URL).toString(), 'https://api.figma.com/v1/files/abc123');
  assert.equal((calls[0].init?.headers as Record<string, string>)['X-Figma-Token'], 'test-token');
});

test('getNode unwraps a single node from /nodes response', async () => {
  const client = createClient(async () =>
    createJsonResponse({
      nodes: {
        '1:2': {
          document: {
            id: '1:2',
            name: 'Button',
            type: 'COMPONENT'
          }
        }
      }
    })
  );

  const response = await client.getNode('file-key', '1:2');

  assert.ok(response);
  assert.equal(response?.document?.name, 'Button');
});

test('getNodes joins node ids into ids query parameter', async () => {
  let requestUrl = '';
  const client = createClient(async (input) => {
    requestUrl = (input as URL).toString();
    return createJsonResponse({
      nodes: {
        '1:2': null,
        '1:3': null
      }
    });
  });

  const response = await client.getNodes('file-key', ['1:2', '1:3']);

  assert.deepEqual(Object.keys(response), ['1:2', '1:3']);
  assert.match(requestUrl, /ids=1%3A2%2C1%3A3/);
});

test('getImages passes ids and format', async () => {
  let requestUrl = '';
  const client = createClient(async (input) => {
    requestUrl = (input as URL).toString();
    return createJsonResponse({
      images: {
        '1:2': 'https://cdn.example/image.png'
      }
    });
  });

  const response = await client.getImages('file-key', ['1:2'], 'png' satisfies FigmaImageFormat);

  assert.equal(response.images['1:2'], 'https://cdn.example/image.png');
  assert.match(requestUrl, /format=png/);
  assert.match(requestUrl, /ids=1%3A2/);
});

test('library endpoints resolve expected payloads', async (t) => {
  await t.test('getStyles', async () => {
    const client = createClient(async () =>
      createJsonResponse({
        status: 200,
        error: false,
        meta: { styles: [{ key: 'style', file_key: 'file', node_id: '1:2', style_type: 'FILL', name: 'Color' }] }
      })
    );

    const response = await client.getStyles('file-key');
    assert.equal(response.meta.styles[0].name, 'Color');
  });

  await t.test('getComponents', async () => {
    const client = createClient(async () =>
      createJsonResponse({
        status: 200,
        error: false,
        meta: { components: [{ key: 'comp', file_key: 'file', node_id: '1:2', name: 'Button' }] }
      })
    );

    const response = await client.getComponents('file-key');
    assert.equal(response.meta.components[0].name, 'Button');
  });

  await t.test('getComponentSets', async () => {
    const client = createClient(async () =>
      createJsonResponse({
        status: 200,
        error: false,
        meta: { component_sets: [{ key: 'set', file_key: 'file', node_id: '1:2', name: 'Button/Primary' }] }
      })
    );

    const response = await client.getComponentSets('file-key');
    assert.equal(response.meta.component_sets[0].name, 'Button/Primary');
  });

  await t.test('getVariables uses local variables endpoint', async () => {
    let requestUrl = '';
    const client = createClient(async (input) => {
      requestUrl = (input as URL).toString();
      return createJsonResponse({
        status: 200,
        error: false,
        meta: {
          variables: {
            color: {
              id: 'color',
              name: 'Color/Primary',
              key: 'key',
              variableCollectionId: 'collection',
              resolvedType: 'COLOR',
              valuesByMode: {}
            }
          },
          variableCollections: {}
        }
      });
    });

    const response = await client.getVariables('file-key');

    assert.ok(response.meta.variables.color);
    assert.equal(requestUrl, 'https://api.figma.com/v1/files/file-key/variables/local');
  });
});

test('retries on 429 and succeeds on next attempt', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const client = createClient(
    async () => {
      attempts += 1;

      if (attempts === 1) {
        return createJsonResponse(
          {
            status: 429,
            err: 'Rate limited'
          },
          429,
          { 'retry-after': '0' }
        );
      }

      return createJsonResponse({
        document: {
          id: '0:1',
          name: 'Recovered',
          type: 'DOCUMENT'
        }
      });
    },
    {
      maxRetries: 1,
      sleep: async (ms) => {
        delays.push(ms);
      }
    }
  );

  const response = await client.getFile('file-key');

  assert.equal(response.document.name, 'Recovered');
  assert.equal(attempts, 2);
  assert.equal(delays.length, 1);
});

test('normalizes 403 Figma errors', async () => {
  const client = createClient(async () =>
    createJsonResponse(
      {
        status: 403,
        message: 'Invalid scope'
      },
      403
    )
  );

  await assert.rejects(
    () => client.getVariables('file-key'),
    (error: unknown) => {
      assert.ok(error instanceof FigmaClientError);
      assert.equal(error.code, 'FIGMA_FORBIDDEN');
      assert.equal(error.statusCode, 403);
      assert.equal(error.figmaStatus, 403);
      return true;
    }
  );
});

test('aborts timed out requests and normalizes timeout error', async () => {
  const client = createClient(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })
  );

  await assert.rejects(
    () => client.getFile('file-key'),
    (error: unknown) => {
      assert.ok(error instanceof FigmaClientError);
      assert.equal(error.code, 'FIGMA_TIMEOUT');
      assert.equal(error.statusCode, 504);
      return true;
    }
  );
});

test('rejects empty node id lists before request', async () => {
  const client = createClient(async () => createJsonResponse({}));

  await assert.rejects(
    () => client.getNodes('file-key', []),
    (error: unknown) => {
      assert.ok(error instanceof FigmaClientError);
      assert.equal(error.code, 'FIGMA_BAD_REQUEST');
      return true;
    }
  );
});

test('logger bindings never include token values', async () => {
  const bindings: Record<string, unknown>[] = [];
  const client = createClient(async () =>
    createJsonResponse({
      document: {
        id: '0:1',
        name: 'Document',
        type: 'DOCUMENT'
      }
    }),
    {
      logger: {
        debug: (payload) => bindings.push(payload),
        warn: (payload) => bindings.push(payload),
        error: (payload) => bindings.push(payload)
      }
    }
  );

  await client.getFile('file-key');

  assert.ok(bindings.length > 0);
  assert.equal(JSON.stringify(bindings).includes('test-token'), false);
});
