import assert from 'node:assert/strict';
import test from 'node:test';

import { getGatewayCapabilities, getGatewayMvpScope } from '../../src/core/capabilities';

test('gateway capabilities expose stable MVP scope and configured write operations', () => {
  const scope = getGatewayMvpScope();
  assert.equal(scope.version, 'v1');
  assert.equal(scope.code.frameworks.includes('React'), true);
  assert.equal(scope.code.languages.includes('TypeScript'), true);
  assert.equal(scope.workflows.canCreateFigmaMockupFromCode, true);
  assert.equal(scope.workflows.canRoundTripArbitraryTechnologies, false);
  assert.equal(scope.excludes.includes('animations'), true);

  const capabilities = getGatewayCapabilities();
  assert.equal(capabilities.supportsCreatePage, true);
  assert.equal(capabilities.supportsCreateFile, false);
  assert.equal(capabilities.pluginBridgeConfigured, true);
  assert.deepEqual(capabilities.mvpScope, scope);
  assert.equal(capabilities.uiSources.includes('Rendered UI Model'), true);
  assert.equal(Array.isArray(capabilities.supportedWriteOperations), true);
});
