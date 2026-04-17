import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeNode } from '../../src/core/visual-debug';

test('summarizeNode produces compact visual snapshot for debug logging', () => {
  const summary = summarizeNode({
    uiId: 'landing.hero.title',
    kind: 'text',
    tag: 'h1',
    text: 'Build faster with reliable design sync that preserves structure and alignment.',
    children: [{}, {}],
    computedStyle: { color: 'rgb(255,255,255)' },
    asset: {},
    icon: { sourceType: 'inline-svg' },
    confidence: { needsReview: true }
  });
  assert.equal(summary.uiId, 'landing.hero.title');
  assert.equal(summary.kind, 'text');
  assert.equal(summary.tag, 'h1');
  assert.equal(summary.childCount, 2);
  assert.equal(summary.hasComputedStyle, true);
  assert.equal(summary.hasAsset, false);
  assert.equal(summary.hasIcon, true);
  assert.equal(summary.needsReview, true);
  assert.equal(typeof summary.text, 'string');
  assert.equal((summary.text as string).length <= 80, true);
});
