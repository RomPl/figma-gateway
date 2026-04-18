import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlanningContextFromNode } from '../../src/core/planning-context';
import type { UiNode } from '../../src/core/ui-model';

const baseNode = (): UiNode => ({
  kind: 'frame',
  uiId: 'app.root',
  visible: true,
  responsive: { viewportWidth: 1024, viewportHeight: 768, breakpointName: 'tablet' },
  meta: {
    renderProfile: { surfaceMode: 'auth_gated_spa', authenticated: true, rootStrategy: 'preferred_selector', preferredRootSelectors: [], preserveOuterShell: true, expectPersistentShell: true, allowBodyFallback: true, notes: [] },
    renderSurface: { shellSelectionMode: 'preferred-selector:main', contentSelectionMode: 'shell-content:section', shellPreserved: true, shellRootTag: 'main', contentRootTag: 'section' }
  },
  children: []
});

test('planning context derives surface and breakpoint family from root metadata', () => {
  const context = createPlanningContextFromNode(baseNode());
  assert.equal(context.surfaceMode, 'auth_gated_spa');
  assert.equal(context.breakpointFamily, 'tablet');
  assert.equal(context.shellPreserved, true);
  assert.equal(context.contentRootTag, 'section');
});

test('planning context falls back to viewport width when breakpoint name is absent', () => {
  const node = baseNode();
  node.responsive = { viewportWidth: 375, viewportHeight: 812 };
  const context = createPlanningContextFromNode(node);
  assert.equal(context.breakpointFamily, 'mobile');
});
