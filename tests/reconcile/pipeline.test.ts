import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { buildUiReconcilePlan } from '../../src/core/ui-diff-engine';
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
          itemSpacing: 40,
          paddingTop: 64,
          paddingRight: 64,
          paddingBottom: 64,
          paddingLeft: 64,
          children: [
            {
              id: '12:46',
              name: 'Hero Title',
              type: 'TEXT',
              visible: true,
              characters: 'Build way faster',
              fontName: { family: 'Inter', style: 'Bold' },
              fontSize: 48,
              textAlignHorizontal: 'CENTER'
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

test('ui diff engine flags conflicting fields in reconcile mode', () => {
  const codeDocument = {
    version: 'ui-model.v1' as const,
    root: {
      kind: 'section' as const,
      uiId: 'landing.hero',
      visible: true,
      layout: { type: 'vertical' as const, gap: 32 },
      children: [
        {
          kind: 'text' as const,
          uiId: 'landing.hero.title',
          visible: true,
          text: 'Build much faster',
          children: []
        }
      ]
    }
  };
  const figmaDocument = {
    version: 'ui-model.v1' as const,
    root: {
      kind: 'section' as const,
      uiId: 'landing.hero',
      visible: true,
      layout: { type: 'vertical' as const, gap: 40 },
      children: [
        {
          kind: 'text' as const,
          uiId: 'landing.hero.title',
          visible: true,
          text: 'Build way faster',
          children: []
        }
      ]
    }
  };
  const mappings = [
    {
      uiId: 'landing.hero',
      project: 'marketing-site',
      code: { file: 'src/components/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      figma: { fileKey: 'abc123', nodeId: '12:45', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      sync: { lastDirection: 'bidirectional' as const },
      createdAt: '2026-04-15T12:00:00Z',
      updatedAt: '2026-04-15T12:00:00Z'
    }
  ];

  const plan = buildUiReconcilePlan('reconcile', codeDocument, figmaDocument, mappings, ['landing.hero']);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].uiId, 'landing.hero');
  assert.equal(plan.conflicts[0].fields.includes('layout'), true);
  assert.equal(plan.mergePlan.some((item) => item.target === 'conflict'), true);
});

test('reconcile route reports merge plan and conflicts from code, figma and synced state', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'reconcile-api-'));
  const dbPath = join(rootDir, 'reconcile.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(rootDir, 'src', 'components', 'Hero.tsx'),
      `
        import React from 'react';
        export function Hero() {
          return (
            <section data-ui-id="landing.hero" className="flex flex-col gap-8">
              <h1 data-ui-id="landing.hero.title">Build much faster</h1>
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
      auditService
    });

    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero',
      project: 'marketing-site',
      semanticRole: 'container',
      code: {
        file: 'src/components/Hero.tsx',
        component: 'Hero',
        selector: 'section[data-ui-id="landing.hero"]',
        snapshotHash: 'base-code',
        snapshot: {
          kind: 'section',
          uiId: 'landing.hero',
          visible: true,
          layout: { type: 'vertical', gap: 24 },
          children: [
            { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }
          ]
        }
      },
      figma: {
        fileKey: 'abc123',
        nodeId: '12:45',
        snapshotHash: 'base-figma',
        snapshot: {
          kind: 'section',
          uiId: 'landing.hero',
          visible: true,
          layout: { type: 'vertical', gap: 24 },
          children: [
            { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }
          ]
        }
      },
      sync: {
        lastDirection: 'bidirectional',
        lastSyncedAt: '2026-04-15T12:00:00Z',
        lastCodeHash: 'base-code',
        lastFigmaHash: 'base-figma'
      }
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/sync/reconcile`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          project: 'marketing-site',
          fileKey: 'abc123',
          rootDir,
          mode: 'reconcile',
          uiIds: ['landing.hero']
        })
      });
      const json = (await response.json()) as { data: { mode: string; conflicts: Array<{ uiId: string; fields: string[] }>; mergePlan: Array<{ target: string; fields: string[] }> } };
      assert.equal(response.status, 200);
      assert.equal(json.data.mode, 'reconcile');
      assert.equal(json.data.conflicts.length, 1);
      assert.equal(json.data.conflicts[0].uiId, 'landing.hero');
      assert.equal(json.data.conflicts[0].fields.includes('layout'), true);
      assert.equal(json.data.mergePlan.some((item) => item.target === 'conflict'), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
