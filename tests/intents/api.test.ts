import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    document: {
      id: '0:1',
      name: 'Page 1',
      type: 'CANVAS',
      children: [{ id: '12:45', name: 'Hero', type: 'SECTION', visible: true, children: [] }]
    }
  }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

test('intent API exposes high-level agent operations and executes wrapped pipelines', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'intent-api-'));
  const dbPath = join(rootDir, 'intent.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return <section data-ui-id="landing.hero"><h1 data-ui-id="landing.hero.title">Build faster</h1></section>;
      }
    `, 'utf8');
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
      const intents = await fetch(`${baseUrl}/api/intents`, { headers: { authorization: 'Bearer test-api-token' } });
      const intentsJson = (await intents.json()) as { data: { intents: string[] } };
      assert.equal(intents.status, 200);
      assert.equal(intentsJson.data.intents.includes('reconstruct_design_from_code'), true);
      assert.equal(intentsJson.data.intents.includes('apply_tokens_to_figma'), true);

      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const regJson = (await registration.json()) as { data: { sessionId: string; sessionToken: string } };

      const exec = await fetch(`${baseUrl}/api/intents/execute`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'reconstruct_design_from_code',
          payload: {
            project: 'marketing-site',
            componentName: 'Hero',
            rootDir,
            fileKey: 'abc123',
            sessionId: regJson.data.sessionId,
            dryRun: false
          }
        })
      });
      const execJson = (await exec.json()) as { data: { intent: string; phases: string[]; result: { queued: { status: string } } } };
      assert.equal(exec.status, 200);
      assert.equal(execJson.data.intent, 'reconstruct_design_from_code');
      assert.equal(execJson.data.phases.includes('snapshot'), true);
      assert.equal(execJson.data.phases.includes('batch_low_level_operations'), true);
      assert.equal(execJson.data.result.queued.status, 'queued');

      const reconcile = await fetch(`${baseUrl}/api/intents/execute`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'reconcile_design_and_code',
          payload: { project: 'marketing-site', fileKey: 'abc123', rootDir }
        })
      });
      const reconcileJson = (await reconcile.json()) as { data: { intent: string; phases: string[]; result: { mode: string } } };
      assert.equal(reconcile.status, 200);
      assert.equal(reconcileJson.data.intent, 'reconcile_design_and_code');
      assert.equal(reconcileJson.data.phases.includes('merge_plan'), true);
      assert.equal(reconcileJson.data.result.mode, 'reconcile');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
