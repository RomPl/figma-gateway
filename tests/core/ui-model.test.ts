import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectSyncRequiredFieldPaths,
  deserializeUiModel,
  serializeUiModel,
  uiModelDocumentSchema
} from '../../src/core/ui-model';

test('ui-model serializes and deserializes a unified UI tree with declarative and computed layers', () => {
  const doc = uiModelDocumentSchema.parse({
    version: 'ui-model.v1',
    root: {
      kind: 'section',
      uiId: 'landing.hero',
      name: 'Hero',
      visible: true,
      layout: {
        type: 'vertical',
        gap: 24,
        padding: { top: 64, right: 64, bottom: 64, left: 64 }
      },
      style: {
        fill: 'color.brand.surface',
        radius: 24
      },
      declarativeStyle: {
        fill: 'color.brand.surface',
        radius: 24
      },
      computedStyle: {
        backgroundColor: 'rgb(15, 23, 42)',
        display: 'flex',
        gap: 24
      },
      boundingBox: {
        x: 0, y: 0, width: 1440, height: 720
      },
      responsive: {
        viewportWidth: 1440,
        breakpointName: 'desktop'
      },
      children: [
        {
          kind: 'text',
          uiId: 'landing.hero.title',
          role: 'headline',
          text: 'Build faster',
          visible: true,
          children: []
        }
      ]
    }
  });

  const json = serializeUiModel(doc);
  const roundTrip = deserializeUiModel(json);

  assert.equal(roundTrip.root.uiId, 'landing.hero');
  assert.equal(roundTrip.root.children[0].kind, 'text');
  assert.equal(roundTrip.root.children[0].text, 'Build faster');
  assert.equal(roundTrip.root.computedStyle?.display, 'flex');
});

test('ui-model exposes required sync fields for nodes with declarative, computed and responsive data', () => {
  const fields = collectSyncRequiredFieldPaths({
    kind: 'text',
    uiId: 'landing.hero.title',
    visible: true,
    text: 'Build faster',
    style: {
      fill: 'color.text.primary',
      text: {
        fontSize: 56,
        fontFamily: 'Inter'
      }
    },
    declarativeStyle: {
      fill: 'color.text.primary',
      text: {
        fontSize: 56,
        fontFamily: 'Inter'
      }
    },
    computedStyle: {
      color: 'rgb(255, 255, 255)',
      fontSize: 56,
      display: 'block'
    },
    boundingBox: { width: 640, height: 72 },
    responsive: { viewportWidth: 1440, breakpointName: 'desktop' },
    children: []
  });

  assert.deepEqual(fields, ['boundingBox', 'computedStyle', 'declarativeStyle.fill', 'declarativeStyle.text', 'kind', 'responsive', 'text', 'uiId', 'visible']);
});
