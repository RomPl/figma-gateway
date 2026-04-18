import assert from 'node:assert/strict';
import test from 'node:test';

import { createBlockIdentityFromNode } from '../../src/core/block-identity';
import type { UiNode } from '../../src/core/ui-model';

test('block identity uses stable uiId when available', () => {
  const node: UiNode = { kind: 'section', uiId: 'landing.hero', visible: true, children: [] };
  const identity = createBlockIdentityFromNode(node);
  assert.equal(identity.blockId, 'landing.hero');
  assert.equal(identity.stable, true);
  assert.equal(identity.identitySource, 'stable_ui_id');
});

test('block identity falls back to synthetic block id for auto nodes while preserving aliases', () => {
  const node: UiNode = {
    kind: 'frame',
    uiId: '__auto__/div[1]/section[1]',
    visible: true,
    name: 'Hero Panel',
    role: 'container',
    source: { jsxPath: 'Hero > Section[0]' },
    children: []
  };
  const identity = createBlockIdentityFromNode(node);
  assert.equal(identity.blockId.startsWith('block.frame.'), true);
  assert.equal(identity.stable, false);
  assert.equal(identity.aliases.includes('hero.panel'), true);
  assert.equal(identity.aliases.includes('role:container'), true);
});
