import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService } from '../../src/core/code-to-figma-pipeline';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { RenderedToCodeMapperService } from '../../src/core/rendered-to-code-mapper';
import { UiMappingRegistry, createUiMappingService } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const buildPipeline = (rootDir: string, runtime: RenderedUiRuntime) => {
  const dbPath = join(rootDir, 'mappings.sqlite');
  const db = createSqliteDatabase(dbPath);
  migrateDatabase(db);
  const code = new CodeUiParserService({ rootDir });
  const rendered = new RenderedUiExtractorService(runtime);
  return new CodeToFigmaPipelineService(code, new RenderedToCodeMapperService(rendered, code), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));
};

test('planner centers mx-auto containers and preserves flex-wrap as WRAP auto layout', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-align-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Page.tsx'), `
      import React from 'react';
      export function Page() {
        return (
          <main data-ui-id="page.root">
            <div data-ui-id="page.centered" />
            <div data-ui-id="page.tags">
              <span data-ui-id="page.tags.one">One</span>
              <span data-ui-id="page.tags.two">Two</span>
            </div>
          </main>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'page.root', tag: 'body', text: 'One Two', treePath: 'page.root',
        clientRect: { x: 0, y: 0, width: 1200, height: 800 },
        computedStyle: { display: 'block', width: 1200, height: 800 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [],
        children: [
          { uiId: 'page.centered', tag: 'div', text: undefined, treePath: 'page.root > page.centered', clientRect: { x: 300, y: 40, width: 600, height: 120 }, computedStyle: { display: 'block', width: 600, height: 120, marginLeftAuto: true, marginRightAuto: true }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] },
          { uiId: 'page.tags', tag: 'div', text: 'One Two', treePath: 'page.root > page.tags', clientRect: { x: 40, y: 220, width: 500, height: 100 }, computedStyle: { display: 'flex', flexWrap: 'wrap', gap: 12, width: 500, height: 100 }, visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'page.tags.one', tag: 'span', text: 'One', treePath: 'page.root > page.tags > page.tags.one', clientRect: { x: 40, y: 220, width: 80, height: 32 }, computedStyle: { display: 'inline-flex', width: 80, height: 32, backgroundColor: 'rgb(20,20,20)', borderRadius: 16 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] },
            { uiId: 'page.tags.two', tag: 'span', text: 'Two', treePath: 'page.root > page.tags > page.tags.two', clientRect: { x: 132, y: 220, width: 80, height: 32 }, computedStyle: { display: 'inline-flex', width: 80, height: 32, backgroundColor: 'rgb(20,20,20)', borderRadius: 16 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Page', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const centeredPosition = result.plan.commands.find((item: any) => item.type === 'set_position' && item.payload.nodeRef === 'page.centered') as any;
    assert.equal(centeredPosition.payload.x, 300);
    const wrapAutoLayout = result.plan.commands.find((item: any) => item.type === 'set_auto_layout' && item.payload.nodeRef === 'page.tags') as any;
    assert.equal(wrapAutoLayout.payload.layoutWrap, 'WRAP');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner renders unsupported blocks as red placeholders and skips impossible children', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-placeholder-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Page.tsx'), `
      import React from 'react';
      export function Page() {
        return (
          <main data-ui-id="page.root">
            <div data-ui-id="page.canvasBlock">
              <span data-ui-id="page.canvasBlock.label">Chart</span>
            </div>
          </main>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'page.root', tag: 'body', text: 'Chart', treePath: 'page.root',
        clientRect: { x: 0, y: 0, width: 1000, height: 700 },
        computedStyle: { display: 'block', width: 1000, height: 700 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1000, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [],
        children: [
          { uiId: 'page.canvasBlock', tag: 'canvas', text: undefined, treePath: 'page.root > page.canvasBlock', clientRect: { x: 40, y: 60, width: 480, height: 260 }, computedStyle: { display: 'block', width: 480, height: 260 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, guardrails: { unsupportedRegions: ['canvas'] }, breakpoint: { viewportWidth: 1000, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'page.canvasBlock.label', tag: 'span', text: 'Chart', treePath: 'page.root > page.canvasBlock > page.canvasBlock.label', clientRect: { x: 60, y: 80, width: 100, height: 24 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 16, width: 100, height: 24 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1000, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Page', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const placeholderFill = result.plan.commands.find((item: any) => item.type === 'set_fill' && item.payload.nodeRef === 'page.canvasBlock' && JSON.stringify(item.payload.fills).includes('1')) as any;
    assert.equal(Boolean(placeholderFill), true);
    const fallbackPluginData = result.plan.commands.find((item: any) => item.type === 'set_plugin_data' && item.payload.nodeRef === 'page.canvasBlock') as any;
    assert.equal(String(fallbackPluginData.payload.pluginData.value).includes('canvas'), true);
    const impossibleChildCommand = result.plan.commands.find((item: any) => item.payload && item.payload.uiId === 'page.canvasBlock.label');
    assert.equal(Boolean(impossibleChildCommand), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner does not collapse the whole synthetic rendered root into a placeholder for heuristic root guardrails', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-root-guardrails-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Home.tsx'), `
      import React from 'react';
      export function Home() {
        return (
          <div data-ui-id="home.root">
            <section data-ui-id="home.hero">
              <h1 data-ui-id="home.hero.title">Hello</h1>
            </section>
          </div>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: '__auto__/', tag: 'body', text: 'Hello', treePath: '__auto__/',
        clientRect: { x: 0, y: 0, width: 1200, height: 800 },
        computedStyle: { display: 'block', width: 1200, height: 800, backgroundColor: 'rgb(255,255,255)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: { layer: 'decorative-asset', role: 'content' }, icon: {}, semantics: {},
        guardrails: { runtimeBaseline: 'untrusted', dynamicStatefulBlock: true, unsupportedRegions: ['heuristic_node'] },
        breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [],
        children: [
          { uiId: 'home.root', tag: 'div', text: 'Hello', treePath: '__auto__/ > home.root', clientRect: { x: 0, y: 0, width: 1200, height: 800 }, computedStyle: { display: 'block', width: 1200, height: 800 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: { layer: 'decorative-asset', role: 'content' }, icon: {}, semantics: {}, guardrails: { runtimeBaseline: 'untrusted', dynamicStatefulBlock: true, unsupportedRegions: ['heuristic_node'] }, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'home.hero', tag: 'section', text: 'Hello', treePath: '__auto__/ > home.root > home.hero', clientRect: { x: 40, y: 40, width: 800, height: 240 }, computedStyle: { display: 'block', width: 800, height: 240, backgroundColor: 'rgb(20,20,20)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: { layer: 'decorative-asset', role: 'content' }, icon: {}, semantics: {}, guardrails: { runtimeBaseline: 'untrusted', dynamicStatefulBlock: true, unsupportedRegions: ['heuristic_node'] }, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
              { uiId: 'home.hero.title', tag: 'h1', text: 'Hello', treePath: '__auto__/ > home.root > home.hero > home.hero.title', clientRect: { x: 80, y: 80, width: 200, height: 40 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 32, width: 200, height: 40 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, guardrails: { runtimeBaseline: 'untrusted', dynamicStatefulBlock: true, unsupportedRegions: ['heuristic_node'] }, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] }
            ] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Home', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    assert.equal(result.plan.commands.some((item: any) => item.type === 'set_plugin_data' && item.payload?.pluginData?.key === 'render-fallback'), false);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'create_text' && item.payload?.uiId === 'home.hero.title'), true);
    assert.equal(result.plan.commands.length > 10, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner does not emit placeholder asset references for plain generic containers without real asset media', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-generic-container-assets-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Home.tsx'), `
      import React from 'react';
      export function Home() {
        return (
          <div data-ui-id="home.root">
            <section data-ui-id="home.hero">
              <div data-ui-id="home.hero.panel">
                <h2 data-ui-id="home.hero.title">Hello</h2>
              </div>
            </section>
          </div>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'home.root', tag: 'body', text: 'Hello', treePath: 'home.root',
        clientRect: { x: 0, y: 0, width: 1280, height: 800 },
        computedStyle: { display: 'block', width: 1280, height: 800, backgroundColor: 'rgb(255,255,255)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [],
        children: [
          { uiId: 'home.hero', tag: 'section', text: 'Hello', treePath: 'home.root > home.hero', clientRect: { x: 40, y: 40, width: 900, height: 400 }, computedStyle: { display: 'block', width: 900, height: 400, backgroundColor: 'rgb(20,20,20)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'home.hero.panel', tag: 'div', text: 'Hello', treePath: 'home.root > home.hero > home.hero.panel', clientRect: { x: 80, y: 80, width: 500, height: 200 }, computedStyle: { display: 'block', width: 500, height: 200, backgroundColor: 'rgb(30,30,30)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
              { uiId: 'home.hero.title', tag: 'h2', text: 'Hello', treePath: 'home.root > home.hero > home.hero.panel > home.hero.title', clientRect: { x: 120, y: 120, width: 160, height: 40 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 32, lineHeight: 40, width: 160, height: 40 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] }
            ] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Home', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const genericAssetRefs = result.plan.commands.filter((item: any) => item.type === 'set_asset_reference' && ['home.root', 'home.hero', 'home.hero.panel'].includes(String(item.payload?.nodeRef)));
    assert.equal(genericAssetRefs.length, 0);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'create_text' && item.payload?.uiId === 'home.hero.title'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
