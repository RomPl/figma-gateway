import assert from 'node:assert/strict';
import test from 'node:test';

import { auditFirstPassVisualAcceptance } from '../../src/core/code-to-figma-pipeline';

const makeText = (uiId: string, text: string) => ({ kind: 'text' as const, uiId, visible: true, text, children: [] as any[] });
const makeFrame = (uiId: string, width: number, height: number, children: any[] = []) => ({
  kind: 'frame' as const,
  uiId,
  visible: true,
  boundingBox: { x: 0, y: 0, width, height },
  computedStyle: { width, height, backgroundColor: 'rgb(240,240,240)' },
  children
});

test('first-pass acceptance allows text-first landing pages with strong structure even without icon or asset coverage', () => {
  const sections = Array.from({ length: 4 }, (_, i) => makeFrame(`landing.section.${i+1}`, i === 0 ? 1280 : 220, i === 0 ? 720 : 140, [
    makeText(`landing.section.${i+1}.title`, `Title ${i+1}`),
    makeText(`landing.section.${i+1}.body`, `Body ${i+1}`),
    ...(i === 0 ? [{ kind: 'button' as const, uiId: 'landing.hero.cta', visible: true, text: 'Start', children: [] as any[] }] : [])
  ]));
  const model: any = {
    version: 'ui-model.v1',
    root: {
      kind: 'frame',
      uiId: 'landing.root',
      visible: true,
      computedStyle: { backgroundColor: 'rgb(250,250,250)', width: 1440, height: 1800 },
      boundingBox: { x: 0, y: 0, width: 1440, height: 1800 },
      children: [
        ...sections,
        makeFrame('landing.card.1', 260, 160, [makeText('landing.card.1.title', 'Card 1'), makeText('landing.card.1.body', 'Details')]),
        makeFrame('landing.card.2', 260, 160, [makeText('landing.card.2.title', 'Card 2'), makeText('landing.card.2.body', 'Details')]),
        makeFrame('landing.card.3', 260, 160, [makeText('landing.card.3.title', 'Card 3'), makeText('landing.card.3.body', 'Details')]),
        makeFrame('landing.card.4', 260, 160, [makeText('landing.card.4.title', 'Card 4'), makeText('landing.card.4.body', 'Details')]),
        makeFrame('landing.card.5', 260, 160, [makeText('landing.card.5.title', 'Card 5'), makeText('landing.card.5.body', 'Details')]),
        makeFrame('landing.card.6', 260, 160, [makeText('landing.card.6.title', 'Card 6'), makeText('landing.card.6.body', 'Details')]),
        makeFrame('landing.card.7', 260, 160, [makeText('landing.card.7.title', 'Card 7'), makeText('landing.card.7.body', 'Details')]),
        makeFrame('landing.card.8', 260, 160, [makeText('landing.card.8.title', 'Card 8'), makeText('landing.card.8.body', 'Details')])
      ]
    }
  };
  const acceptance = auditFirstPassVisualAcceptance(model);
  assert.equal(acceptance.passed, true);
  assert.equal(acceptance.coverage.simpleLandingLikeStructure, true);
  assert.equal(acceptance.issues.includes('missing icon or asset coverage'), false);
  assert.equal(acceptance.issues.includes('insufficient large visual container coverage'), false);
});
