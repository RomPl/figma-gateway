import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectSyncRequiredFieldPaths,
  deserializeUiModel,
  serializeUiModel,
  uiModelDocumentSchema
} from '../../src/core/ui-model';

test('ui-model serializes and deserializes a minimal unified UI tree', () => {
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
});

test('ui-model exposes required sync fields for text-centric nodes', () => {
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
    children: []
  });

  assert.deepEqual(fields, ['kind', 'style.fill', 'style.text', 'text', 'uiId', 'visible']);
});
