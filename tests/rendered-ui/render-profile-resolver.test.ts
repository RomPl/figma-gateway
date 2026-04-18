import assert from 'node:assert/strict';
import test from 'node:test';

import { RenderProfileResolver } from '../../src/core/render-profile-resolver';

const resolver = new RenderProfileResolver();

test('render profile resolver keeps explicit ui root as component mode', () => {
  const profile = resolver.resolve({
    target: { mode: 'existing_url', url: 'http://127.0.0.1:3000/demo' },
    rootUiId: 'hero.root'
  });

  assert.equal(profile.surfaceMode, 'component');
  assert.equal(profile.rootStrategy, 'explicit_ui_id');
  assert.equal(profile.preferredRootSelectors[0], '[data-ui-id="hero.root"]');
});

test('render profile resolver universalizes app shell routes without framework specific profiles', () => {
  const profile = resolver.resolve({
    target: { mode: 'existing_url', url: 'https://example.com/app/dashboard' }
  });

  assert.equal(profile.surfaceMode, 'auth_gated_spa');
  assert.equal(profile.rootStrategy, 'preferred_selector');
  assert.equal(profile.preferredRootSelectors.includes('#__next') || profile.preferredRootSelectors.includes('#root'), true);
});
