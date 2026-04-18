import assert from 'node:assert/strict';
import test from 'node:test';

import { createBreakpointVariantSetFromDocument } from '../../src/core/breakpoint-variant-set';
import { materializeBreakpointVariantNodeRefs } from '../../src/core/breakpoint-variant-materializer';
import type { UiModelDocument } from '../../src/core/ui-model';

test('breakpoint variant set records active and available families for single breakpoint runs', () => {
  const document: UiModelDocument = {
    version: 'ui-model.v1',
    root: {
      kind: 'section',
      uiId: 'landing.hero',
      visible: true,
      responsive: { breakpointName: 'desktop', viewportWidth: 1440 },
      meta: { blockIdentity: { blockId: 'landing.hero', aliases: ['hero.primary'], identitySource: 'stable_ui_id', stable: true } },
      children: []
    }
  };
  const variantSet = createBreakpointVariantSetFromDocument(document);
  assert.equal(variantSet.active, 'desktop');
  assert.deepEqual(variantSet.available, ['desktop']);
  assert.equal(variantSet.variantGroupId, 'landing.hero');
});

test('breakpoint variant set can advertise multi-snapshot readiness', () => {
  const document: UiModelDocument = {
    version: 'ui-model.v1',
    root: { kind: 'section', uiId: 'landing.hero', visible: true, responsive: { breakpointName: 'mobile', viewportWidth: 390 }, children: [] }
  };
  const variantSet = createBreakpointVariantSetFromDocument(document, ['mobile', 'tablet', 'desktop']);
  assert.equal(variantSet.mode, 'multi_snapshot_ready');
  assert.deepEqual(variantSet.available, ['mobile', 'tablet', 'desktop']);
});


import { materializeBreakpointVariantNodeRefs } from '../../src/core/breakpoint-variant-materializer';

test('breakpoint variant materialization preserves original uiIds in variant refs and block identity aliases', () => {
  const document: UiModelDocument = {
    version: 'ui-model.v1',
    root: {
      kind: 'section',
      uiId: 'landing.hero',
      visible: true,
      meta: { blockIdentity: { blockId: 'landing.hero', primaryUiId: 'landing.hero', aliases: ['hero.primary'], stable: true, identitySource: 'stable_ui_id' } },
      children: [{
        kind: 'text',
        uiId: 'landing.hero.title',
        visible: true,
        meta: { blockIdentity: { blockId: 'landing.hero.title', aliases: ['hero.title'], stable: true, identitySource: 'stable_ui_id' } },
        children: []
      }]
    }
  };
  const materialized = materializeBreakpointVariantNodeRefs(document, 'mobile');
  assert.equal(materialized.root.uiId, 'landing.hero--mobile');
  assert.equal((materialized.root.meta as any)?.breakpointVariantRef?.originalUiId, 'landing.hero');
  assert.equal((materialized.root.meta as any)?.blockIdentity?.primaryUiId, 'landing.hero');
  assert.deepEqual((materialized.root.meta as any)?.blockIdentity?.aliases, ['landing.hero', 'hero.primary']);
  assert.equal(materialized.root.children[0]?.uiId, 'landing.hero.title--mobile');
  assert.equal((materialized.root.children[0]?.meta as any)?.breakpointVariantRef?.originalUiId, 'landing.hero.title');
  assert.equal((materialized.root.children[0]?.meta as any)?.blockIdentity?.primaryUiId, 'landing.hero.title');
  assert.deepEqual((materialized.root.children[0]?.meta as any)?.blockIdentity?.aliases, ['landing.hero.title', 'hero.title']);
});
