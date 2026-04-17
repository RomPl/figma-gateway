import assert from 'node:assert/strict';
import test from 'node:test';

import type { UiModelDocument } from '../../src/core/ui-model';
import { annotateVisualConfidence, calculateNodeVisualConfidence } from '../../src/core/visual-confidence';
import { assertVisualPageAuditAllowed, classifyNodeGuardrails } from '../../src/core/visual-guardrails';
import { AppError } from '../../src/core/errors';

const documentOf = (root: any): UiModelDocument => ({ version: 'ui-model.v1', root });

test('classifyNodeGuardrails collects review reasons from guardrail metadata', () => {
  const result = classifyNodeGuardrails({
    guardrails: {
      privateDataRedacted: true,
      runtimeBaseline: 'untrusted',
      dynamicStatefulBlock: true,
      unsupportedRegions: ['canvas', 'carousel']
    }
  });

  assert.equal(result.needsReview, true);
  assert.deepEqual(result.reasons, ['private data redacted', 'runtime baseline untrusted', 'dynamic stateful block', 'canvas', 'carousel']);
});

test('assertVisualPageAuditAllowed blocks authenticated pages unless explicitly allowed', () => {
  assert.throws(() => assertVisualPageAuditAllowed({ hasAuthWall: true }, { allowAuthenticatedPages: false }), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'VISUAL_GUARDRAIL_AUTH_REQUIRED');
    return true;
  });

  const allowed = assertVisualPageAuditAllowed({ hasAuthWall: true, reasons: ['login wall'] }, { allowAuthenticatedPages: true });
  assert.equal(allowed.hasAuthWall, true);
  assert.deepEqual(allowed.reasons, ['login wall']);
});

test('calculateNodeVisualConfidence lowers confidence when guardrails demand review', () => {
  const node: any = {
    kind: 'frame',
    uiId: 'landing.hero',
    visible: true,
    source: { codePath: 'src/components/Hero.tsx', jsxPath: 'Hero > section[1]', lineStart: 10, lineEnd: 30 },
    boundingBox: { x: 0, y: 0, width: 1200, height: 600 },
    computedStyle: { backgroundColor: 'rgb(15,23,42)' },
    state: { visible: true },
    responsive: { breakpointName: 'desktop' },
    asset: {},
    icon: {},
    meta: { guardrails: { runtimeBaseline: 'untrusted', unsupportedRegions: ['canvas'] } },
    children: []
  };

  const confidence = calculateNodeVisualConfidence(node);
  assert.equal(confidence.needsReview, true);
  assert.equal(confidence.visual < 0.8, true);
  assert.equal(confidence.reasons.includes('runtime baseline untrusted'), true);
  assert.equal(confidence.reasons.includes('canvas'), true);
  assert.equal(confidence.reasons.includes('low visual confidence'), true);
});

test('annotateVisualConfidence writes confidence and meta.needsReview recursively', () => {
  const document = documentOf({
    kind: 'frame',
    uiId: 'landing.hero',
    visible: true,
    source: { codePath: 'src/components/Hero.tsx', jsxPath: 'Hero > section[1]', lineStart: 1, lineEnd: 10 },
    boundingBox: { x: 0, y: 0, width: 1200, height: 600 },
    computedStyle: { backgroundColor: 'rgb(15,23,42)' },
    state: { visible: true },
    responsive: { breakpointName: 'desktop' },
    meta: {},
    children: [
      {
        kind: 'text',
        uiId: 'landing.hero.title',
        text: 'Build faster',
        visible: true,
        source: { codePath: 'src/components/Hero.tsx' },
        meta: { guardrails: { dynamicStatefulBlock: true } },
        children: []
      }
    ]
  });

  annotateVisualConfidence(document);
  assert.equal(typeof document.root.confidence?.visual, 'number');
  assert.equal(document.root.meta?.needsReview, false);
  assert.equal(document.root.children[0].meta?.needsReview, true);
  assert.equal(document.root.children[0].confidence?.reasons.includes('dynamic stateful block'), true);
});
