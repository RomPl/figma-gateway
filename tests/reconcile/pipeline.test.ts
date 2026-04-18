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
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    name: 'Landing',
    document: {
      id: '0:1', name: 'Page 1', type: 'CANVAS', visible: true,
      children: [{
        id: '12:45', name: 'Hero', type: 'SECTION', visible: true, layoutMode: 'VERTICAL', itemSpacing: 24, paddingTop: 64, paddingRight: 64, paddingBottom: 64, paddingLeft: 64,
        children: [{ id: '12:46', name: 'Hero Title', type: 'TEXT', visible: true, characters: 'Build faster', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 48, textAlignHorizontal: 'CENTER' }]
      }]
    }
  }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({}), getImages: async () => ({ images: {} }), getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }), getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }), getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }), getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

const mockRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero', tag: 'section', text: 'Build faster', treePath: 'landing.hero', clientRect: { x: 0, y: 0, width: 1200, height: 600 },
    computedStyle: { backgroundColor: 'rgb(17, 34, 51)', display: 'flex', flexDirection: 'column', gap: 24, width: 1200, height: 600 },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [{ uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 0, y: 0, width: 600, height: 60 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 48, textAlign: 'center', display: 'block', width: 600, height: 60 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }]
  })
};

test('ui diff engine performs four-state reconcile and exposes source-specific conflicts and priorities', () => {
  const codeDocument = {
    version: 'ui-model.v1' as const,
    root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, layout: { type: 'vertical' as const, gap: 32 }, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Build much faster', children: [] }] }
  };
  const renderedDocument = {
    version: 'ui-model.v1' as const,
    root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, layout: { type: 'vertical' as const, gap: 24 }, computedStyle: { gap: 24 }, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Build faster', computedStyle: { fontSize: 48 }, children: [] }] }
  };
  const figmaDocument = {
    version: 'ui-model.v1' as const,
    root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, layout: { type: 'vertical' as const, gap: 24 }, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Build way faster', children: [] }] }
  };
  const mappings = [{
    uiId: 'landing.hero', project: 'marketing-site',
    code: { file: 'src/components/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
    figma: { fileKey: 'abc123', nodeId: '12:45', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
    sync: { lastDirection: 'bidirectional' as const }, createdAt: '2026-04-15T12:00:00Z', updatedAt: '2026-04-15T12:00:00Z'
  }];

  const plan = buildUiReconcilePlan('reconcile', codeDocument, renderedDocument, figmaDocument, mappings, ['landing.hero']);
  assert.equal(plan.conflicts.length >= 1, true);
  assert.equal(plan.conflicts.some((item) => item.conflictType === 'ast_changed_render_unchanged'), true);
  assert.equal(plan.conflicts.some((item) => item.conflictType !== 'ast_changed_render_unchanged'), true);
  assert.equal(plan.mergePlan.some((item) => item.priorityBasis === 'structural_truth_ast'), false);
  assert.equal(plan.mergePlan.some((item) => item.target === 'conflict'), true);
});

test('reconcile route reports four-state merge plan, conflicts and priorities', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'reconcile-api-'));
  const dbPath = join(rootDir, 'reconcile.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero" className="flex flex-col gap-8">
            <h1 data-ui-id="landing.hero.title">Build much faster</h1>
          </section>
        );
      }
    `, 'utf8');

    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime) });

    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero', project: 'marketing-site', semanticRole: 'container',
      code: { file: 'src/components/Hero.tsx', component: 'Hero', selector: 'section[data-ui-id="landing.hero"]', snapshotHash: 'base-code', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      figma: { fileKey: 'abc123', nodeId: '12:45', snapshotHash: 'base-figma', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, layout: { type: 'vertical', gap: 24 }, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z', lastCodeHash: 'base-code', lastFigmaHash: 'base-figma' }
    });
    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero.title', project: 'marketing-site', semanticRole: 'headline',
      code: { file: 'src/components/Hero.tsx', component: 'Hero', selector: 'h1[data-ui-id="landing.hero.title"]', snapshotHash: 'base-title', snapshot: { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] } },
      figma: { fileKey: 'abc123', nodeId: '12:46', snapshotHash: 'base-title-figma', snapshot: { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z', lastCodeHash: 'base-title', lastFigmaHash: 'base-title-figma' }
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/sync/reconcile`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'marketing-site', fileKey: 'abc123', rootDir, mode: 'reconcile', uiIds: ['landing.hero', 'landing.hero.title'], render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' } })
      });
      const json = (await response.json()) as { data: { mode: string; rendered: { root: { uiId: string } }; conflicts: Array<{ uiId: string; conflictType: string }>; mergePlan: Array<{ target: string; priorityBasis?: string }> } };
      assert.equal(response.status, 200);
      assert.equal(json.data.mode, 'reconcile');
      assert.equal(json.data.rendered.root.uiId, 'landing.hero');
      assert.equal(json.data.conflicts.length >= 1, true);
      assert.equal(json.data.conflicts.some((item) => item.conflictType === 'ast_changed_render_unchanged' || item.conflictType === 'figma_changed_code_changed_differently'), true);
      assert.equal(json.data.mergePlan.some((item) => item.target === 'conflict'), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('ui diff engine mode actions prefer figma target in code_to_figma and code target in figma_to_code', () => {
  const codeDocument = { version: 'ui-model.v1' as const, root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, layout: { type: 'vertical' as const, gap: 32 }, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Code title', children: [] }] } };
  const renderedDocument = { version: 'ui-model.v1' as const, root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, responsive: { breakpointName: 'desktop', viewportWidth: 1440 }, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Rendered title', children: [] }] } };
  const figmaDocument = { version: 'ui-model.v1' as const, root: { kind: 'section' as const, uiId: 'landing.hero', visible: true, children: [{ kind: 'text' as const, uiId: 'landing.hero.title', visible: true, text: 'Figma title', children: [] }] } };
  const mappings = [{ uiId: 'landing.hero', project: 'marketing-site', code: { file: 'src/components/Hero.tsx', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Base title', children: [] }] } }, figma: { fileKey: 'abc123', nodeId: '12:45', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Base title', children: [] }] } }, sync: { lastDirection: 'bidirectional' as const }, createdAt: '2026-04-15T12:00:00Z', updatedAt: '2026-04-15T12:00:00Z' }];
  const codeToFigma = buildUiReconcilePlan('code_to_figma', codeDocument, renderedDocument, figmaDocument, mappings, ['landing.hero']);
  const figmaToCode = buildUiReconcilePlan('figma_to_code', codeDocument, renderedDocument, figmaDocument, mappings, ['landing.hero']);
  assert.equal(codeToFigma.mergePlan.every((item) => item.target === 'figma'), true);
  assert.equal(figmaToCode.mergePlan.every((item) => item.target === 'code'), true);
  assert.equal(codeToFigma.mergePlan.some((item) => String(item.reason).includes('desktop')), true);
});


test('reconcile-breakpoints route returns results by breakpoint', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'reconcile-breakpoints-api-'));
  const dbPath = join(rootDir, 'reconcile-breakpoints.sqlite');
  const breakpointRuntime: RenderedUiRuntime = {
    capture: async (input) => ({
      uiId: 'landing.hero', tag: 'section', text: `Hero ${String(input.breakpointName || input.breakpoint || 'desktop')}`, treePath: 'landing.hero', clientRect: { x: 0, y: 0, width: input.viewport?.width ?? 1200, height: 600 },
      computedStyle: { backgroundColor: 'rgb(17, 34, 51)', display: 'flex', flexDirection: 'column', gap: 24, width: input.viewport?.width ?? 1200, height: 600 },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1200, viewportHeight: input.viewport?.height ?? 900, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [],
      children: [{ uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 0, y: 0, width: 600, height: 60 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 48, textAlign: 'center', display: 'block', width: 600, height: 60 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1200, viewportHeight: input.viewport?.height ?? 900, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [], children: [] }]
    })
  };
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `export function Hero(){return <section data-ui-id="landing.hero"><h1 data-ui-id="landing.hero.title">Build faster</h1></section>;}`, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime) });
    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero', project: 'marketing-site', semanticRole: 'container',
      code: { file: 'src/components/Hero.tsx', component: 'Hero', snapshotHash: 'base-code', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      figma: { fileKey: 'abc123', nodeId: '12:45', snapshotHash: 'base-figma', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, children: [{ kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] }] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z' }
    });
    app.locals.uiMappingService.upsertUiMapping({
      uiId: 'landing.hero.title', project: 'marketing-site', semanticRole: 'headline',
      code: { file: 'src/components/Hero.tsx', component: 'Hero', snapshotHash: 'base-title', snapshot: { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] } },
      figma: { fileKey: 'abc123', nodeId: '12:46', snapshotHash: 'base-title-figma', snapshot: { kind: 'text', uiId: 'landing.hero.title', visible: true, text: 'Build faster', children: [] } },
      sync: { lastDirection: 'bidirectional', lastSyncedAt: '2026-04-15T12:00:00Z' }
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/sync/reconcile-breakpoints`, { method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' }, body: JSON.stringify({ project: 'marketing-site', fileKey: 'abc123', rootDir, mode: 'reconcile', breakpoints: ['mobile', 'desktop'], render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } }) });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.resultsByBreakpoint.mobile.mode, 'reconcile');
      assert.equal(json.data.resultsByBreakpoint.desktop.mode, 'reconcile');
      assert.equal(json.data.notes.some((note: string) => note.includes('single-breakpoint reconcile pipeline')), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
