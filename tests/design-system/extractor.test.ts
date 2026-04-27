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
        { kind: 'button', uiId: 'page.cta', text: 'Order', visible: true, boundingBox: { x: 40, y: 140, width: 170, height: 40 }, computedStyle: { backgroundColor: 'rgb(130, 230, 0)', color: 'rgb(26, 26, 26)', fontFamily: 'Inter, Arial, sans-serif', fontSize: 14, lineHeight: 20, fontWeight: '500', borderRadius: 2, paddingLeft: 16, paddingRight: 4, gap: 10, boxShadow: 'none' }, children: [] },
        { kind: 'frame', uiId: 'page.card', name: 'product-card', visible: true, boundingBox: { x: 40, y: 220, width: 320, height: 180 }, computedStyle: { backgroundColor: 'rgb(50, 69, 103)', color: 'rgb(255,255,255)', borderRadius: 12, boxShadow: 'rgba(15, 23, 42, 0.24) 0px 12px 24px -8px', paddingTop: 24, paddingLeft: 24 }, children: [] }
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
});

test('observed design system figma commands create editable sidecar with reverse-sync metadata', () => {
  const ds: any = {
    version: 'observed-design-system.v1',
    title: 'parts.avtopribor.ru',
    sourceUrl: 'https://parts.avtopribor.ru/',
    generatedAt: '2026-04-27T00:00:00.000Z',
    summary: { colors: 1, typography: 1, spacing: 1, radius: 1, shadows: 0, components: 1 },
    colors: [{ id: 'color.primary', name: 'color.brand.primary', kind: 'color', value: { hex: '#82E600', rgb: { r: 130, g: 230, b: 0, a: 1 }, usage: ['background'] }, count: 3, confidence: 0.8, evidence: [{ uiId: 'page.cta', usage: 'background' }] }],
    typography: [{ id: 'typography.h1', name: 'typography.h1.1', kind: 'typography', value: { fontFamily: 'Inter', fontSize: 48, lineHeight: 56, fontWeight: '700', role: 'h1' }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.h1', usage: 'h1' }] }],
    spacing: [{ id: 'spacing.20', name: 'spacing.20', kind: 'spacing', value: { value: 20, usage: ['gap'] }, count: 2, confidence: 0.6, evidence: [{ uiId: 'page.grid', usage: 'gap' }] }],
    radius: [{ id: 'radius.2', name: 'radius.2', kind: 'radius', value: { value: 2, usage: ['border-radius'] }, count: 2, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'border-radius' }] }],
    shadows: [],
    components: [{ id: 'component.button', name: 'component.button.primary', kind: 'component', value: { role: 'button', width: 170, height: 40, fill: '#82E600', color: '#1A1A1A', radius: 2 }, count: 1, confidence: 0.6, evidence: [{ uiId: 'page.cta', usage: 'button' }] }]
  };
  const commands = buildDesignSystemFigmaCommands(ds, { ref: 'design-system/test', x: 1600, y: 0 });
  assert.equal(commands[0].type, 'delete_matching_nodes');
  assert.equal(commands.some((command: any) => command.type === 'create_frame' && command.payload?.ref === 'design-system/test'), true);
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.nodeRef === 'design-system/test' && command.payload?.pluginData?.key === 'design-system-document'), true);
  assert.equal(commands.some((command: any) => command.type === 'set_plugin_data' && command.payload?.pluginData?.key === 'design-system-token'), true);
  assert.equal(commands.some((command: any) => command.type === 'create_text' && String(command.payload?.text || '').includes('Observed Design System')), true);
});
