import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesignSystemFigmaCommands, extractDesignSystemFromUiModel } from '../../src/core/design-system-extractor';

test('observed design system extracts evidence-backed tokens from rendered UI model', () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'page.root', visible: true,
      boundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      computedStyle: { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(26, 26, 26)', display: 'block' },
      children: [
        { kind: 'text', uiId: 'page.h1', text: 'Catalog', visible: true, boundingBox: { x: 40, y: 40, width: 800, height: 64 }, computedStyle: { color: 'rgb(26, 26, 26)', fontFamily: 'Inter, Arial, sans-serif', fontSize: 48, lineHeight: 56, fontWeight: '700', letterSpacing: -1.2 }, meta: { rendered: { dom: { tag: 'h1' } } }, children: [] },
        { kind: 'button', uiId: 'page.cta', text: 'Order', visible: true, boundingBox: { x: 40, y: 140, width: 170, height: 40 }, state: { interactive: true }, computedStyle: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgb(130, 230, 0)', color: 'rgb(26, 26, 26)', fontFamily: 'Inter, Arial, sans-serif', fontSize: 14, lineHeight: 20, fontWeight: '500', borderRadius: 2, borderWidth: 1, borderStyle: 'solid', borderColor: 'rgb(130, 230, 0)', paddingLeft: 16, paddingRight: 4, gap: 10, boxShadow: 'none' }, children: [] },
        { kind: 'frame', uiId: 'page.card', name: 'product-card', visible: true, boundingBox: { x: 40, y: 220, width: 320, height: 180 }, computedStyle: { display: 'grid', gap: 20, backgroundColor: 'rgb(50, 69, 103)', color: 'rgb(255,255,255)', borderRadius: 12, boxShadow: 'rgba(15, 23, 42, 0.24) 0px 12px 24px -8px', paddingTop: 24, paddingLeft: 24 }, children: [] },
        { kind: 'image', uiId: 'page.logo', visible: true, boundingBox: { x: 40, y: 430, width: 120, height: 40 }, computedStyle: { display: 'block' }, asset: { layer: 'image', sourceUrl: 'https://example.com/logo.svg', figmaStrategy: 'vector_icon' }, children: [] },
        { kind: 'icon', uiId: 'page.icon', visible: true, boundingBox: { x: 180, y: 430, width: 16, height: 16 }, computedStyle: { display: 'block' }, icon: { sourceType: 'inline-svg', fill: 'rgb(130, 230, 0)', size: { width: 16, height: 16 }, figmaStrategy: 'vector_icon' }, children: [] },
        { kind: 'frame', uiId: 'page.carousel', visible: true, boundingBox: { x: 40, y: 500, width: 300, height: 120 }, computedStyle: { display: 'flex', overflowX: 'auto' }, meta: { rendered: { dom: { className: 'swiper carousel' }, guardrails: { unsupportedRegions: ['carousel'] } } }, children: [
          { kind: 'card', uiId: 'page.carousel.card1', visible: true, boundingBox: { x: 40, y: 500, width: 180, height: 100 }, computedStyle: { backgroundColor: 'rgb(255,255,255)' }, children: [] },
          { kind: 'card', uiId: 'page.carousel.card2', visible: true, boundingBox: { x: 240, y: 500, width: 180, height: 100 }, computedStyle: { backgroundColor: 'rgb(255,255,255)' }, children: [] }
        ] }
      ]
    }
  };
  const ds = extractDesignSystemFromUiModel(model, { title: 'parts.avtopribor.ru', sourceUrl: 'https://parts.avtopribor.ru/' });
  assert.equal(ds.version, 'observed-design-system.v1');
  assert.equal(ds.title, 'parts.avtopribor.ru');
  assert.equal(ds.colors.some((token) => token.value.hex === '#82E600' && token.value.usage.includes('background')), true);
  assert.equal(ds.typography.some((token) => token.value.role === 'h1' && token.value.fontSize === 48), true);
  assert.equal(ds.components.some((token) => token.value.role === 'button' && token.evidence.some((item) => item.uiId === 'page.cta')), true);
  assert.equal(ds.components.some((token) => token.value.role === 'card' && token.evidence.some((item) => item.uiId === 'page.card')), true);
  assert.equal(ds.radius.some((token) => token.value.value === 2), true);
  assert.equal(ds.shadows.length, 1);
  assert.equal(ds.borders.some((token) => token.value.width === 1 && token.value.color === '#82E600'), true);
  assert.equal(ds.assets.some((token) => token.value.kind === 'image' && token.value.strategy === 'vector_icon'), true);
  assert.equal(ds.icons.some((token) => token.value.sourceType === 'inline-svg' && token.value.fill === '#82E600'), true);
  assert.equal(ds.layouts.some((token) => token.value.display === 'flex' || token.value.display === 'grid'), true);
  assert.equal(ds.states.some((token) => token.value.state === 'interactive'), true);
  assert.equal(ds.interactions.some((token) => token.value.pattern === 'carousel-like' || token.value.pattern === 'horizontal-scroll'), true);
  assert.equal(typeof ds.quality.score, 'number');
  assert.equal(ds.handoff.version, 'design-system-handoff.v1');
});

test('observed design system figma commands create editable sidecar with reverse-sync metadata', () => {
  const ds: any = {
    version: 'observed-design-system.v1',
    title: 'parts.avtopribor.ru',
    sourceUrl: 'https://parts.avtopribor.ru/',
    generatedAt: '2026-04-27T00:00:00.000Z',
    summary: { colors: 1, typography: 1, spacing: 1, radius: 1, shadows: 1, borders: 1, assets: 1, icons: 1, layouts: 1, states: 1, components: 1, interactions: 1, audit: 1 },
    quality: { score: 0.72, grade: 'good', issues: [], recommendedNextSteps: ['review'] },
    handoff: { version: 'design-system-handoff.v1', sourceUrl: 'https://parts.avtopribor.ru/', title: 'parts.avtopribor.ru', tokenCount: 12, bindingCount: 4, interactionCount: 1, acceptance: { safeForGeneration: true, safeForCodePatch: false, requiresCuration: true }, recommendedMcpTarget: 'mcp.vazovski.art', notes: ['test'] },
    colors: [{ id: 'color.primary', name: 'color.brand.primary', kind: 'color', value: { hex: '#82E600', rgb: { r: 130, g: 230, b: 0, a: 1 }, usage: ['background'] }, count: 3, confidence: 0.8, evidence: [{ uiId: 'page.cta', usage: 'background' }] }],
    typography: [{ id: 'typography.h1', name: 'typography.h1.1', kind: 'typography', value: { fontFamily: 'Inter', fontSize: 48, lineHeight: 56, fontWeight: '700', role: 'h1' }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.h1', usage: 'h1' }] }],
    spacing: [{ id: 'spacing.20', name: 'spacing.20', kind: 'spacing', value: { value: 20, usage: ['gap'] }, count: 2, confidence: 0.6, evidence: [{ uiId: 'page.grid', usage: 'gap' }] }],
    radius: [{ id: 'radius.2', name: 'radius.2', kind: 'radius', value: { value: 2, usage: ['border-radius'] }, count: 2, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'border-radius' }] }],
    shadows: [{ id: 'shadow.1', name: 'shadow.card', kind: 'shadow', value: { value: 'rgba(0,0,0,.2) 0px 4px 12px', usage: ['box-shadow'] }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.card', usage: 'box-shadow' }] }],
    borders: [{ id: 'border.1', name: 'border.primary', kind: 'border', value: { color: '#82E600', width: 1, style: 'solid', usage: ['border'] }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'border' }] }],
    assets: [{ id: 'asset.logo', name: 'asset.logo', kind: 'asset', value: { kind: 'image', source: 'https://example.com/logo.svg', strategy: 'vector_icon', width: 120, height: 40 }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.logo', usage: 'asset' }] }],
    icons: [{ id: 'icon.svg', name: 'icon.svg', kind: 'icon', value: { sourceType: 'inline-svg', fill: '#82E600', width: 16, height: 16, strategy: 'vector_icon' }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.icon', usage: 'icon' }] }],
    layouts: [{ id: 'layout.flex', name: 'layout.flex', kind: 'layout', value: { display: 'flex', direction: 'row', gap: 10, childCount: 2 }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'layout' }] }],
    states: [{ id: 'state.interactive', name: 'state.interactive', kind: 'state', value: { state: 'interactive', interactive: true }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'interactive' }] }],
    audit: [{ id: 'audit.1', name: 'audit.warning', kind: 'audit', value: { issue: 'low confidence', severity: 'warning' }, count: 1, confidence: 1, evidence: [{ uiId: 'page.x', usage: 'low confidence' }] }],
    components: [{ id: 'component.button', name: 'component.button.primary', kind: 'component', value: { role: 'button', width: 170, height: 40, fill: '#82E600', color: '#1A1A1A', radius: 2 }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'button' }] }],
    interactions: [{ id: 'interaction.carousel', name: 'interaction.carousel.1', kind: 'interaction', value: { pattern: 'carousel-like', confidence: 0.86, evidence: ['carousel marker'], recommendedHandling: 'review behavior sidecar', risk: 'high', axis: 'x' }, count: 1, confidence: 0.86, evidence: [{ uiId: 'page.carousel', usage: 'carousel-like' }] }]
  };
  const commands = buildDesignSystemFigmaCommands(ds, { ref: 'design-system/test', x: 1600, y: 0 });
  assert.equal(commands[0].type, 'delete_matching_nodes');
  assert.equal(commands.some((command: any) => command.type === 'create_frame' && command.payload?.ref === 'design-system/test'), true);
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.nodeRef === 'design-system/test' && command.payload?.pluginData?.key === 'design-system-document'), true);
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'design-system-token'), true);
  assert.equal(commands.some((command: any) => command.type === 'create_button_state_set'), true);
  assert.equal(commands.some((command: any) => command.type === 'create_text' && String(command.payload?.text || '').includes('Observed Design System')), true);
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'design-system-handoff'), true);
  for (const section of ['assets', 'icons', 'layouts', 'shadows', 'borders', 'interactions', 'quality', 'audit']) {
    assert.equal(commands.some((command: any) => command.type === 'create_frame' && command.payload?.ref === `design-system/test/${section}`), true);
  }
});

test('observed design system emits source-node token bindings for bidirectional handoff', () => {
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame', uiId: 'page.root', visible: true, computedStyle: { backgroundColor: 'rgb(255,255,255)' }, children: [
        { kind: 'button', uiId: 'page.cta', text: 'Order', visible: true, boundingBox: { x: 0, y: 0, width: 120, height: 40 }, computedStyle: { backgroundColor: 'rgb(130, 230, 0)', color: 'rgb(26, 26, 26)', fontFamily: 'Inter', fontSize: 14, lineHeight: 20, fontWeight: '500', borderRadius: 2, gap: 8 }, children: [] }
      ]
    }
  };
  const ds = extractDesignSystemFromUiModel(model, { title: 'fixture' });
  const commands = buildDesignSystemFigmaCommands(ds, { ref: 'design-system/fixture' });
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'design-system-bindings'), false);
  const { createObservedDesignSystem } = require('../../src/core/design-system-extractor');
  const observed = createObservedDesignSystem(model, { title: 'fixture', ref: 'design-system/fixture' });
  const binding = observed.commands.find((command: any) => command.type === 'set_plugin_data' && command.payload?.nodeRef === 'page.cta' && command.payload?.pluginData?.key === 'design-system-bindings') as any;
  assert.equal(Boolean(binding), true);
  const parsed = JSON.parse(binding.payload.pluginData.value);
  assert.equal(parsed.version, 'design-system-bindings.v1');
  assert.equal(parsed.uiId, 'page.cta');
  assert.equal(parsed.bindings.some((item: any) => item.kind === 'color' || item.kind === 'component'), true);
});



test('observed design system emits interactive audit metadata without running browser actions', () => {
  const { createObservedDesignSystem } = require('../../src/core/design-system-extractor');
  const model: any = {
    version: 'ui-model.v1',
    root: { kind: 'frame', uiId: 'page.root', visible: true, computedStyle: {}, children: [
      { kind: 'frame', uiId: 'page.track', visible: true, boundingBox: { x: 0, y: 0, width: 300, height: 120 }, computedStyle: { overflowX: 'auto', display: 'flex' }, meta: { rendered: { dom: { className: 'product swiper carousel' }, guardrails: { unsupportedRegions: ['carousel', 'animated_regions'] } } }, children: [
        { kind: 'card', uiId: 'page.track.card1', visible: true, boundingBox: { x: 0, y: 0, width: 180, height: 100 }, computedStyle: {}, children: [] },
        { kind: 'card', uiId: 'page.track.card2', visible: true, boundingBox: { x: 220, y: 0, width: 180, height: 100 }, computedStyle: {}, children: [] }
      ] }
    ] }
  };
  const observed = createObservedDesignSystem(model, { title: 'fixture', ref: 'design-system/fixture' });
  assert.equal(observed.document.interactions.some((item: any) => item.value.pattern === 'carousel-like'), true);
  assert.equal(observed.document.interactions.some((item: any) => item.value.pattern === 'horizontal-scroll'), true);
  assert.equal(observed.document.handoff.acceptance.requiresCuration, true);
  const patternCommand = observed.commands.find((command: any) => command.type === 'set_plugin_data' && command.payload?.nodeRef === 'page.track' && command.payload?.pluginData?.key === 'interactive-pattern') as any;
  assert.equal(Boolean(patternCommand), true);
  const parsed = JSON.parse(patternCommand.payload.pluginData.value);
  assert.equal(parsed.version, 'interactive-pattern.v1');
  assert.equal(typeof parsed.recommendedHandling, 'string');
});

test('plugin runtime exposes design-system snapshot command', async () => {
  const source = require('node:fs').readFileSync('plugin-bridge/code.js', 'utf8');
  const writeTypes = require('node:fs').readFileSync('src/core/figma-write-types.ts', 'utf8');
  const guardrails = require('node:fs').readFileSync('src/core/mvp-guardrails.ts', 'utf8');
  assert.match(source, /'export_design_system_snapshot'/);
  assert.match(source, /function collectDesignSystemSnapshot/);
  assert.match(source, /design-system-document/);
  assert.match(source, /design-system-token/);
  assert.match(source, /design-system-bindings/);
  assert.match(writeTypes, /'export_design_system_snapshot'/);
  assert.match(guardrails, /'export_design_system_snapshot'/);
});
