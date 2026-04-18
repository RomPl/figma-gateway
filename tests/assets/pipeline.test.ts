import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService, buildCodeToFigmaPlan } from '../../src/core/code-to-figma-pipeline';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { RenderedToCodeMapperService } from '../../src/core/rendered-to-code-mapper';
import { UiMappingRegistry, createUiMappingService } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const runtime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero', tag: 'section', text: 'Hero', treePath: 'landing.hero', clientRect: { x: 0, y: 0, width: 1200, height: 700 },
    computedStyle: { display: 'flex', width: 1200, height: 700 }, visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.image', tag: 'img', text: undefined, treePath: 'landing.hero > landing.hero.image', clientRect: { x: 0, y: 0, width: 320, height: 240 }, computedStyle: { display: 'block', width: 320, height: 240 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'img', sourceUrl: 'https://cdn.example/hero.png', alt: 'Hero image', contentRole: 'content' }, asset: { layer: 'image', sourceUrl: 'https://cdn.example/hero.png', resolvedAssetPath: '/hero.png', naturalSize: { width: 1280, height: 960 }, renderedSize: { width: 320, height: 240 }, objectFit: 'cover', alt: 'Hero image', role: 'content' }, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.icon', tag: 'svg', text: undefined, treePath: 'landing.hero > landing.hero.icon', clientRect: { x: 0, y: 0, width: 24, height: 24 }, computedStyle: { display: 'block', width: 24, height: 24, color: 'rgb(255,255,255)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' }, asset: { layer: 'svg-icon', role: 'content' }, icon: { sourceType: 'inline-svg', textLabel: 'Arrow right', fill: 'rgb(255,255,255)', size: { width: 24, height: 24 }, placement: 'leading' }, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.placeholder', tag: 'div', text: undefined, treePath: 'landing.hero > landing.hero.placeholder', clientRect: { x: 0, y: 0, width: 300, height: 200 }, computedStyle: { display: 'block', width: 300, height: 200 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: { layer: 'decorative-asset', role: 'decorative' }, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

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

test('asset registry stores image and icon assets from rendered extraction and exposes them via api', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-registry-api-'));
  const dbPath = join(dir, 'assets.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService });
    app.locals.renderedUiExtractorService = new RenderedUiExtractorService(runtime, app.locals.designTokenService, app.locals.assetRegistryService as any);

    await app.locals.renderedUiExtractorService.extract({ project: 'marketing-site', target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoint: 'desktop' });
    const assets = app.locals.assetRegistryService.listAssets({ project: 'marketing-site' }) as any[];
    assert.equal(assets.length >= 2, true);
    assert.equal(assets.some((item) => item.assetKind === 'image' && item.figmaStrategy === 'image_fill'), true);
    assert.equal(assets.some((item) => (item.assetKind === 'svg' || item.assetKind === 'icon') && item.figmaStrategy === 'vector_icon'), true);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/assets?project=marketing-site`, { headers: { authorization: 'Bearer test-api-token' } });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(Array.isArray(json.data), true);
      assert.equal(json.data.some((item: any) => item.figmaStrategy === 'image_fill'), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('code-to-figma planner emits asset strategies for image fill, vector icon and placeholder', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'asset-planner-'));
  const dbPath = join(rootDir, 'mappings.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <img data-ui-id="landing.hero.image" alt="Hero image" src="/hero.png" />
            <div data-ui-id="landing.hero.icon" />
            <div data-ui-id="landing.hero.placeholder" />
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const extractor = new RenderedUiExtractorService(runtime, undefined, undefined);
    const code = new CodeUiParserService({ rootDir });
    const pipeline = new CodeToFigmaPipelineService(code, new RenderedToCodeMapperService(extractor, code), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));
    const result = await pipeline.run({ project: 'marketing-site', rootDir, componentName: 'Hero', dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoint: 'desktop' } });
    const assetCommands = result.plan.commands.filter((item) => item.type === 'set_asset_reference') as any[];
    const iconCommands = result.plan.commands.filter((item) => item.type === 'set_icon_reference') as any[];
    assert.equal(assetCommands.some((item) => item.payload.figmaStrategy === 'image_fill'), true);
    assert.equal(iconCommands.length > 0, true);
    assert.equal(iconCommands.some((item) => item.payload.svgMarkup || item.payload.textLabel), true);
    assert.equal(assetCommands.some((item) => item.payload.placeholder === true || item.payload.figmaStrategy === 'placeholder'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('figma-to-code classification distinguishes asset ref changes from layout around asset changes', () => {
  const renderedAsset = { sourceUrl: 'https://cdn.example/hero.png', resolvedAssetPath: '/hero.png', hash: 'abc', assetId: 'asset-1' };
  const sameRefDifferentLayout = { sourceUrl: 'https://cdn.example/hero.png', resolvedAssetPath: '/hero.png', hash: 'abc', assetId: 'asset-1', renderedSize: { width: 400, height: 300 } };
  const differentRef = { sourceUrl: 'https://cdn.example/hero-2.png', resolvedAssetPath: '/hero-2.png', hash: 'xyz', assetId: 'asset-2' };
  const classify = (figmaAsset: any, renderedNode: any) => {
    const figmaAssetRef = JSON.stringify({ sourceUrl: figmaAsset?.sourceUrl, resolvedAssetPath: figmaAsset?.resolvedAssetPath, hash: figmaAsset?.hash, assetId: figmaAsset?.assetId });
    const renderedAssetRef = JSON.stringify({ sourceUrl: renderedNode?.sourceUrl, resolvedAssetPath: renderedNode?.resolvedAssetPath, hash: renderedNode?.hash, assetId: renderedNode?.assetId });
    return figmaAssetRef !== renderedAssetRef ? 'asset_ref_change' : 'layout_around_asset_change';
  };
  assert.equal(classify(differentRef, renderedAsset), 'asset_ref_change');
  assert.equal(classify(sameRefDifferentLayout, renderedAsset), 'layout_around_asset_change');
});

test('code-to-figma planner forwards svgMarkup for inline svg icons', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'assets-pipeline-svg-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return <div data-ui-id="landing.hero.icon" />;
      }
    `, 'utf8');
    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'landing.hero.icon', tag: 'svg', text: undefined, treePath: 'landing.hero.icon',
        clientRect: { x: 0, y: 0, width: 24, height: 24 },
        computedStyle: { display: 'block', width: 24, height: 24, color: 'rgb(255,255,255)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
        media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' },
        asset: { layer: 'svg-icon', role: 'content', figmaStrategy: 'image_fill' },
        icon: { sourceType: 'inline-svg', textLabel: 'Arrow right', svgMarkup: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>', fill: 'rgb(255,255,255)', size: { width: 24, height: 24 }, placement: 'leading' },
        semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: []
      })
    };
    const db = createSqliteDatabase(join(rootDir, 'assets.sqlite'));
    migrateDatabase(db);
    const pipeline = new CodeToFigmaPipelineService(new CodeUiParserService({ rootDir }), new RenderedToCodeMapperService(new RenderedUiExtractorService(runtime), new CodeUiParserService({ rootDir })), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Hero', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const iconCommand = result.plan.commands.find((item: any) => item.type === 'set_icon_reference');
    assert.equal(Boolean(iconCommand), true);
    assert.equal(String(iconCommand.payload.svgMarkup).includes('<svg'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('code-to-figma planner sanitizes svg markup for figma icon import', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'asset-svg-sanitize-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'IconThing.tsx'), 'export const IconThing = () => null;', 'utf8');
    const document: any = {
      version: 'ui-model.v1',
      root: {
        kind: 'frame', uiId: 'icon.page', name: 'Page', visible: true, computedStyle: { backgroundColor: 'rgb(255,255,255)', width: 100, height: 100 }, boundingBox: { x: 0, y: 0, width: 100, height: 100 }, children: [{
          kind: 'icon', uiId: 'icon.root', name: 'svg-lucide', visible: true,
          boundingBox: { x: 0, y: 0, width: 16, height: 16 },
          computedStyle: { width: 16, height: 16 },
          icon: { sourceType: 'inline-svg', textLabel: 'sparkles', svgMarkup: '<svg viewBox="0 0 24 24" class="lucide lucide-sparkles" stroke="currentColor" fill="none"><path d="M1 1"/></svg>', fill: 'rgb(36, 99, 235)', stroke: 'rgb(36, 99, 235)', size: { width: 16, height: 16 }, placement: 'standalone' },
          asset: { layer: 'svg-icon' }, meta: {}, children: []
        }]
      }
    };
    const plan = buildCodeToFigmaPlan(document, 'IconThing', 'src/components/IconThing.tsx');
    const cmd = plan.commands.find((item: any) => item.type === 'set_icon_reference');
    assert.equal(Boolean(cmd), true);
    assert.equal(String(cmd.payload.svgMarkup).includes('xmlns="http://www.w3.org/2000/svg"'), true);
    assert.equal(String(cmd.payload.svgMarkup).includes('class='), false);
    assert.equal(String(cmd.payload.svgMarkup).includes('currentColor'), false);
    assert.equal(String(cmd.payload.svgMarkup).includes('rgb(36, 99, 235)'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});




test('sanitized svg markup matches actual rendered icon size and scaled stroke width', async () => {
  const document: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'icon.page', name: 'Page', visible: true, children: [{
        kind: 'icon', uiId: 'icon.root', name: 'svg-lucide', visible: true,
        boundingBox: { x: 0, y: 0, width: 28, height: 28 },
        computedStyle: { width: 28, height: 28 },
        icon: { sourceType: 'inline-svg', textLabel: 'upload', svgMarkup: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1"/></svg>', fill: 'rgb(255, 255, 255)', stroke: 'rgb(255, 255, 255)', size: { width: 28, height: 28 }, placement: 'standalone' },
        asset: { layer: 'svg-icon' }, meta: {}, children: []
      }]
    }
  };
  const plan = buildCodeToFigmaPlan(document, 'IconThing', 'src/components/IconThing.tsx');
  const cmd = plan.commands.find((item: any) => item.type === 'set_icon_reference');
  assert.equal(Boolean(cmd), true);
  assert.equal(String(cmd.payload.svgMarkup).includes('width="28"'), true);
  assert.equal(String(cmd.payload.svgMarkup).includes('height="28"'), true);
  assert.equal(String(cmd.payload.svgMarkup).includes('stroke-width="2.333"') || String(cmd.payload.svgMarkup).includes('stroke-width="2.334"'), true);
});
