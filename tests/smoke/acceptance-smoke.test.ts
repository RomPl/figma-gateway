import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AliasRegistry, type AliasService } from '../../src/core/alias-registry';
import { AuditService } from '../../src/core/audit';
import type { DesignContextService } from '../../src/core/design-context';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { createFigmaWriteService } from '../../src/core/figma-write-service';
import type { FigmaGatewayService } from '../../src/core/figma-gateway-service';
import type { FigmaWriteAdapter } from '../../src/core/figma-write-types';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';
import { registerFigmaTools } from '../../src/mcp/tools';

type RegisteredTool = {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  handler: (input: unknown) => Promise<unknown>;
  executor: (input: unknown) => Promise<unknown>;
  enabled: boolean;
};

type FakeMcpServer = {
  _registeredTools: Record<string, RegisteredTool>;
  registerTool: (name: string, config: Record<string, unknown>, handler: (input: unknown) => Promise<unknown>) => void;
};

const createFakeMcpServer = (): FakeMcpServer => ({
  _registeredTools: {},
  registerTool(name, config, handler) {
    this._registeredTools[name] = {
      title: typeof config.title === 'string' ? config.title : undefined,
      description: typeof config.description === 'string' ? config.description : undefined,
      inputSchema: config.inputSchema,
      handler,
      executor: handler,
      enabled: true
    };
  }
});

const createMockClient = (): FigmaReadClient => ({
  getFile: async (fileKey) => ({
    name: `File ${fileKey}`,
    document: {
      id: '0:1',
      name: 'Document',
      type: 'DOCUMENT'
    }
  }),
  getNode: async (_fileKey, nodeId) => ({
    document: {
      id: nodeId,
      name: 'Smoke Node',
      type: 'FRAME'
    }
  }),
  getNodes: async (_fileKey, nodeIds) =>
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
  getImages: async (_fileKey, nodeIds) => ({
    images: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, `https://cdn.example/${nodeId}.png`]))
  }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

const createMockGatewayService = (): FigmaGatewayService => ({
  getFile: async ({ fileKey }) => ({ document: { id: `doc:${fileKey}`, name: 'Document', type: 'DOCUMENT' } }),
  getNode: async ({ nodeId }) => ({ document: { id: nodeId, name: 'Smoke Node', type: 'FRAME' } }),
  getNodesBatch: async ({ nodeIds }) =>
    Object.fromEntries(nodeIds.map((nodeId) => [nodeId, { document: { id: nodeId, name: `Node ${nodeId}`, type: 'FRAME' } }])),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  renderNodes: async ({ nodeIds }) => ({ images: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, `https://cdn.example/${nodeId}.png`])) }),
  searchByName: async ({ query }) => ({ query, count: 1, results: [{ id: '1:2', name: 'Hero', type: 'FRAME' }] }),
  searchByText: async ({ query }) => ({ query, count: 1, results: [{ id: '1:3', name: 'CTA', type: 'TEXT', characters: 'Get Started' }] })
});

const createMockDesignContextService = (): DesignContextService => ({
  getDesignContext: async ({ nodeId }) => ({ summary: { id: nodeId, name: 'Smoke Node', type: 'FRAME' } }),
  getLayoutSummary: async ({ nodeId }) => ({ summary: { id: nodeId, name: 'Smoke Node', type: 'FRAME' } })
});

const createAliasServices = (registry: AliasRegistry): AliasService => ({
  resolveAlias: (input) => registry.resolve(input),
  searchAliases: (input) => registry.search(input),
  getDesignBlock: async ({ alias }) => {
    const resolved = registry.resolve({ alias });
    return {
      alias: resolved,
      node: {
        document: {
          id: resolved.nodeId,
          name: 'Resolved Block',
          type: 'FRAME'
        }
      }
    };
  }
});

const createAdapterSpy = (calls: string[]): FigmaWriteAdapter => ({
  createFrame: async (request) => {
    calls.push(request.operation);
    return { id: 'frame-1', name: request.input.name };
  },
  updateText: async (request) => {
    calls.push(request.operation);
    return { id: request.input.nodeId, text: request.input.text };
  },
  createSection: async (request) => {
    calls.push(request.operation);
    return { id: 'section-1', name: request.input.name };
  },
  duplicateBlock: async (request) => {
    calls.push(request.operation);
    return { id: 'duplicate-1', nodeId: request.input.nodeId };
  },
  applyStyleFromAlias: async (request) => {
    calls.push(request.operation);
    return { id: request.input.nodeId, alias: request.input.sourceAlias.alias };
  }
});

const startHttpServer = async (dbPath: string) => {
  const db = createSqliteDatabase(dbPath);
  migrateDatabase(db);
  const auditService = new AuditService(db);
  const aliasRegistry = new AliasRegistry(db);
  aliasRegistry.upsert({
    alias: 'hero-primary',
    fileKey: 'file-smoke',
    nodeId: '1:2',
    project: 'marketing-site',
    tags: ['hero'],
    description: 'Hero block'
  });

  const app = createApp({
    figmaClient: createMockClient(),
    apiBearerToken: 'smoke-token',
    corsAllowedOrigins: ['https://chat.openai.com', 'https://chatgpt.com'],
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 5,
    db,
    auditService
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to obtain smoke server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

const request = async (baseUrl: string, path: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  return {
    status: response.status,
    headers: response.headers,
    json: (await response.json()) as unknown
  };
};

test('acceptance smoke: REST, GPT Actions, dry-run write, auth/security, MCP read-only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-acceptance-smoke-'));
  const dbPath = join(dir, 'smoke.sqlite');

  try {
    const server = await startHttpServer(dbPath);

    try {
      const health = await request(server.baseUrl, '/health');
      assert.equal(health.status, 200);
      assert.equal((health.json as { success: boolean }).success, true);

      const restReadOnly = await request(server.baseUrl, '/api/files/file-smoke', {
        headers: {
          authorization: 'Bearer smoke-token'
        }
      });
      assert.equal(restReadOnly.status, 200);
      assert.equal((restReadOnly.json as { success: boolean }).success, true);

      const gptPreflight = await fetch(`${server.baseUrl}/api/files/file-smoke`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://chat.openai.com',
          'access-control-request-method': 'GET'
        }
      });
      assert.equal(gptPreflight.status, 204);
      assert.equal(gptPreflight.headers.get('access-control-allow-origin'), 'https://chat.openai.com');

      const dryRunCalls: string[] = [];
      const db = createSqliteDatabase(join(dir, 'mcp.sqlite'));
      migrateDatabase(db);
      const auditService = new AuditService(db);
      const aliasRegistry = new AliasRegistry(db);
      aliasRegistry.upsert({
        alias: 'hero-primary',
        fileKey: 'file-smoke',
        nodeId: '1:2',
        project: 'marketing-site',
        tags: ['hero'],
        description: 'Hero block'
      });
      const writeService = createFigmaWriteService({
        aliasRegistry,
        adapter: createAdapterSpy(dryRunCalls),
        enabled: true,
        allowedOperations: ['create-frame', 'apply-style-from-alias']
      });
      const mcpServer = createFakeMcpServer();
      registerFigmaTools(
        mcpServer as any,
        createMockGatewayService(),
        createAliasServices(aliasRegistry),
        createMockDesignContextService(),
        writeService,
        auditService
      );

      const registeredTools = mcpServer._registeredTools;
      assert.ok(registeredTools.figma_get_file);
      assert.ok(registeredTools.figma_resolve_alias);
      assert.ok(registeredTools.figma_create_frame);

      const mcpReadOnly = (await registeredTools.figma_get_file.executor({ fileKey: 'file-smoke' })) as {
        content: Array<{ text: string }>;
      };
      const mcpPayload = JSON.parse(mcpReadOnly.content[0].text) as { document: { id: string } };
      assert.equal(mcpPayload.document.id, 'doc:file-smoke');

      const mcpDryRun = (await registeredTools.figma_create_frame.executor({
        fileKey: 'file-smoke',
        parentNodeId: '1:1',
        name: 'Hero',
        width: 1440,
        height: 320,
        dryRun: true
      })) as {
        content: Array<{ text: string }>;
      };
      const mcpDryRunPayload = JSON.parse(mcpDryRun.content[0].text) as { performed: boolean; dryRun: boolean };
      assert.equal(mcpDryRunPayload.performed, false);
      assert.equal(mcpDryRunPayload.dryRun, true);
      assert.deepEqual(dryRunCalls, []);

      const unauthorized = await request(server.baseUrl, '/api/files/file-smoke');
      assert.equal(unauthorized.status, 401);

      const forbidden = await request(server.baseUrl, '/api/files/file-smoke', {
        headers: {
          authorization: 'Bearer wrong-token'
        }
      });
      assert.equal(forbidden.status, 403);

      const rateStatuses: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        const response = await request(server.baseUrl, '/api/files/file-smoke', {
          headers: {
            authorization: 'Bearer smoke-token'
          }
        });
        rateStatuses.push(response.status);
      }
      assert.deepEqual(rateStatuses, [200, 200, 200, 200, 429]);

      const auditEvents = auditService.listRecent(4);
      assert.ok(auditEvents.some((event) => event.target === 'figma_get_file' && event.status === 'success'));
      assert.ok(auditEvents.some((event) => event.target === 'figma_create_frame' && event.status === 'success'));
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
