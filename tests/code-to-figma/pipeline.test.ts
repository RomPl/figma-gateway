import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService, buildCodeToFigmaPlan } from '../../src/core/code-to-figma-pipeline';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { UiMappingRegistry, createUiMappingService } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { RenderedToCodeMapperService } from '../../src/core/rendered-to-code-mapper';

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

const mockRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero', tag: 'section', text: 'Build faster Start', treePath: 'landing.hero',
    clientRect: { x: 20, y: 40, width: 1280, height: 680 },
    computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 64, paddingRight: 64, paddingBottom: 64, paddingLeft: 64, width: 1280, height: 680, alignItems: 'center', justifyContent: 'center' },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 100, y: 100, width: 640, height: 72 }, computedStyle: { color: 'rgb(255, 255, 255)', fontFamily: 'Inter', fontSize: 56, textAlign: 'center', width: 640, height: 72, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.ctaIcon', tag: 'svg', text: undefined, treePath: 'landing.hero > landing.hero.ctaIcon', clientRect: { x: 100, y: 190, width: 20, height: 20 }, computedStyle: { color: 'rgb(255, 255, 255)', width: 20, height: 20, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' }, asset: { layer: 'svg-icon', role: 'content' }, icon: { sourceType: 'inline-svg', textLabel: 'Arrow right', fill: 'rgb(255, 255, 255)', size: { width: 20, height: 20 }, placement: 'leading' }, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.image', tag: 'img', text: undefined, treePath: 'landing.hero > landing.hero.image', clientRect: { x: 760, y: 120, width: 320, height: 240 }, computedStyle: { width: 320, height: 240, display: 'block', position: 'relative' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'img', sourceUrl: 'https://cdn.example/hero.png', alt: 'Hero image', contentRole: 'content' }, asset: { layer: 'image', sourceUrl: 'https://cdn.example/hero.png', resolvedAssetPath: '/hero.png', naturalSize: { width: 1280, height: 960 }, renderedSize: { width: 320, height: 240 }, objectFit: 'cover', alt: 'Hero image', role: 'content' }, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.panel', tag: 'div', text: 'Metrics', treePath: 'landing.hero > landing.hero.panel', clientRect: { x: 820, y: 380, width: 320, height: 180 }, computedStyle: { backgroundColor: 'rgb(30, 41, 59)', borderRadius: 20, display: 'block', width: 320, height: 180 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.cta', tag: 'button', text: 'Start', treePath: 'landing.hero > landing.hero.cta', clientRect: { x: 100, y: 220, width: 180, height: 48 }, computedStyle: { backgroundColor: 'rgb(38, 95, 224)', borderRadius: 16, fontFamily: 'Inter', fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 48 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

test('code-to-figma planner builds editable Figma-native execution plan from rendered-first visual model', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-plan-'));
  const dbPath = join(rootDir, 'mappings.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl" style={{ backgroundColor: '#112233' }}>
            <h1 data-ui-id="landing.hero.title" className="text-5xl text-center">Build faster</h1>
            <div data-ui-id="landing.hero.ctaIcon" />
            <img data-ui-id="landing.hero.image" alt="Hero image" src="/hero.png" />
            <div data-ui-id="landing.hero.panel">Metrics</div>
            <button data-ui-id="landing.hero.cta" className="rounded-lg">Start</button>
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const codeService = new CodeUiParserService({ rootDir });
    const renderedService = new RenderedUiExtractorService(mockRuntime);
    const pipeline = new CodeToFigmaPipelineService(codeService, new RenderedToCodeMapperService(renderedService, codeService), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));

    const result = await pipeline.run({
      project: 'marketing-site',
      componentName: 'Hero',
      rootDir,
      dryRun: true,
      fileKey: 'file-demo',
      render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' }
    });

    assert.equal(result.componentName, 'Hero');
    assert.equal(result.plan.actions.some((action) => action.type === 'create_frame'), true);
    assert.equal(result.plan.actions.some((action) => action.type === 'set_radius'), true);
    assert.equal(result.plan.actions.some((action) => action.type === 'set_icon'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'set_icon_reference'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'create_text'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'set_text_style'), true);
    assert.equal(result.plan.model.root.boundingBox?.width, 1280);
    assert.equal((result.plan.model.root.meta as any)?.planner?.visualSource, 'rendered-first');
    assert.equal(result.plan.commands.some((command) => command.type === 'rename_node'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'breakpoint-family'), true);
    assert.equal(result.plan.commands.some((command) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'variant-group-id'), true);
    assert.equal(result.notes.some((note) => note.includes('planning plugin-data')), true);
    assert.equal(result.hierarchySummary.nodeCount >= 5, true);
    assert.equal(result.hierarchySummary.containerCount >= 2, true);
    assert.equal(result.hierarchySummary.textCount >= 1, true);
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
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <div data-ui-id="landing.hero.ctaIcon" />
            <img data-ui-id="landing.hero.image" alt="Hero image" src="/hero.png" />
            <div data-ui-id="landing.hero.panel">Metrics</div>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, enableWriteActions: true, writeAllowedOperations: ['execute-plugin-batch'], codeUiParserService: new CodeUiParserService({ rootDir }), renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, { method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' }, body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' }) });
      const registrationJson = (await registration.json()) as { data: { sessionId: string; sessionToken: string } };
      const sessionId = registrationJson.data.sessionId;
      const sessionToken = registrationJson.data.sessionToken;

      const response = await fetch(`${baseUrl}/api/code-to-figma/build`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'marketing-site', componentName: 'Hero', rootDir, fileKey: 'abc123', sessionId, dryRun: false, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' } })
      });
      const json = (await response.json()) as { data: { queued: { status: string; commandId: string }; mappingCount: number; hierarchySummary: { nodeCount: number; containerCount: number; textCount: number }; notes: string[] } };
      assert.equal(response.status, 202);
      assert.equal(json.data.queued?.status, 'queued');
      assert.equal(json.data.mappingCount >= 3, true);
      assert.equal(json.data.hierarchySummary.nodeCount >= 3, true);
      assert.equal(json.data.hierarchySummary.containerCount >= 1, true);
      assert.equal(json.data.notes[0].includes('rendered snapshot'), true);

      const pendingResponse = await fetch(`${baseUrl}/api/plugin-bridge/sessions/${sessionId}/commands/pending`, { headers: { authorization: 'Bearer test-api-token', 'x-plugin-session-token': sessionToken } });
      const pendingJson = (await pendingResponse.json()) as { data: Array<{ type: string; payload: { commands?: Array<{ type: string }> } }> };
      assert.equal(pendingResponse.status, 200);
      assert.equal(pendingJson.data[0].type, 'execute-plugin-batch');
      assert.equal(Array.isArray(pendingJson.data[0].payload.commands), true);
      assert.equal(pendingJson.data[0].payload.commands?.some((command) => command.type === 'create_frame'), true);
      assert.equal(pendingJson.data[0].payload.commands?.some((command) => command.type === 'set_effects'), true);
      assert.equal(pendingJson.data[0].payload.commands?.some((command) => command.type === 'set_asset_reference'), true);

      const mappingResponse = await fetch(`${baseUrl}/api/ui-mappings/landing.hero`, { headers: { authorization: 'Bearer test-api-token' } });
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

test('code-to-figma build-breakpoints route produces breakpoint-specific variant refs', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-breakpoints-api-'));
  const dbPath = join(rootDir, 'pipeline-breakpoints.sqlite');
  const breakpointRuntime: RenderedUiRuntime = {
    capture: async (input) => ({
      uiId: 'landing.hero', tag: 'section', text: `Hero ${String(input.breakpointName || input.breakpoint || 'desktop')}`, treePath: 'landing.hero',
      clientRect: { x: 20, y: 40, width: input.viewport?.width ?? 1280, height: 680 },
      computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, width: input.viewport?.width ?? 1280, height: 680 },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1280, viewportHeight: input.viewport?.height ?? 680, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [],
      children: [{ uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 100, y: 100, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 56, display: 'block', width: 640, height: 72 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1280, viewportHeight: input.viewport?.height ?? 680, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [], children: [] }]
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
      const response = await fetch(`${baseUrl}/api/code-to-figma/build-breakpoints`, {
        method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'marketing-site', componentName: 'Hero', rootDir, dryRun: true, breakpoints: ['mobile', 'desktop'], render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } })
      });
      const json = (await response.json()) as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.resultsByBreakpoint.mobile.plan.model.root.uiId.endsWith('--mobile'), true);
      assert.equal(json.data.resultsByBreakpoint.desktop.plan.model.root.uiId.endsWith('--desktop'), true);
      assert.equal(json.data.variantGroup.variantGroupId, 'landing.hero');
      assert.equal(json.data.notes.some((note: string) => note.includes('single-breakpoint pipeline')), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('code-to-figma planner preserves shell/content work-surface metadata in planning notes and plugin data', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'section',
      uiId: 'dashboard.content',
      visible: true,
      responsive: { breakpointName: 'desktop', viewportWidth: 1440, viewportHeight: 900 },
      meta: {
        renderProfile: {
          surfaceMode: 'auth_gated_spa',
          authenticated: true,
          rootStrategy: 'preferred_selector',
          preferredRootSelectors: ['[data-authenticated-shell]'],
          preserveOuterShell: true,
          expectPersistentShell: true,
          allowBodyFallback: true,
          notes: ['render profile resolved in auth_gated_spa mode with selector-first root detection']
        },
        renderSurface: {
          shellSelectionMode: 'preferred-selector:main',
          contentSelectionMode: 'shell-content:section',
          shellPreserved: true,
          shellRootTag: 'main',
          contentRootTag: 'section'
        }
      },
      children: [{ kind: 'text', uiId: 'dashboard.content.title', visible: true, text: 'Overview', children: [] }]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Dashboard', 'src/app/dashboard/page.tsx');
  const shellPluginData = plan.commands.find((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'shell-selection-mode');
  const contentPluginData = plan.commands.find((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'content-selection-mode');
  assert.equal(shellPluginData?.payload?.pluginData?.value, 'preferred-selector:main');
  assert.equal(contentPluginData?.payload?.pluginData?.value, 'shell-content:section');
  const surfacePluginData = plan.commands.find((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'surface-mode');
  assert.equal(surfacePluginData?.payload?.pluginData?.value, 'auth_gated_spa');
});


test('code-to-figma pipeline reports comparable hierarchy against supplied reference summary', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-reference-'));
  const dbPath = join(rootDir, 'reference.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <div data-ui-id="landing.hero.panel">Metrics</div>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const code = new CodeUiParserService({ rootDir });
    const rendered = new RenderedUiExtractorService(mockRuntime);
    const pipeline = new CodeToFigmaPipelineService(code, new RenderedToCodeMapperService(rendered, code), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));
    const result = await pipeline.run({
      project: 'marketing-site',
      componentName: 'Hero',
      rootDir,
      dryRun: true,
      render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' },
      referenceHierarchySummary: { nodeCount: 6, sectionCount: 1, containerCount: 3, textCount: 2, buttonCount: 1, iconCount: 1, imageAssetCount: 1, maxDepth: 1 }
    });
    assert.equal(result.referenceComparison?.comparable, true);
    assert.equal(result.notes.some((note) => note.includes('Reference hierarchy comparison stayed within configured tolerance.')), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
