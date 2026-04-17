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
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
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

const runtime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster Start',
    treePath: 'landing.hero',
    clientRect: { x: 20, y: 40, width: 1280, height: 680 },
    computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 64, paddingRight: 64, paddingBottom: 64, paddingLeft: 64, width: 1280, height: 680, alignItems: 'center', justifyContent: 'center' },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 120, y: 120, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 56, fontWeight: '700', lineHeight: 64, textAlign: 'center', width: 640, height: 72, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.cta', tag: 'button', text: 'Start', treePath: 'landing.hero > landing.hero.cta', clientRect: { x: 120, y: 220, width: 180, height: 48 }, computedStyle: { color: 'rgb(255,255,255)', backgroundColor: 'rgb(37,99,235)', borderRadius: 12, fontFamily: 'Inter', fontSize: 16, fontWeight: '600', lineHeight: 24, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 48 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

test('rendered-ui import route prepends deep-first exact uiId cleanup commands before live queueing', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-import-cleanup-'));
  const dbPath = join(rootDir, 'rendered-import.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
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
      codeUiParserService: new CodeUiParserService({ rootDir }),
      renderedUiExtractorService: new RenderedUiExtractorService(runtime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = await registration.json() as any;
      const sessionId = registrationJson.data.sessionId;
      const sessionToken = registrationJson.data.sessionToken;

      const response = await fetch(`${baseUrl}/api/rendered-ui/import-to-figma`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          project: 'marketing-site',
          target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' },
          rootDir,
          componentName: 'Hero',
          filePath: 'src/components/Hero.tsx',
          fileKey: 'abc123',
          sessionId,
          dryRun: false
        })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      const cleanup = json.data.plan.commands.slice(0, 3);
      assert.equal(cleanup.every((command: any) => command.type === 'delete_matching_nodes'), true);
      const cleanupUiIds = cleanup.map((command: any) => command.payload.query.uiId);
      assert.deepEqual(new Set(cleanupUiIds.slice(0, 2)), new Set(['landing.hero.title', 'landing.hero.cta']));
      assert.equal(cleanupUiIds[2], 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
