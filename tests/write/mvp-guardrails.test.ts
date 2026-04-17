import assert from 'node:assert/strict';
import test from 'node:test';

import { assertMvpWriteBatchAllowed, assertMvpWriteCommandAllowed } from '../../src/core/mvp-guardrails';

test('mvp guardrails allow simple visual sync commands', () => {
  assert.doesNotThrow(() =>
    assertMvpWriteCommandAllowed({
      type: 'set_text_content',
      payload: {
        nodeId: '1:2',
        text: 'Updated headline',
        kind: 'text'
      }
    })
  );
});

test('mvp guardrails block unsupported feature hints', () => {
  assert.throws(
    () =>
      assertMvpWriteCommandAllowed({
        type: 'set_plugin_data',
        payload: {
          nodeId: '1:2',
          value: 'animation'
        }
      }),
    (error: unknown) => {
      assert.equal(typeof error, 'object');
      assert.equal((error as { code?: string }).code, 'MVP_SCOPE_VIOLATION');
      return true;
    }
  );
});

test('mvp guardrails block unsupported low-level commands in batch', () => {
  assert.throws(
    () =>
      assertMvpWriteBatchAllowed([
        {
          type: 'set_component_properties',
          payload: { nodeId: '1:9' }
        }
      ]),
    (error: unknown) => {
      assert.equal(typeof error, 'object');
      assert.equal((error as { code?: string }).code, 'MVP_SCOPE_VIOLATION');
      return true;
    }
  );
});
