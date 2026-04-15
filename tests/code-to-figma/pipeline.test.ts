import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService } from '../../src/core/code-to-figma-pipeline';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { UiMappingRegistry, createUiMappingService } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

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

test('code-to-figma planner builds editable Figma-native execution plan from React code', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-plan-'));
  const dbPath = join(rootDir, 'mappings.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(rootDir, 'src', 'components', 'Hero.tsx'),
      `
        import React from 'react';
        export function Hero() {
          return (
            <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl" style={{ backgroundColor: '#112233' }}>
              <h1 data-ui-id="landing.hero.title" className="text-5xl text-center">Build faster</h1>
              <button data-ui-id="landing.hero.cta" className="rounded-lg">Start</button>
            </section>
          );
        }
      `,
      'utf8'
    );
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const pipeline = new CodeToFigmaPipelineService(
      new CodeUiParserService({ rootDir }),
      new PluginBridgeService(),
      createUiMappingService(new UiMappingRegistry(db))
    );

    const result = pipeline.run({
      project: 'marketing-site',
      componentName: 'Hero',
      rootDir,
      dryRun: true,
      fileKey: 'file-demo'
    });

    assert.equal(result.componentName, 'Hero');
    assert.equal(result.plan.actions.some((action) => action.type === 'create_section'), true);
    assert.equal(result.plan.actions.some((action) => action.type === 'create_text'), true);
    assert.equal(result.plan.actions.some((action) => action.type === 'set_auto_layout'), true);
    assert.equal(result.plan.actions.some((action) => action.type === 'set_text_style'), true);
    assert.equal(result.plan.commands[0].type, 'create_section');
    assert.equal(result.plan.commands.some((command) => command.type === 'create_text'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'set_fill'), true);
    assert.equal(result.mappingCount >= 3, true);
    assert.equal(result.queued, undefined);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('code-to-figma route queues plugin batch and persists mapping registry entries', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-api-'));
  const dbPath = join(rootDir, 'pipeline.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(rootDir, 'src', 'components', 'Hero.tsx'),
      `
        import React from 'react';
        export function Hero() {
          return (
            <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl">
              <h1 data-ui-id="landing.hero.title">Build faster</h1>
            </section>
          );
        }
      `,
      'utf8'
    );
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['execute-plugin-batch'],
      codeUiParserService: new CodeUiParserService({ rootDir })
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = (await registration.json()) as { data: { sessionId: string; sessionToken: string } };
      const sessionId = registrationJson.data.sessionId;
      const sessionToken = registrationJson.data.sessionToken;

      const response = await fetch(`${baseUrl}/api/code-to-figma/build`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          project: 'marketing-site',
          componentName: 'Hero',
          rootDir,
          fileKey: 'abc123',
          sessionId,
          dryRun: false
        })
      });
      const json = (await response.json()) as { data: { queued: { status: string; commandId: string }; mappingCount: number } };
      assert.equal(response.status, 202);
      assert.equal(json.data.queued.status, 'queued');
      assert.equal(json.data.mappingCount >= 2, true);

      const pendingResponse = await fetch(`${baseUrl}/api/plugin-bridge/sessions/${sessionId}/commands/pending`, {
        headers: {
          authorization: 'Bearer test-api-token',
          'x-plugin-session-token': sessionToken
        }
      });
      const pendingJson = (await pendingResponse.json()) as { data: Array<{ type: string; payload: { commands?: Array<{ type: string }> } }> };
      assert.equal(pendingResponse.status, 200);
      assert.equal(pendingJson.data[0].type, 'execute-plugin-batch');
      assert.equal(Array.isArray(pendingJson.data[0].payload.commands), true);
      assert.equal(pendingJson.data[0].payload.commands?.some((command) => command.type === 'create_section'), true);
      assert.equal(pendingJson.data[0].payload.commands?.some((command) => command.type === 'create_text'), true);

      const mappingResponse = await fetch(`${baseUrl}/api/ui-mappings/landing.hero`, {
        headers: {
          authorization: 'Bearer test-api-token'
        }
      });
      const mappingJson = (await mappingResponse.json()) as { data: { uiId: string; figma: { fileKey: string }; sync: { lastDirection: string } } };
      assert.equal(mappingResponse.status, 200);
      assert.equal(mappingJson.data.uiId, 'landing.hero');
      assert.equal(mappingJson.data.figma.fileKey, 'abc123');
      assert.equal(mappingJson.data.sync.lastDirection, 'code_to_figma');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
