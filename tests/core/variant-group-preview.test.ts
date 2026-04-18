import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVariantGroupPreview } from '../../src/core/variant-group-preview';
import type { UiModelDocument } from '../../src/core/ui-model';

test('variant group preview summarizes per-breakpoint variant refs', () => {
  const mobile: UiModelDocument = {
    version: 'ui-model.v1',
    root: {
      kind: 'section', uiId: 'landing.hero--mobile', visible: true,
      meta: {
        breakpointVariantRef: { originalUiId: 'landing.hero', breakpointFamily: 'mobile', variantUiId: 'landing.hero--mobile' },
        breakpointVariantSet: { variantGroupId: 'landing.hero', active: 'mobile', available: ['mobile', 'desktop'], mode: 'multi_snapshot_ready', preferredOrder: ['desktop', 'tablet', 'mobile'] },
        blockIdentity: { blockId: 'landing.hero', aliases: ['hero.primary'], identitySource: 'stable_ui_id', stable: true }
      },
      children: []
    }
  };
  const desktop: UiModelDocument = {
    version: 'ui-model.v1',
    root: {
      kind: 'section', uiId: 'landing.hero--desktop', visible: true,
      meta: {
        breakpointVariantRef: { originalUiId: 'landing.hero', breakpointFamily: 'desktop', variantUiId: 'landing.hero--desktop' },
        breakpointVariantSet: { variantGroupId: 'landing.hero', active: 'desktop', available: ['mobile', 'desktop'], mode: 'multi_snapshot_ready', preferredOrder: ['desktop', 'tablet', 'mobile'] },
        blockIdentity: { blockId: 'landing.hero', aliases: ['hero.primary'], identitySource: 'stable_ui_id', stable: true }
      },
      children: []
    }
  };
  const preview = buildVariantGroupPreview({ mobile, desktop });
  assert.equal(preview?.variantGroupId, 'landing.hero');
  assert.equal(preview?.variantUiIdsByBreakpoint.mobile, 'landing.hero--mobile');
  assert.equal(preview?.variantUiIdsByBreakpoint.desktop, 'landing.hero--desktop');
  assert.equal(preview?.aliases.includes('hero.primary'), true);
});
