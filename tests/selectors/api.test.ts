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
    name: 'Landing',
    document: {
      id: '0:1',
      name: 'Page 1',
      type: 'CANVAS',
      visible: true,
      children: [
        {
          id: '12:45',
          name: 'Hero',
          type: 'SECTION',
          visible: true,
          children: [
            { id: '12:46', name: 'Get started', type: 'TEXT', visible: true, characters: 'Get started' },
            { id: '12:47', name: 'Footer', type: 'SECTION', visible: true, children: [] }
          ]
        }
      ]
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

test('selector resolver supports human block addressing by uiId, name, text and fuzzy match', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'selector-api-'));
  const dbPath = join(rootDir, 'selectors.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Landing.tsx'), `
      import React from 'react';
      export function Landing() {
        return (
          <main data-ui-id="landing.page">
            <section data-ui-id="landing.hero">
              <h1 data-ui-id="landing.hero.title">Build faster</h1>
              <button data-ui-id="landing.hero.cta">Get started</button>
            </section>
            <footer data-ui-id="landing.footer">Footer</footer>
          </main>
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
      codeUiParserService: new CodeUiParserService({ rootDir })
    });

    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero',
      project: 'marketing-site',
      semanticRole: 'container',
      code: { file: 'src/components/Landing.tsx', component: 'Landing', snapshot: { uiId: 'landing.hero', kind: 'section', visible: true, children: [] } },
      figma: { fileKey: 'abc123', nodeId: '12:45', snapshot: { uiId: 'landing.hero', kind: 'section', visible: true, children: [] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z' }
    });
    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero.cta',
      project: 'marketing-site',
      semanticRole: 'button-primary',
      code: { file: 'src/components/Landing.tsx', component: 'Landing', snapshot: { uiId: 'landing.hero.cta', kind: 'button', visible: true, text: 'Get started', children: [] } },
      figma: { fileKey: 'abc123', nodeId: '12:46', snapshot: { uiId: 'landing.hero.cta', kind: 'button', visible: true, text: 'Get started', children: [] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z' }
    });
    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.footer',
      project: 'marketing-site',
      semanticRole: 'container',
      code: { file: 'src/components/Landing.tsx', component: 'Landing', snapshot: { uiId: 'landing.footer', kind: 'section', visible: true, children: [] } },
      figma: { fileKey: 'abc123', nodeId: '12:47', snapshot: { uiId: 'landing.footer', kind: 'section', visible: true, children: [] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z' }
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const hero = await fetch(`${baseUrl}/api/selectors/resolve`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'hero', project: 'marketing-site', rootDir, fileKey: 'abc123' })
      });
      const heroJson = (await hero.json()) as { data: { matches: Array<{ uiId: string; kind: string[] }> } };
      assert.equal(hero.status, 200);
      assert.equal(heroJson.data.matches[0].uiId, 'landing.hero');

      const uiId = await fetch(`${baseUrl}/api/selectors/resolve`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'landing.hero', project: 'marketing-site', rootDir, fileKey: 'abc123' })
      });
      const uiIdJson = (await uiId.json()) as { data: { matches: Array<{ uiId: string }> } };
      assert.equal(uiIdJson.data.matches[0].uiId, 'landing.hero');

      const button = await fetch(`${baseUrl}/api/selectors/resolve`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'button with text "Get started"', project: 'marketing-site', rootDir, fileKey: 'abc123' })
      });
      const buttonJson = (await button.json()) as { data: { matches: Array<{ uiId: string; reasons: string[] }> } };
      assert.equal(buttonJson.data.matches[0].uiId, 'landing.hero.cta');

      const footer = await fetch(`${baseUrl}/api/selectors/resolve`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'foter', project: 'marketing-site', rootDir, fileKey: 'abc123' })
      });
      const footerJson = (await footer.json()) as { data: { matches: Array<{ uiId: string; kind: string[] }> } };
      assert.equal(footerJson.data.matches[0].uiId, 'landing.footer');
      assert.equal(footerJson.data.matches[0].kind.includes('fuzzy'), true);

      const intent = await fetch(`${baseUrl}/api/intents/execute`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'sync_block_to_figma',
          payload: {
            project: 'marketing-site',
            selector: 'hero',
            rootDir,
            fileKey: 'abc123',
            dryRun: true
          }
        })
      });
      const intentJson = (await intent.json()) as { data: { result: { plan: { model: { root: { uiId: string } } } } } };
      assert.equal(intent.status, 200);
      assert.equal(intentJson.data.result.plan.model.root.uiId, 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
