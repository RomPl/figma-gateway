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
    assert.equal(result.plan.commands.length >= 10, true);
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

test('planner does not emit synthetic button label for frame-like interactive container that already has children', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-anchor-label-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Home.tsx'), `
      import React from 'react';
      export function Home() {
        return (
          <div data-ui-id="home.root">
            <a data-ui-id="home.cta">Create account<span data-ui-id="home.cta.icon">→</span></a>
          </div>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'home.root', tag: 'body', text: 'Create account', treePath: 'home.root',
        clientRect: { x: 0, y: 0, width: 1200, height: 700 },
        computedStyle: { display: 'block', width: 1200, height: 700 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [],
        children: [
          { uiId: 'home.cta', tag: 'a', text: 'Create account', treePath: 'home.root > home.cta', clientRect: { x: 100, y: 100, width: 220, height: 52 }, computedStyle: { display: 'inline-flex', width: 220, height: 52, backgroundColor: 'rgb(37, 99, 235)', borderRadius: 8, paddingTop: 16, paddingRight: 32, paddingBottom: 16, paddingLeft: 32, gap: 8, alignItems: 'center' }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1200, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'home.cta.icon', tag: 'span', text: '→', treePath: 'home.root > home.cta > home.cta.icon', clientRect: { x: 280, y: 118, width: 12, height: 16 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 16, width: 12, height: 16 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 700, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Home', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const syntheticLabel = result.plan.commands.find((item: any) => item.type === 'create_text' && item.payload?.uiId === 'home.cta.label');
    assert.equal(Boolean(syntheticLabel), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner emits atomic create_text payload for rendered-first text nodes instead of follow-up text mutations', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-atomic-text-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Home.tsx'), `
      import React from 'react';
      export function Home() {
        return <h3 data-ui-id="home.title">Hello</h3>;
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'home.title', tag: 'h3', text: 'Hello', treePath: 'home.title',
        clientRect: { x: 40, y: 40, width: 220, height: 56 },
        computedStyle: { color: 'rgb(2, 8, 23)', fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 28, textAlign: 'left', width: 220, height: 56 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: []
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Home', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const createText = result.plan.commands.find((item: any) => item.type === 'create_text' && item.payload?.uiId === 'home.title');
    assert.equal(Boolean(createText), true);
    assert.equal(createText.payload.fontSize, 20);
    assert.equal(createText.payload.width, 220);
    assert.equal(Array.isArray(createText.payload.fills), true);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'set_text_style' && item.payload?.nodeRef === 'home.title'), false);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'set_fill' && item.payload?.nodeRef === 'home.title'), false);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'set_size' && item.payload?.nodeRef === 'home.title'), false);
    assert.equal(result.plan.commands.some((item: any) => item.type === 'set_position' && item.payload?.nodeRef === 'home.title'), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner suppresses white fill on transparent centered layout wrapper containers', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-transparent-wrapper-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Page.tsx'), `
      import React from 'react';
      export function Page() {
        return (
          <div data-ui-id="page.root">
            <div data-ui-id="page.shell">
              <section data-ui-id="page.hero">Hello</section>
            </div>
          </div>
        );
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'page.root', tag: 'body', text: 'Hello', treePath: 'page.root',
        clientRect: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyle: { display: 'block', width: 1440, height: 900, backgroundColor: 'rgb(255,255,255)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: 'page.shell', tag: 'div', text: 'Hello', treePath: 'page.root > page.shell', clientRect: { x: 120, y: 40, width: 1200, height: 500 }, computedStyle: { display: 'block', width: 1200, height: 500, backgroundColor: 'rgb(255,255,255)', marginLeftAuto: true, marginRightAuto: true }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], meta: { rendered: { dom: { tag: 'div', className: 'relative mx-auto max-w-screen-xl' } } }, children: [
            { uiId: 'page.hero', tag: 'section', text: 'Hello', treePath: 'page.root > page.shell > page.hero', clientRect: { x: 120, y: 40, width: 1200, height: 500 }, computedStyle: { display: 'block', width: 1200, height: 500, backgroundColor: 'rgb(10,10,10)', borderRadius: 24 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Page', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const shellFill = result.plan.commands.find((item: any) => item.type === 'set_fill' && item.payload?.nodeRef === 'page.shell' && Array.isArray(item.payload?.fills) && item.payload.fills.length > 0);
    const shellFillReset = result.plan.commands.find((item: any) => item.type === 'set_fill' && item.payload?.nodeRef === 'page.shell' && Array.isArray(item.payload?.fills) && item.payload.fills.length === 0);
    assert.equal(Boolean(shellFill), false);
    assert.equal(Boolean(shellFillReset), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner keeps centered hero child aligned from parent width for justify-center flex wrappers', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-center-flex-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Page.tsx'), `
      import React from 'react';
      export function Page() {
        return <div data-ui-id="page.root"><div data-ui-id="page.centerWrap"><div data-ui-id="page.card">Hello</div></div></div>;
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'page.root', tag: 'body', text: 'Hello', treePath: 'page.root',
        clientRect: { x: 0, y: 0, width: 1200, height: 800 },
        computedStyle: { display: 'block', width: 1200, height: 800 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: 'page.centerWrap', tag: 'div', text: 'Hello', treePath: 'page.root > page.centerWrap', clientRect: { x: 0, y: 40, width: 1200, height: 200 }, computedStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: 1200, height: 200 }, visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'page.card', tag: 'div', text: 'Hello', treePath: 'page.root > page.centerWrap > page.card', clientRect: { x: 300, y: 70, width: 600, height: 140 }, computedStyle: { display: 'block', width: 600, height: 140, backgroundColor: 'rgb(20,20,20)', borderRadius: 24 }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1200, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Page', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const cardPosition = result.plan.commands.find((item: any) => item.type === 'set_position' && item.payload?.nodeRef === 'page.card');
    assert.equal(Boolean(cardPosition), false);
    const wrapAutoLayout = result.plan.commands.find((item: any) => item.type === 'set_auto_layout' && item.payload?.nodeRef === 'page.centerWrap');
    const wrapAlign = result.plan.commands.find((item: any) => item.type === 'set_alignment' && item.payload?.nodeRef === 'page.centerWrap');
    assert.equal(Boolean(wrapAutoLayout), true);
    assert.equal(wrapAlign?.payload?.alignment?.primaryAxisAlignItems, 'CENTER');
    assert.equal(wrapAlign?.payload?.alignment?.counterAxisAlignItems, 'CENTER');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner defers set_size until after children for auto-layout buttons with inline icon content', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-defer-button-size-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Header.tsx'), `
      import React from 'react';
      export function Header() {
        return <div data-ui-id="header.root"><button data-ui-id="header.login">Login</button></div>;
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'header.root', tag: 'div', text: 'Login', treePath: 'header.root',
        clientRect: { x: 0, y: 0, width: 400, height: 80 },
        computedStyle: { display: 'flex', width: 400, height: 80 },
        visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: 'header.login', tag: 'button', text: 'Login', treePath: 'header.root > header.login', clientRect: { x: 10, y: 10, width: 120, height: 36 }, computedStyle: { display: 'inline-flex', width: 120, height: 36, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 6 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: '__auto__/button[1]/svg[1]', tag: 'svg', text: undefined, treePath: 'header.root > header.login > icon', clientRect: { x: 22, y: 20, width: 16, height: 16 }, computedStyle: { display: 'block', width: 16, height: 16, color: 'rgb(2,8,23)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' }, asset: { layer: 'svg-icon', role: 'content' }, icon: { sourceType: 'inline-svg', textLabel: 'log-in', svgMarkup: '<svg viewBox="0 0 24 24"><path d="M15 3h4"/></svg>', fill: 'rgb(2,8,23)', stroke: 'rgb(2,8,23)', size: { width: 16, height: 16 }, placement: 'standalone' }, semantics: {}, breakpoint: { viewportWidth: 1280, viewportHeight: 800, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Header', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const commands = result.plan.commands;
    const createButtonIndex = commands.findIndex((item: any) => item.type === 'create_frame' && item.payload?.uiId === 'header.login');
    const labelIndex = commands.findIndex((item: any) => item.type === 'create_text' && item.payload?.uiId === 'header.login.label');
    const sizeIndex = commands.findIndex((item: any) => item.type === 'set_size' && item.payload?.nodeRef === 'header.login');
    assert.equal(createButtonIndex >= 0, true);
    assert.equal(labelIndex > createButtonIndex, true);
    assert.equal(sizeIndex > labelIndex, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner converts centered text-only block wrappers into vertical auto-layout stacks', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-text-stack-wrapper-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Section.tsx'), `
      import React from 'react';
      export function Section() {
        return <section data-ui-id="section.root"><div data-ui-id="section.copy"><h2 data-ui-id="section.title">How it works</h2><p data-ui-id="section.body">Three simple steps</p></div></section>;
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'section.root', tag: 'section', text: 'How it works Three simple steps', treePath: 'section.root',
        clientRect: { x: 0, y: 0, width: 1440, height: 320 },
        computedStyle: { display: 'block', width: 1440, height: 320, backgroundColor: 'rgb(2,8,23)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: 'section.copy', tag: 'div', text: 'How it works Three simple steps', treePath: 'section.root > section.copy', clientRect: { x: 464, y: 80, width: 512, height: 80 }, computedStyle: { display: 'block', width: 512, height: 80, textAlign: 'center' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'section.title', tag: 'h2', text: 'How it works', treePath: 'section.root > section.copy > section.title', clientRect: { x: 464, y: 80, width: 512, height: 40 }, computedStyle: { display: 'block', width: 512, height: 40, textAlign: 'center', color: 'rgb(225,231,239)', fontSize: 36, lineHeight: 40, fontWeight: '700' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
            { uiId: 'section.body', tag: 'p', text: 'Three simple steps', treePath: 'section.root > section.copy > section.body', clientRect: { x: 464, y: 136, width: 512, height: 24 }, computedStyle: { display: 'block', width: 512, height: 24, textAlign: 'center', color: 'rgb(148,163,184)', fontSize: 16, lineHeight: 24, fontWeight: '400' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Section', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const commands = result.plan.commands;
    const autoLayout = commands.find((item: any) => item.type === 'set_auto_layout' && item.payload?.nodeRef === 'section.copy');
    const titlePos = commands.find((item: any) => item.type === 'set_position' && item.payload?.nodeRef === 'section.title');
    const bodyPos = commands.find((item: any) => item.type === 'set_position' && item.payload?.nodeRef === 'section.body');
    const wrapperSize = commands.findIndex((item: any) => item.type === 'set_size' && item.payload?.nodeRef === 'section.copy');
    const titleCreate = commands.findIndex((item: any) => item.type === 'create_text' && item.payload?.uiId === 'section.title');
    const bodyCreate = commands.findIndex((item: any) => item.type === 'create_text' && item.payload?.uiId === 'section.body');
    assert.equal(autoLayout?.payload?.layoutMode, 'VERTICAL');
    assert.equal(autoLayout?.payload?.counterAxisAlignItems, 'CENTER');
    assert.equal(Boolean(titlePos), false);
    assert.equal(Boolean(bodyPos), false);
    assert.equal(wrapperSize > bodyCreate, true);
    assert.equal(bodyCreate > titleCreate, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
