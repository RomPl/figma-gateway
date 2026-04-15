import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { patchCodeFile } from '../../src/core/code-patcher';
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
          layoutMode: 'VERTICAL',
          itemSpacing: 24,
          paddingTop: 64,
          paddingRight: 64,
          paddingBottom: 64,
          paddingLeft: 64,
          fills: [{ type: 'SOLID', color: { r: 0.07, g: 0.13, b: 0.2 }, opacity: 1 }],
          cornerRadius: 24,
          children: [
            {
              id: '12:46',
              name: 'Hero Title',
              type: 'TEXT',
              visible: true,
              characters: 'Build way faster',
              fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
              fontName: { family: 'Inter', style: 'Bold' },
              fontSize: 48,
              textAlignHorizontal: 'CENTER'
            },
            {
              id: '12:47',
              name: 'Hero Subtitle',
              type: 'TEXT',
              visible: true,
              characters: 'Ship UI from design',
              fills: [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 }, opacity: 1 }],
              fontName: { family: 'Inter', style: 'Regular' },
              fontSize: 18,
              textAlignHorizontal: 'LEFT'
            },
            {
              id: '12:48',
              name: 'CTA Button',
              type: 'FRAME',
              visible: true,
              cornerRadius: 16,
              fills: [{ type: 'SOLID', color: { r: 0.15, g: 0.38, b: 0.92 }, opacity: 1 }],
              children: [
                {
                  id: '12:49',
                  name: 'CTA Label',
                  type: 'TEXT',
                  visible: true,
                  characters: 'Start now',
                  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
                  fontName: { family: 'Inter', style: 'Medium' },
                  fontSize: 16,
                  textAlignHorizontal: 'CENTER'
                }
              ]
            }
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

test('code patcher safely rewrites simple JSX subtree by uiId', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-patcher-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    const filePath = 'src/components/Hero.tsx';
    writeFileSync(
      join(rootDir, filePath),
      `
        import React from 'react';
        export function Hero() {
          return (
            <section data-ui-id="landing.hero" className="flex flex-col gap-4" onClick={trackHero}>
              <h1 data-ui-id="landing.hero.title">Build faster</h1>
              <button data-ui-id="landing.hero.cta" type="button">Start</button>
            </section>
          );
        }
      `,
      'utf8'
    );

    const result = patchCodeFile({
      rootDir,
      filePath,
      uiId: 'landing.hero',
      apply: true,
      node: {
        kind: 'section',
        uiId: 'landing.hero',
        name: 'Hero',
        visible: true,
        layout: { type: 'vertical', gap: 24 },
        padding: { top: 64, right: 64, bottom: 64, left: 64 },
        style: { fill: '#112233', radius: 24 },
        children: [
          {
            kind: 'text',
            uiId: 'landing.hero.title',
            role: 'headline',
            text: 'Build way faster',
            visible: true,
            style: { fill: '#ffffff', text: { fontSize: 48, textAlign: 'center' } },
            children: []
          },
          {
            kind: 'button',
            uiId: 'landing.hero.cta',
            name: 'CTA',
            text: 'Start now',
            visible: true,
            style: { fill: '#265fe0', radius: 16 },
            children: []
          }
        ]
      }
    });

    assert.equal(result.changed, true);
    const after = readFileSync(join(rootDir, filePath), 'utf8');
    assert.match(after, /Build way faster/);
    assert.match(after, /Start now/);
    assert.match(after, /onClick=\{trackHero\}/);
    assert.match(after, /type="button"/);
    assert.match(after, /className="flex flex-col gap-6 rounded-2xl"/);
    assert.match(after, /backgroundColor: '#112233'/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('figma-to-code pipeline diffs figma against code and applies safe visual patch', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'figma-to-code-'));
  const dbPath = join(rootDir, 'pipeline.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    const filePath = 'src/components/Hero.tsx';
    writeFileSync(
      join(rootDir, filePath),
      `
        import React from 'react';
        export function Hero() {
          return (
            <section data-ui-id="landing.hero" className="flex flex-col gap-4 rounded-lg">
              <h1 data-ui-id="landing.hero.title">Build faster</h1>
              <button data-ui-id="landing.hero.cta" type="button">Start</button>
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
      codeUiParserService: undefined
    });

    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero',
      project: 'marketing-site',
      semanticRole: 'container',
      code: {
        file: filePath,
        component: 'Hero',
        selector: 'section[data-ui-id="landing.hero"]',
        sourceRange: { lineStart: 4, lineEnd: 8 },
        jsxPath: 'Hero > section'
      },
      figma: {
        fileKey: 'abc123',
        nodeId: '12:45'
      },
      sync: {
        lastDirection: 'code_to_figma',
        lastSyncedAt: '2026-04-15T12:00:00Z'
      }
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/figma-to-code/sync`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          project: 'marketing-site',
          fileKey: 'abc123',
          rootDir,
          apply: true,
          uiIds: ['landing.hero']
        })
      });
      const json = (await response.json()) as { data: { diffs: Array<{ uiId: string; kinds: string[] }>; patches: Array<{ applied: boolean }> } };
      assert.equal(response.status, 200);
      assert.equal(json.data.diffs[0].uiId, 'landing.hero');
      assert.equal(json.data.diffs[0].kinds.length > 0, true);
      assert.equal(json.data.patches[0].applied, true);

      const after = readFileSync(join(rootDir, filePath), 'utf8');
      assert.match(after, /Build way faster/);
      assert.match(after, /Ship UI from design/);
      assert.match(after, /Start now/);

      const mappingResponse = await fetch(`${baseUrl}/api/ui-mappings/landing.hero`, {
        headers: { authorization: 'Bearer test-api-token' }
      });
      const mappingJson = (await mappingResponse.json()) as { data: { sync: { lastDirection: string } } };
      assert.equal(mappingResponse.status, 200);
      assert.equal(mappingJson.data.sync.lastDirection, 'figma_to_code');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
