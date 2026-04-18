import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { createSqliteDatabase } from '../../src/db/sqlite';
import type { BrowserRendererService } from '../../src/core/browser-renderer';
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

type TestServer = {
  baseUrl: string;
  apiToken: string;
  close: () => Promise<void>;
  app: ReturnType<typeof createApp>;
};

const startServer = async (browserRendererService?: BrowserRendererService): Promise<TestServer> => {
  const apiToken = 'test-api-token';
  const app = createApp({
    figmaClient: createMockClient(),
    apiBearerToken: apiToken,
    browserRendererService,
    db: createSqliteDatabase(':memory:')
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to get test server address');

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiToken,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

const requestJson = async (baseUrl: string, path: string, init?: RequestInit, token = 'test-api-token') => {
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const json = await response.json() as unknown;
  return { status: response.status, json };
};

test('POST /api/rendered-ui/open-page returns browser-render metadata through injected renderer service', async () => {
  const calls: any[] = [];
  const browserRendererService: BrowserRendererService = {
    openPage: async (input) => {
      calls.push(input);
      return {
        resolvedUrl: 'https://example.com/landing',
        title: 'Landing',
        finalUrl: 'https://example.com/landing?ready=1',
        htmlLength: 3210,
        targetMode: 'existing_url',
        pageAudit: {
          hasAuthWall: false,
          hasPrivateInputs: false,
          hasInfiniteScroll: false,
          hasAnimatedRegions: true,
          hasCarousel: false,
          hasCanvas: false,
          hasWebgl: false,
          riskyRegions: ['animated_regions'],
          reasons: []
        }
      };
    },
    withPage: async () => {
      throw new Error('withPage should not be called by open-page route test');
    }
  };

  const server = await startServer(browserRendererService);
  try {
    const { status, json } = await requestJson(
      server.baseUrl,
      '/api/rendered-ui/open-page',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: { mode: 'existing_url', url: 'https://example.com/landing' },
          waitUntil: 'domcontentloaded',
          guardrails: { allowAuthenticatedPages: true }
        })
      },
      server.apiToken
    );

    assert.equal(status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(json, {
      success: true,
      data: {
        resolvedUrl: 'https://example.com/landing',
        title: 'Landing',
        finalUrl: 'https://example.com/landing?ready=1',
        htmlLength: 3210,
        targetMode: 'existing_url',
        pageAudit: {
          hasAuthWall: false,
          hasPrivateInputs: false,
          hasInfiniteScroll: false,
          hasAnimatedRegions: true,
          hasCarousel: false,
          hasCanvas: false,
          hasWebgl: false,
          riskyRegions: ['animated_regions'],
          reasons: []
        }
      }
    });
  } finally {
    await server.close();
  }
});

test('GET /api/assets/:assetId returns stored asset registry record', async () => {
  const server = await startServer();
  try {
    const created = server.app.locals.assetRegistryService.upsertAsset({
      assetId: 'marketing-site:landing.hero.image:abcd1234ef567890',
      project: 'marketing-site',
      uiId: 'landing.hero.image',
      assetKind: 'image',
      sourcePath: '/hero.png',
      resolvedUrl: 'https://cdn.example/hero.png',
      hash: 'abcd1234ef567890abcd1234ef567890',
      width: 1280,
      height: 960,
      role: 'content',
      figmaStrategy: 'image_fill',
      metadata: { alt: 'Hero image' }
    });

    const { status, json } = await requestJson(
      server.baseUrl,
      `/api/assets/${encodeURIComponent(created.assetId)}`,
      undefined,
      server.apiToken
    );

    assert.equal(status, 200);
    assert.deepEqual(json, {
      success: true,
      data: created
    });
  } finally {
    await server.close();
  }
});
