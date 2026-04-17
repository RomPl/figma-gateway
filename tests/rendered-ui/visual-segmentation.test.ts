import assert from 'node:assert/strict';
import test from 'node:test';

import type { UiModelDocument } from '../../src/core/ui-model';
import { segmentVisualBlocks } from '../../src/core/visual-segmentation';

const documentOf = (root: any): UiModelDocument => ({ version: 'ui-model.v1', root });

test('segmentation annotates identity roles and boundary kinds without changing stable uiId', () => {
  const input = documentOf({
    kind: 'frame',
    uiId: 'landing.hero',
    name: 'section-hero',
    visible: true,
    source: { codePath: 'src/components/Hero.tsx', jsxPath: 'Hero > section[1]' },
    computedStyle: { backgroundColor: 'rgb(15, 23, 42)', width: 1200, height: 400 },
    children: []
  });

  const segmented = segmentVisualBlocks(input);
  assert.equal(segmented.root.uiId, 'landing.hero');
  assert.equal((segmented.root.meta as any)?.identity?.sourceUiId, 'landing.hero');
  assert.equal((segmented.root.meta as any)?.identity?.visualUiId, 'landing.hero');
  assert.equal((segmented.root.meta as any)?.segmentation?.boundaryKind, 'component-boundary');
  assert.equal((segmented.root.meta as any)?.segmentation?.blockBoundary, true);
});

test('segmentation collapses synthetic technical wrappers but preserves child visual node identity', () => {
  const input = documentOf({
    kind: 'frame',
    uiId: '__auto__/',
    name: 'body',
    visible: true,
    computedStyle: { width: 1440, height: 900 },
    children: [
      {
        kind: 'frame',
        uiId: '__auto__/div[1]',
        name: 'div-wrapper',
        visible: true,
        computedStyle: { width: 1200, height: 600 },
        children: [
          {
            kind: 'frame',
            uiId: '__auto__/div[1]/section[1]',
            name: 'section-hero',
            visible: true,
            computedStyle: { backgroundColor: 'rgb(20,20,20)', width: 1200, height: 600, borderRadius: 24 },
            children: []
          }
        ]
      }
    ]
  });

  const segmented = segmentVisualBlocks(input);
  const firstChild = segmented.root.children[0];
  assert.equal(firstChild.uiId, '__auto__/div[1]/section[1]');
  assert.equal((firstChild.meta as any)?.segmentation?.inheritedWrapperUiId, '__auto__/div[1]');
  assert.equal(((firstChild.meta as any)?.segmentation?.collapsedWrapperUiIds ?? []).includes('__auto__/div[1]'), true);
  assert.equal((firstChild.meta as any)?.segmentation?.boundaryKind, 'visual-block');
});
