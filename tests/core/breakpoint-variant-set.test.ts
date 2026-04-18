import assert from 'node:assert/strict';
import test from 'node:test';

import { createBreakpointVariantSetFromDocument } from '../../src/core/breakpoint-variant-set';
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
