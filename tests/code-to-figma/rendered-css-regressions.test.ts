import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService, buildCodeToFigmaPlan } from '../../src/core/code-to-figma-pipeline';
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
    const styleCommand = result.plan.commands.find((item: any) => item.type === 'set_text_style' && item.payload?.nodeRef === 'home.title');
    assert.equal(Boolean(styleCommand), true);
    assert.equal(styleCommand.payload.fontStyle, 'Bold');
    const contentCommand = result.plan.commands.find((item: any) => item.type === 'set_text_content' && item.payload?.nodeRef === 'home.title');
    assert.equal(Boolean(contentCommand), true);
    assert.equal(contentCommand.payload.text, 'Hello');
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
          { uiId: '__auto__/section[1]/div[1]', tag: 'div', text: 'How it works Three simple steps', treePath: 'section.root > section.copy', clientRect: { x: 464, y: 80, width: 512, height: 80 }, computedStyle: { display: 'block', width: 512, height: 80, textAlign: 'center' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
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
    assert.equal(['CENTER','MIN',undefined].includes(autoLayout?.payload?.counterAxisAlignItems), true);
    assert.equal(Boolean(titlePos), false);
    assert.equal(Boolean(bodyPos), false);
    assert.equal(wrapperSize > bodyCreate, true);
    assert.equal(bodyCreate > titleCreate, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner skips transparent text-only wrappers and attaches heading copy directly to visual parent', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'css-regression-skip-text-wrapper-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Section.tsx'), `
      import React from 'react';
      export function Section() {
        return <section data-ui-id="section.root"><div><h2 data-ui-id="section.title">How it works</h2><p data-ui-id="section.desc">Three simple steps</p></div></section>;
      }
    `, 'utf8');

    const runtime: RenderedUiRuntime = {
      capture: async () => ({
        uiId: 'section.root', tag: 'section', text: 'How it works Three simple steps', treePath: 'section.root',
        clientRect: { x: 0, y: 0, width: 1280, height: 352 },
        computedStyle: { display: 'block', width: 1280, height: 352, backgroundColor: 'rgb(2,8,23)' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: '__auto__/section[1]/div[1]', tag: 'div', text: 'How it works Three simple steps', treePath: 'section.root > section.copy', clientRect: { x: 384, y: 0, width: 512, height: 80 }, computedStyle: { display: 'block', width: 512, height: 80, backgroundColor: 'rgba(0, 0, 0, 0)' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'section.title', tag: 'h2', text: 'How it works', treePath: 'section.root > section.copy > section.title', clientRect: { x: 384, y: 0, width: 512, height: 40 }, computedStyle: { display: 'block', width: 512, height: 40, color: 'rgb(225,231,239)', fontSize: 36, lineHeight: 40, fontWeight: '700', textAlign: 'center' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
            { uiId: 'section.desc', tag: 'p', text: 'Three simple steps', treePath: 'section.root > section.copy > section.desc', clientRect: { x: 384, y: 56, width: 512, height: 24 }, computedStyle: { display: 'block', width: 512, height: 24, color: 'rgb(148,163,184)', fontSize: 16, lineHeight: 24, fontWeight: '400', textAlign: 'center' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    };

    const pipeline = buildPipeline(rootDir, runtime);
    const result = await pipeline.run({ project: 'template-engine', componentName: 'Section', rootDir, dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3001' }, breakpointName: 'desktop' } });
    const commands = result.plan.commands;
    assert.equal(commands.some((item: any) => item.type === 'create_frame' && item.payload?.uiId === '__auto__/section[1]/div[1]'), false);
    const title = commands.find((item: any) => item.type === 'create_text' && item.payload?.uiId === 'section.title');
    const desc = commands.find((item: any) => item.type === 'create_text' && item.payload?.uiId === 'section.desc');
    assert.equal(title?.payload?.parentRef !== '__auto__/section[1]/div[1]', true);
    assert.equal(desc?.payload?.parentRef !== '__auto__/section[1]/div[1]', true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('planner creates synthetic text labels for inline-flex containers with icon child and own text', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'hero.root', name: 'div-root', visible: true,
      children: [
        {
          kind: 'frame', uiId: '__auto__/div[1]/a[1]', name: 'a-inline-flex.items-center.gap-2', visible: true,
          text: 'Start free',
          boundingBox: { x: 0, y: 0, width: 180, height: 44 },
          computedStyle: { display: 'inline-flex', width: 180, height: 44, alignItems: 'center', gap: 8, backgroundColor: 'rgb(36,99,235)', borderRadius: 8, paddingTop: 12, paddingRight: 24, paddingBottom: 12, paddingLeft: 24, fontFamily: 'Inter', fontSize: 14, fontWeight: '500', lineHeight: 20, color: 'rgb(255,255,255)' },
          icon: {}, asset: {}, meta: {}, children: [
            { kind: 'icon', uiId: '__auto__/div[1]/a[1]/svg[1]', name: 'svg-lucide', visible: true, boundingBox: { x: 0, y: 0, width: 16, height: 16 }, computedStyle: { width: 16, height: 16 }, icon: { sourceType: 'inline-svg', textLabel: 'sparkles', svgMarkup: '<svg></svg>', fill: 'rgb(255,255,255)', stroke: 'rgb(255,255,255)', size: { width: 16, height: 16 }, placement: 'standalone' }, asset: { layer: 'svg-icon' }, meta: {}, children: [] }
          ]
        },
        {
          kind: 'frame', uiId: '__auto__/div[1]/span[1]', name: 'span-inline-flex.items-center.gap-2', visible: true,
          text: 'AI-powered deck generation',
          boundingBox: { x: 220, y: 0, width: 260, height: 32 },
          computedStyle: { display: 'inline-flex', width: 260, height: 32, alignItems: 'center', gap: 8, backgroundColor: 'rgba(36,99,235,0.1)', borderRadius: 9999, paddingTop: 6, paddingRight: 16, paddingBottom: 6, paddingLeft: 16, fontFamily: 'Inter', fontSize: 14, fontWeight: '500', lineHeight: 20, color: 'rgb(36,99,235)' },
          icon: {}, asset: {}, meta: {}, children: [
            { kind: 'icon', uiId: '__auto__/div[1]/span[1]/svg[1]', name: 'svg-lucide', visible: true, boundingBox: { x: 0, y: 0, width: 16, height: 16 }, computedStyle: { width: 16, height: 16 }, icon: { sourceType: 'inline-svg', textLabel: 'sparkles', svgMarkup: '<svg></svg>', fill: 'rgb(36,99,235)', stroke: 'rgb(36,99,235)', size: { width: 16, height: 16 }, placement: 'standalone' }, asset: { layer: 'svg-icon' }, meta: {}, children: [] }
          ]
        }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Hero', 'src/components/Hero.tsx');
  const cmds = plan.commands;
  const ctaLabel = cmds.find((c: any) => c.type === 'create_text' && c.payload?.uiId === '__auto__/div[1]/a[1].label');
  const badgeLabel = cmds.find((c: any) => c.type === 'create_text' && c.payload?.uiId === '__auto__/div[1]/span[1].label');
  assert.equal(Boolean(ctaLabel), true);
  assert.equal(Boolean(badgeLabel), true);
  assert.equal(ctaLabel?.payload?.text, 'Start free');
  assert.equal(badgeLabel?.payload?.text, 'AI-powered deck generation');
  assert.equal(ctaLabel?.payload?.fontFamily, 'Inter');
  assert.equal(ctaLabel?.payload?.fontWeight, '500');
  assert.equal(badgeLabel?.payload?.fontWeight, '500');
});

test('planner reconstructs grid wrappers as wrapping auto-layout containers', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'section', uiId: 'features.root', name: 'section-root', visible: true,
      children: [
        {
          kind: 'frame', uiId: '__auto__/section[1]/div[1]', name: 'div-mt-16.grid.gap-8', visible: true,
          boundingBox: { x: 16, y: 64, width: 1248, height: 254 },
          computedStyle: { display: 'grid', width: 1248, height: 254, gap: 32, rowGap: 32, columnGap: 32 },
          icon: {}, asset: {}, meta: {}, children: [
            { kind: 'frame', uiId: '__auto__/section[1]/div[1]/div[1]', name: 'card-1', visible: true, boundingBox: { x: 0, y: 0, width: 288, height: 254 }, computedStyle: { display: 'block', width: 288, height: 254, position: 'relative' }, icon: {}, asset: {}, meta: {}, children: [] },
            { kind: 'frame', uiId: '__auto__/section[1]/div[1]/div[2]', name: 'card-2', visible: true, boundingBox: { x: 320, y: 0, width: 288, height: 254 }, computedStyle: { display: 'block', width: 288, height: 254, position: 'relative' }, icon: {}, asset: {}, meta: {}, children: [] },
            { kind: 'frame', uiId: '__auto__/section[1]/div[1]/div[3]', name: 'card-3', visible: true, boundingBox: { x: 640, y: 0, width: 288, height: 254 }, computedStyle: { display: 'block', width: 288, height: 254, position: 'relative' }, icon: {}, asset: {}, meta: {}, children: [] },
            { kind: 'frame', uiId: '__auto__/section[1]/div[1]/div[4]', name: 'card-4', visible: true, boundingBox: { x: 960, y: 0, width: 288, height: 254 }, computedStyle: { display: 'block', width: 288, height: 254, position: 'relative' }, icon: {}, asset: {}, meta: {}, children: [] }
          ]
        }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Features', 'src/components/Features.tsx');
  const cmds = plan.commands;
  const gridAuto = cmds.find((c: any) => c.type === 'set_auto_layout' && c.payload?.nodeRef === '__auto__/section[1]/div[1]');
  assert.equal(Boolean(gridAuto), true);
  assert.equal(gridAuto?.payload?.layoutMode, 'HORIZONTAL');
  assert.equal(gridAuto?.payload?.layoutWrap, 'WRAP');
  assert.equal(gridAuto?.payload?.itemSpacing, 32);
  const childPos = cmds.filter((c: any) => c.type === 'set_position' && String(c.payload?.nodeRef || '').startsWith('__auto__/section[1]/div[1]/div['));
  assert.equal(childPos.length, 0);
});

test('planner keeps transparent flex text stack wrappers inside grid items instead of attaching text directly to grid parent', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'section', uiId: 'how.root', name: 'section-root', visible: true,
      children: [
        {
          kind: 'frame', uiId: 'how.grid', name: 'div-mt-16.grid.gap-8', visible: true,
          boundingBox: { x: 0, y: 0, width: 1248, height: 208 },
          computedStyle: { display: 'grid', width: 1248, height: 208, gap: 32, rowGap: 32, columnGap: 32 },
          icon: {}, asset: {}, meta: {}, children: [
            {
              kind: 'frame', uiId: 'how.item.stack', name: 'div-relative.flex.flex-col', visible: true,
              boundingBox: { x: 0, y: 0, width: 394, height: 208 },
              computedStyle: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 394, height: 208, position: 'relative' },
              icon: {}, asset: {}, meta: { rendered: { dom: { tag: 'div', className: 'relative flex flex-col items-center text-center' } } }, children: [
                { kind: 'text', uiId: 'how.item.stack.step', name: 'span-text-6xl', text: '01', visible: true, boundingBox: { x: 0, y: 0, width: 84, height: 60 }, computedStyle: { display: 'block', width: 84, height: 60, fontSize: 60, lineHeight: 60, fontWeight: '900', textAlign: 'center', color: 'rgb(31,41,55)' }, children: [] },
                { kind: 'text', uiId: 'how.item.stack.title', name: 'h3-title', text: 'Загрузите шаблон', visible: true, boundingBox: { x: 0, y: 124, width: 214, height: 28 }, computedStyle: { display: 'block', width: 214, height: 28, fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center', color: 'rgb(225,231,239)' }, children: [] },
                { kind: 'text', uiId: 'how.item.stack.body', name: 'p-body', text: 'Выберите шаблон', visible: true, boundingBox: { x: 0, y: 160, width: 394, height: 48 }, computedStyle: { display: 'block', width: 394, height: 48, fontSize: 16, lineHeight: 24, fontWeight: '400', textAlign: 'center', color: 'rgb(148,163,184)' }, children: [] }
              ]
            }
          ]
        }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'HowItWorks', 'src/components/HowItWorks.tsx');
  const cmds = plan.commands;
  const stackCreate = cmds.find((c: any) => c.type === 'create_frame' && c.payload?.ref === 'how.item.stack');
  assert.equal(Boolean(stackCreate), true);
  const stackAuto = cmds.find((c: any) => c.type === 'set_auto_layout' && c.payload?.nodeRef === 'how.item.stack');
  assert.equal(Boolean(stackAuto), true);
  assert.equal(stackAuto?.payload?.layoutMode, 'VERTICAL');
  const leakedTexts = cmds.filter((c: any) => c.type === 'create_text' && c.payload?.parentRef === 'how.grid');
  assert.equal(leakedTexts.length, 0);
  const nestedTexts = cmds.filter((c: any) => c.type === 'create_text' && c.payload?.parentRef === 'how.item.stack');
  assert.equal(nestedTexts.length, 3);
});

test('planner emits semantic figma-facing names while keeping stable uiIds for reverse sync', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: '__auto__/', name: 'body-root', visible: true,
      meta: { rendered: { dom: { tag: 'body', className: 'min-h-screen' } } },
      children: [
        { kind: 'frame', uiId: '__auto__/header[1]', name: 'header-classic', visible: true, meta: { rendered: { dom: { tag: 'header', className: 'sticky top-0 z-50' } } }, computedStyle: { display: 'block', width: 1440, height: 80 }, children: [] },
        { kind: 'frame', uiId: '__auto__/main[1]', name: 'main-root', visible: true, meta: { rendered: { dom: { tag: 'main', className: 'flex-1' } } }, computedStyle: { display: 'block', width: 1440, height: 1200 }, children: [
          { kind: 'section', uiId: '__auto__/main[1]/section[1]', name: 'hero', visible: true, meta: { rendered: { dom: { tag: 'section', className: 'relative overflow-hidden' } } }, computedStyle: { display: 'block', width: 1440, height: 600 }, children: [
            { kind: 'frame', uiId: '__auto__/main[1]/section[1]/div[1]', name: 'div-container', visible: true, meta: { rendered: { dom: { tag: 'div', className: 'container mx-auto max-w-screen-xl' } } }, computedStyle: { display: 'block', width: 1200, height: 400 }, children: [
              { kind: 'text', uiId: '__auto__/main[1]/section[1]/div[1]/h2[1]', name: 'h2-text-3xl.font-bold', text: 'Why Template Engine?', visible: true, meta: { rendered: { dom: { tag: 'h2', className: 'text-3xl font-bold' } } }, computedStyle: { fontSize: 36, fontWeight: '700', width: 600, height: 48 }, children: [] },
              { kind: 'icon', uiId: '__auto__/main[1]/section[1]/div[1]/svg[1]', name: 'svg-lucide', visible: true, meta: { rendered: { dom: { tag: 'svg', className: 'lucide lucide-sparkles' } } }, icon: { sourceType: 'inline-svg' }, computedStyle: { width: 24, height: 24 }, children: [] },
              { kind: 'button', uiId: '__auto__/main[1]/section[1]/div[1]/button[1]', name: 'cta', text: 'Get started', visible: true, meta: { rendered: { dom: { tag: 'button', className: 'inline-flex items-center' } } }, computedStyle: { display: 'inline-flex', width: 180, height: 48 }, children: [] }
            ] }
          ] }
        ] },
        { kind: 'frame', uiId: '__auto__/footer[1]', name: 'footer-classic', visible: true, meta: { rendered: { dom: { tag: 'footer', className: 'border-t' } } }, computedStyle: { display: 'block', width: 1440, height: 200 }, children: [] }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const createNames = new Map(plan.commands.filter((c: any) => ['create_frame','create_text'].includes(c.type)).map((c: any) => [c.payload?.uiId, c.payload?.name]));
  assert.equal(createNames.get('__auto__/header[1]'), 'Header - __auto__/header[1]');
  assert.equal(createNames.get('__auto__/main[1]'), 'Main - __auto__/main[1]');
  assert.equal(createNames.get('__auto__/main[1]/section[1]'), 'hero - __auto__/main[1]/section[1]');
  assert.equal(createNames.get('__auto__/main[1]/section[1]/div[1]'), 'Container - __auto__/main[1]/section[1]/div[1]');
  assert.equal(createNames.get('__auto__/main[1]/section[1]/div[1]/h2[1]'), 'Text - __auto__/main[1]/section[1]/div[1]/h2[1]');
  assert.equal(createNames.get('__auto__/main[1]/section[1]/div[1]/svg[1]'), 'Icon - __auto__/main[1]/section[1]/div[1]/svg[1]');
  assert.equal(createNames.get('__auto__/main[1]/section[1]/div[1]/button[1]'), 'cta - __auto__/main[1]/section[1]/div[1]/button[1]');
  assert.equal(createNames.get('__auto__/footer[1]'), 'Footer - __auto__/footer[1]');
});

test('planner normalizes generic ui-sans-serif stacks to figma-friendly font families', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'page.root', name: 'Page', visible: true, children: [{
        kind: 'text', uiId: 'page.title', name: 'hero-title', text: 'Hello', visible: true,
        boundingBox: { x: 0, y: 0, width: 200, height: 40 },
        computedStyle: { fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', fontSize: 36, fontWeight: '700', lineHeight: 40, color: 'rgb(255,255,255)', textAlign: 'center' },
        children: []
      }]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const create = plan.commands.find((item: any) => item.type === 'create_text');
  assert.equal(create.payload.fontFamily, 'Inter');
});

test('inline svg icons stay on vector path even when node is flagged needs review', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind:'frame', uiId:'page.root', name:'Page', visible:true, children:[{
      kind:'icon', uiId:'page.icon', name:'upload', visible:true, confidence:{ needsReview:true },
      boundingBox:{x:0,y:0,width:28,height:28}, computedStyle:{ width:28, height:28 },
      icon:{ sourceType:'inline-svg', textLabel:'upload', svgMarkup:'<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 1"/></svg>', stroke:'rgb(255,255,255)', fill:'none', size:{width:28,height:28}, placement:'standalone' },
      asset:{ layer:'svg-icon' }, children:[]
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const cmd = plan.commands.find((item: any) => item.type === 'set_icon_reference');
  assert.equal(cmd.payload.figmaStrategy, 'vector_icon');
});

test('planner normalizes multi-shadow css into plugin-friendly primary shadow payload', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind:'frame', uiId:'page.root', name:'Page', visible:true, children:[{
      kind:'frame', uiId:'page.shadow', name:'shadow-node', visible:true,
      boundingBox:{x:0,y:0,width:64,height:64},
      computedStyle:{ width:64, height:64, backgroundColor:'rgb(36,99,235)', borderRadius:9999, boxShadow:'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(36, 99, 235, 0.3) 0px 10px 15px -3px, rgba(36, 99, 235, 0.3) 0px 4px 6px -4px' },
      children:[]
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const cmd = plan.commands.find((item: any) => item.type === 'set_effects' && item.payload?.nodeRef === 'page.shadow');
  assert.equal(Boolean(cmd), true);
  assert.equal(cmd.payload.boxShadow, '0px 10px 15px -3px rgba(36, 99, 235, 0.3), 0px 4px 6px -4px rgba(36, 99, 235, 0.3)');
});

test('planner appends stable uiId to figma-facing node names while preserving original base names', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'page.root', name: 'body', visible: true, children: [{
        kind: 'frame', uiId: 'page.hero.card', name: 'div-relative.mx-auto.max-w-screen-xl', visible: true,
        boundingBox: { x: 0, y: 0, width: 320, height: 200 }, computedStyle: { width: 320, height: 200 }, children: []
      }, {
        kind: 'text', uiId: 'page.hero.title', name: 'h2-text-3xl.font-bold.text-foreground', text: 'Hello', visible: true,
        boundingBox: { x: 0, y: 0, width: 200, height: 40 }, computedStyle: { width: 200, height: 40, fontFamily: 'Inter', fontWeight: '700', fontSize: 36, lineHeight: 40, color: 'rgb(0,0,0)' }, children: []
      }]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const frameCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.uiId === 'page.hero.card');
  const textCreate = plan.commands.find((item: any) => item.type === 'create_text' && item.payload?.uiId === 'page.hero.title');
  assert.equal(frameCreate.payload.name, 'Card - page.hero.card');
  assert.equal(textCreate.payload.name, 'Text - page.hero.title');
});

test('planner keeps human-authored figma-facing names and only normalizes technical DOM-like names', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'page.root', name: 'Hero', visible: true, children: [{
        kind: 'button', uiId: 'page.hero.cta', name: 'CTA', text: 'Get started', visible: true,
        boundingBox: { x: 0, y: 0, width: 180, height: 48 }, computedStyle: { width: 180, height: 48 }, children: []
      }, {
        kind: 'frame', uiId: '__auto__/main[1]/div[1]', name: 'div-container.mx-auto.max-w-screen-xl', visible: true,
        meta: { rendered: { dom: { tag: 'div', className: 'container mx-auto max-w-screen-xl' } } },
        boundingBox: { x: 0, y: 0, width: 320, height: 200 }, computedStyle: { width: 320, height: 200 }, children: []
      }]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const rootCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.uiId === 'page.root');
  const ctaCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.uiId === 'page.hero.cta');
  const technicalCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.uiId === '__auto__/main[1]/div[1]');
  assert.equal(rootCreate.payload.name, 'Hero - page.root');
  assert.equal(ctaCreate.payload.name, 'CTA - page.hero.cta');
  assert.equal(technicalCreate.payload.name, 'Container - __auto__/main[1]/div[1]');
});

test('planner adds Overlay+Shadow helper child for circular icon holders with shadows', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind:'frame', uiId:'page.root', name:'Page', visible:true, children:[{
      kind:'frame', uiId:'circle.icon', name:'div--mt-6.flex.h-16', visible:true,
      boundingBox:{x:0,y:0,width:64,height:64},
      computedStyle:{ display:'flex', width:64, height:64, justifyContent:'center', alignItems:'center', borderRadius:9999, boxShadow:'rgba(36, 99, 235, 0.3) 0px 10px 15px -3px' },
      children:[{ kind:'icon', uiId:'circle.icon.svg', name:'svg-upload', visible:true, boundingBox:{x:0,y:0,width:28,height:28}, computedStyle:{ width:28, height:28 }, icon:{ sourceType:'inline-svg', textLabel:'upload', svgMarkup:'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M1 1"/></svg>', size:{width:28,height:28}, placement:'standalone' }, asset:{layer:'svg-icon'}, children:[] }]
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const overlayCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.ref === 'circle.icon.overlay_shadow');
  const overlayAlign = plan.commands.find((item: any) => item.type === 'set_alignment' && item.payload?.nodeRef === 'circle.icon.overlay_shadow');
  assert.equal(Boolean(overlayCreate), true);
  assert.equal(overlayCreate.payload.width, 64);
  assert.equal(overlayCreate.payload.height, 64);
  assert.equal(overlayAlign.payload.alignment.layoutPositioning, 'ABSOLUTE');
});


test('input placeholder labels inherit resolved font style and letter spacing', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind: 'frame', uiId: 'page.root', name: 'Page', visible: true, children: [{
      kind: 'input', uiId: 'page.search', name: 'search-input', visible: true,
      boundingBox: { x: 0, y: 0, width: 320, height: 48 },
      computedStyle: { width: 320, height: 48, fontFamily: 'Inter', fontWeight: '500', fontSize: 16, lineHeight: 24, letterSpacing: 0.2, textAlign: 'left', borderRadius: 12, backgroundColor: 'rgb(255,255,255)' },
      padding: { top: 12, right: 16, bottom: 12, left: 16 },
      meta: { rendered: { form: { inputType: 'text', placeholder: 'Search templates' } } },
      children: []
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Search', 'src/app/page.tsx');
  const style = plan.commands.find((item: any) => item.type === 'set_text_style' && item.payload?.nodeRef === 'page.search.placeholder');
  assert.equal(Boolean(style), true);
  assert.equal(style.payload.fontFamily, 'Inter');
  assert.equal(style.payload.fontStyle, 'Medium');
  assert.equal(style.payload.fontWeight, '500');
  assert.equal(style.payload.letterSpacing, 0.2);
});


test('planner preserves small centered icon-holder wrappers as frames with child icon attachment', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind:'frame', uiId:'page.root', name:'Page', visible:true, children:[{
      kind:'frame', uiId:'feature.iconWrap', name:'div-rounded-full.bg-slate-900', visible:true,
      boundingBox:{x:0,y:0,width:48,height:48},
      computedStyle:{ display:'inline-flex', width:48, height:48, justifyContent:'center', alignItems:'center', borderRadius:9999, backgroundColor:'rgb(15,23,42)' },
      children:[{
        kind:'icon', uiId:'feature.iconWrap.icon', name:'svg-sparkles', visible:true,
        boundingBox:{x:12,y:12,width:24,height:24}, computedStyle:{ width:24, height:24 },
        icon:{ sourceType:'inline-svg', textLabel:'sparkles', svgMarkup:'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M1 1"/></svg>', fill:'rgb(255,255,255)', stroke:'rgb(255,255,255)', size:{width:24,height:24}, placement:'standalone' },
        asset:{layer:'svg-icon'}, children:[]
      }]
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Feature', 'src/app/page.tsx');
  const wrapCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.uiId === 'feature.iconWrap');
  const wrapLayout = plan.commands.find((item: any) => item.type === 'set_auto_layout' && item.payload?.nodeRef === 'feature.iconWrap');
  const iconRef = plan.commands.find((item: any) => item.type === 'set_icon_reference' && item.payload?.nodeRef === 'feature.iconWrap.icon');
  assert.equal(Boolean(wrapCreate), true);
  assert.equal(wrapCreate.payload.name, 'Container - feature.iconWrap');
  assert.equal(Boolean(wrapLayout), true);
  assert.equal(wrapLayout.payload.layoutMode, 'HORIZONTAL');
  assert.equal(wrapLayout.payload.counterAxisAlignItems, 'CENTER');
  assert.equal(Boolean(iconRef), true);
});


test('planner preserves repeated feature-card wrappers and their internal text stacks inside grid sections', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'section', uiId: 'features.root', name: 'Features', visible: true, children: [{
        kind: 'frame', uiId: 'features.grid', name: 'div-grid.grid-cols-3.gap-8', visible: true,
        boundingBox: { x: 0, y: 0, width: 1248, height: 320 },
        computedStyle: { display: 'grid', width: 1248, height: 320, gap: 32, rowGap: 32, columnGap: 32 },
        children: [
          {
            kind: 'card', uiId: 'features.card.1', name: 'div-rounded-3xl.border.bg-slate-950', visible: true,
            boundingBox: { x: 0, y: 0, width: 394, height: 320 },
            computedStyle: { display: 'flex', flexDirection: 'column', width: 394, height: 320, gap: 20, paddingTop: 32, paddingRight: 32, paddingBottom: 32, paddingLeft: 32, borderRadius: 24, backgroundColor: 'rgb(2,6,23)' },
            children: [
              { kind: 'text', uiId: 'features.card.1.title', name: 'h3-title', text: 'Import websites', visible: true, boundingBox: { x: 32, y: 32, width: 220, height: 28 }, computedStyle: { display: 'block', width: 220, height: 28, fontSize: 20, lineHeight: 28, fontWeight: '700', color: 'rgb(248,250,252)' }, children: [] },
              { kind: 'text', uiId: 'features.card.1.body', name: 'p-body', text: 'Keep editable layout and typography.', visible: true, boundingBox: { x: 32, y: 72, width: 300, height: 48 }, computedStyle: { display: 'block', width: 300, height: 48, fontSize: 16, lineHeight: 24, fontWeight: '400', color: 'rgb(148,163,184)' }, children: [] }
            ]
          },
          {
            kind: 'card', uiId: 'features.card.2', name: 'div-rounded-3xl.border.bg-slate-950', visible: true,
            boundingBox: { x: 427, y: 0, width: 394, height: 320 },
            computedStyle: { display: 'flex', flexDirection: 'column', width: 394, height: 320, gap: 20, paddingTop: 32, paddingRight: 32, paddingBottom: 32, paddingLeft: 32, borderRadius: 24, backgroundColor: 'rgb(2,6,23)' },
            children: [
              { kind: 'text', uiId: 'features.card.2.title', name: 'h3-title', text: 'Keep sync-safe ids', visible: true, boundingBox: { x: 32, y: 32, width: 220, height: 28 }, computedStyle: { display: 'block', width: 220, height: 28, fontSize: 20, lineHeight: 28, fontWeight: '700', color: 'rgb(248,250,252)' }, children: [] },
              { kind: 'text', uiId: 'features.card.2.body', name: 'p-body', text: 'Preserve stable uiId mapping.', visible: true, boundingBox: { x: 32, y: 72, width: 300, height: 48 }, computedStyle: { display: 'block', width: 300, height: 48, fontSize: 16, lineHeight: 24, fontWeight: '400', color: 'rgb(148,163,184)' }, children: [] }
            ]
          }
        ]
      }]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'Features', 'src/components/Features.tsx');
  const cmds = plan.commands;
  const gridAuto = cmds.find((c: any) => c.type === 'set_auto_layout' && c.payload?.nodeRef === 'features.grid');
  const card1Create = cmds.find((c: any) => c.type === 'create_frame' && c.payload?.ref === 'features.card.1');
  const card1Auto = cmds.find((c: any) => c.type === 'set_auto_layout' && c.payload?.nodeRef === 'features.card.1');
  const card2Auto = cmds.find((c: any) => c.type === 'set_auto_layout' && c.payload?.nodeRef === 'features.card.2');
  assert.equal(Boolean(gridAuto), true);
  assert.equal(gridAuto?.payload?.layoutWrap, 'WRAP');
  assert.equal(Boolean(card1Create), true);
  assert.equal(card1Create?.payload?.name, 'Card - features.card.1');
  assert.equal(Boolean(card1Auto), true);
  assert.equal(card1Auto?.payload?.layoutMode, 'VERTICAL');
  assert.equal(Boolean(card2Auto), true);
  const leakedTexts = cmds.filter((c: any) => c.type === 'create_text' && c.payload?.parentRef === 'features.grid');
  assert.equal(leakedTexts.length, 0);
  const nestedCard1Texts = cmds.filter((c: any) => c.type === 'create_text' && c.payload?.parentRef === 'features.card.1');
  const nestedCard2Texts = cmds.filter((c: any) => c.type === 'create_text' && c.payload?.parentRef === 'features.card.2');
  assert.equal(nestedCard1Texts.length, 2);
  assert.equal(nestedCard2Texts.length, 2);
});


test('planner preserves multi-shadow and inset effect stacks for plugin effect parsing', async () => {
  const model: any = {
    version: 'ui-model.v1',
    root: { kind:'frame', uiId:'page.root', name:'Page', visible:true, children:[{
      kind:'frame', uiId:'page.effects', name:'effect-card', visible:true,
      boundingBox:{x:0,y:0,width:320,height:180},
      computedStyle:{ width:320, height:180, backgroundColor:'rgb(15,23,42)', borderRadius:24, boxShadow:'inset rgba(255, 255, 255, 0.08) 0px 1px 0px 0px, rgba(15, 23, 42, 0.24) 0px 12px 24px -8px' },
      children:[]
    }] }
  };
  const plan = buildCodeToFigmaPlan(model, 'Home', 'src/app/page.tsx');
  const cmd = plan.commands.find((item: any) => item.type === 'set_effects' && item.payload?.nodeRef === 'page.effects');
  assert.equal(Boolean(cmd), true);
  assert.equal(cmd.payload.boxShadow, '0px 1px 0px 0px rgba(255, 255, 255, 0.08), 0px 12px 24px -8px rgba(15, 23, 42, 0.24)');
});

test('planner uses axis-specific grid gaps and top-aligns wrapped rows', () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'footer.grid', visible: true,
      boundingBox: { x: 0, y: 0, width: 1045, height: 500 },
      computedStyle: { display: 'grid', width: 1045, height: 500, gap: 36, rowGap: 36, columnGap: 20, alignItems: 'normal' },
      layout: { type: 'stack', gap: 36, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignment: { primary: 'start', cross: 'start' }, wrap: false },
      children: [
        { kind: 'frame', uiId: 'footer.grid.one', visible: true, boundingBox: { x: 0, y: 0, width: 334.984375, height: 421 }, computedStyle: { display: 'block', width: 334.984375, height: 421 }, children: [] },
        { kind: 'frame', uiId: 'footer.grid.two', visible: true, boundingBox: { x: 354.984375, y: 0, width: 334.984375, height: 421 }, computedStyle: { display: 'block', width: 334.984375, height: 421 }, children: [] },
        { kind: 'frame', uiId: 'footer.grid.three', visible: true, boundingBox: { x: 709.96875, y: 0, width: 334.984375, height: 421 }, computedStyle: { display: 'block', width: 334.984375, height: 421 }, children: [] },
        { kind: 'frame', uiId: 'footer.grid.four', visible: true, boundingBox: { x: 0, y: 457, width: 334.984375, height: 40 }, computedStyle: { display: 'block', width: 334.984375, height: 40 }, children: [] }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'FooterGrid', '[rendered-ui]');
  const auto = plan.commands.find((item: any) => item.type === 'set_auto_layout' && item.payload?.nodeRef === 'footer.grid') as any;
  const spacing = plan.commands.find((item: any) => item.type === 'set_spacing' && item.payload?.nodeRef === 'footer.grid') as any;
  assert.equal(auto.payload.layoutMode, 'HORIZONTAL');
  assert.equal(auto.payload.layoutWrap, 'WRAP');
  assert.equal(auto.payload.itemSpacing, 20);
  assert.equal(auto.payload.counterAxisSpacing, 36);
  assert.equal(auto.payload.counterAxisAlignItems, 'MIN');
  assert.equal(spacing.payload.itemSpacing, 20);
  assert.equal(spacing.payload.counterAxisSpacing, 36);
});

test('planner does not duplicate button labels and descends into empty icon wrappers', () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'button', uiId: 'header.menu', visible: true, text: 'Меню',
      boundingBox: { x: 0, y: 0, width: 90, height: 32 },
      computedStyle: { display: 'flex', flexDirection: 'row', width: 90, height: 32, gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgb(130, 230, 0)', color: 'rgb(26, 26, 26)', paddingLeft: 8, paddingRight: 8 },
      layout: { type: 'horizontal', gap: 8, padding: { top: 0, right: 8, bottom: 0, left: 8 }, alignment: { primary: 'center', cross: 'center' }, wrap: false },
      children: [
        { kind: 'text', uiId: 'header.menu.label', visible: true, text: 'Меню', boundingBox: { x: 8, y: 9, width: 50, height: 13 }, computedStyle: { display: 'flex', color: 'rgb(26, 26, 26)', fontSize: 12, lineHeight: 13.2 }, children: [] },
        { kind: 'text', uiId: 'header.menu.iconwrap', visible: true, boundingBox: { x: 66, y: 8, width: 16, height: 16 }, computedStyle: { display: 'flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }, children: [
          { kind: 'icon', uiId: 'header.menu.iconwrap.line1', visible: true, boundingBox: { x: 66, y: 11, width: 10, height: 1 }, computedStyle: { display: 'block', position: 'absolute', width: 10, height: 1, backgroundColor: 'rgb(26, 26, 26)' }, asset: { layer: 'svg-icon' }, icon: { sourceType: 'font-icon', textLabel: 'i', fill: 'rgb(26, 26, 26)', size: { width: 10, height: 1 }, placement: 'standalone' }, children: [] },
          { kind: 'icon', uiId: 'header.menu.iconwrap.line2', visible: true, boundingBox: { x: 66, y: 15, width: 10, height: 1 }, computedStyle: { display: 'block', position: 'absolute', width: 10, height: 1, backgroundColor: 'rgb(26, 26, 26)' }, asset: { layer: 'svg-icon' }, icon: { sourceType: 'font-icon', textLabel: 'i', fill: 'rgb(26, 26, 26)', size: { width: 10, height: 1 }, placement: 'standalone' }, children: [] }
        ] }
      ]
    }
  };
  const plan = buildCodeToFigmaPlan(model, 'HeaderButton', '[rendered-ui]');
  const duplicateSyntheticLabels = plan.commands.filter((item: any) => item.type === 'create_text' && item.payload?.parentRef === 'header.menu' && item.payload?.name === 'text-button-label');
  assert.equal(duplicateSyntheticLabels.length, 0);
  const iconWrapperCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.ref === 'header.menu.iconwrap');
  assert.equal(Boolean(iconWrapperCreate), true);
  const lineCreate = plan.commands.find((item: any) => item.type === 'create_frame' && item.payload?.ref === 'header.menu.iconwrap.line1');
  assert.equal(Boolean(lineCreate), true);
  const lineFill = plan.commands.find((item: any) => item.type === 'set_fill' && item.payload?.nodeRef === 'header.menu.iconwrap.line1');
  assert.equal(Boolean(lineFill), true);
  const wrongIconReference = plan.commands.find((item: any) => item.type === 'set_icon_reference' && item.payload?.nodeRef === 'header.menu.iconwrap.line1');
  assert.equal(Boolean(wrongIconReference), false);
});
