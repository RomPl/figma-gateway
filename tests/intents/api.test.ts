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

const runtime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster',
    treePath: 'landing.hero',
    clientRect: { x: 0, y: 0, width: 1440, height: 720 },
    computedStyle: { display: 'flex', flexDirection: 'column', gap: 24, width: 1440, height: 720, backgroundColor: 'rgb(15, 23, 42)' },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 },
    media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 0, y: 0, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 56, display: 'block', width: 640, height: 72 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.panel', tag: 'div', text: 'Metrics', treePath: 'landing.hero > landing.hero.panel', clientRect: { x: 780, y: 220, width: 320, height: 180 }, computedStyle: { backgroundColor: 'rgb(30,41,59)', borderRadius: 20, display: 'block', width: 320, height: 180 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.cta', tag: 'button', text: 'Start', treePath: 'landing.hero > landing.hero.cta', clientRect: { x: 0, y: 100, width: 180, height: 48 }, computedStyle: { color: 'rgb(255,255,255)', backgroundColor: 'rgb(37,99,235)', borderRadius: 12, display: 'inline-flex', width: 180, height: 48, alignItems: 'center', justifyContent: 'center' }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.icon', tag: 'svg', text: undefined, treePath: 'landing.hero > landing.hero.icon', clientRect: { x: 200, y: 110, width: 20, height: 20 }, computedStyle: { color: 'rgb(255,255,255)', width: 20, height: 20, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' }, asset: { layer: 'svg-icon', role: 'content' }, icon: { sourceType: 'inline-svg', textLabel: 'Arrow right', svgMarkup: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>', fill: 'rgb(255,255,255)', size: { width: 20, height: 20 }, placement: 'leading' }, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

test('intent API exposes visual-first high-level operations and executes wrapped pipelines through rendered phases', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'intent-api-'));
  const dbPath = join(rootDir, 'intent.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return <section data-ui-id="landing.hero"><h1 data-ui-id="landing.hero.title">Build faster</h1><div data-ui-id="landing.hero.panel">Metrics</div><button data-ui-id="landing.hero.cta">Start</button><div data-ui-id="landing.hero.icon" /></section>;
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

      const render = { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' };

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
            dryRun: false,
            render
          }
        })
      });
      const execJson = (await exec.json()) as { data: { intent: string; phases: string[]; artifacts: { visualSource: string; renderedNodeCount: number; tokenBoundNodeCount: number }; result: { queued: { status: string } } } };
      assert.equal(exec.status, 200);
      assert.equal(execJson.data.intent, 'reconstruct_design_from_code');
      assert.deepEqual(execJson.data.phases, ['snapshot_code', 'render_ui', 'normalize', 'token_resolve', 'diff', 'plan', 'batch']);
      assert.equal(execJson.data.artifacts.visualSource, 'rendered_ui_snapshot');
      assert.equal(execJson.data.artifacts.renderedNodeCount >= 1, true);
      assert.equal(execJson.data.result.queued.status, 'queued');

      const reconcile = await fetch(`${baseUrl}/api/intents/execute`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'reconcile_design_and_code',
          payload: { project: 'marketing-site', fileKey: 'abc123', rootDir, render }
        })
      });
      const reconcileJson = (await reconcile.json()) as { data: { intent: string; phases: string[]; artifacts: { visualSource: string }; result: { mode: string } } };
      assert.equal(reconcile.status, 200);
      assert.equal(reconcileJson.data.intent, 'reconcile_design_and_code');
      assert.deepEqual(reconcileJson.data.phases, ['snapshot_code', 'snapshot_figma', 'render_ui', 'normalize', 'token_resolve', 'diff', 'plan']);
      assert.equal(reconcileJson.data.artifacts.visualSource, 'rendered_ui_snapshot');
      assert.equal(reconcileJson.data.result.mode, 'reconcile');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('intent API can orchestrate multi-breakpoint reconstruct requests', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'intent-api-breakpoints-'));
  const dbPath = join(rootDir, 'intent-breakpoints.sqlite');
  const breakpointRuntime: RenderedUiRuntime = {
    capture: async (input) => ({
      uiId: 'landing.hero', tag: 'section', text: `Build ${String(input.breakpointName || input.breakpoint || 'desktop')}`, treePath: 'landing.hero',
      clientRect: { x: 0, y: 0, width: input.viewport?.width ?? 1440, height: 720 },
      computedStyle: { display: 'flex', flexDirection: 'column', gap: 24, width: input.viewport?.width ?? 1440, height: 720, backgroundColor: 'rgb(15, 23, 42)' },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1440, viewportHeight: input.viewport?.height ?? 900, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [],
      children: [{ uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 0, y: 0, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 56, display: 'block', width: 640, height: 72 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1440, viewportHeight: input.viewport?.height ?? 900, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [], children: [] }]
    })
  };
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `export function Hero(){return <section data-ui-id="landing.hero"><h1 data-ui-id="landing.hero.title">Build faster</h1></section>;}`, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, enableWriteActions: true, writeAllowedOperations: ['execute-plugin-batch'], codeUiParserService: new CodeUiParserService({ rootDir }), renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const exec = await fetch(`${baseUrl}/api/intents/execute`, {
        method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'reconstruct_design_from_code', payload: { project: 'marketing-site', componentName: 'Hero', rootDir, dryRun: true, breakpoints: ['mobile', 'desktop'], render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } } })
      });
      const json = (await exec.json()) as any;
      assert.equal(exec.status, 200);
      assert.equal(json.data.artifacts.breakpointCount, 2);
      assert.equal(json.data.result.resultsByBreakpoint.mobile.plan.model.root.uiId.endsWith('--mobile'), true);
      assert.equal(json.data.result.resultsByBreakpoint.desktop.plan.model.root.uiId.endsWith('--desktop'), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
