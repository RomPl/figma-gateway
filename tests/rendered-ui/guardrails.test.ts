import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { BrowserRendererService } from '../../src/core/browser-renderer';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';

const loginHtml = `<!doctype html><html><body><form action="/login"><input type="email" name="email" /><input type="password" name="password" /></form></body></html>`;

test('browser renderer blocks auth-gated pages without explicit allowAuthenticatedPages', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(loginHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const service = new BrowserRendererService();
    await assert.rejects(() => service.openPage({ target: { mode: 'existing_url', url }, browserExecutablePath: '/usr/bin/google-chrome' }), /authenticated\/login-gated page/i);
    const allowed = await service.openPage({ target: { mode: 'existing_url', url }, guardrails: { allowAuthenticatedPages: true }, browserExecutablePath: '/usr/bin/google-chrome' });
    assert.equal(allowed.pageAudit.hasAuthWall, true);
    assert.equal(allowed.pageAudit.hasPrivateInputs, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

const runtime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'profile.form',
    tag: 'section',
    text: undefined,
    treePath: 'profile.form',
    clientRect: { x: 0, y: 0, width: 600, height: 400 },
    computedStyle: { display: 'block', width: 600, height: 400 },
    visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
    media: {}, asset: {}, icon: {}, semantics: {},
    guardrails: { runtimeBaseline: 'trusted' },
    breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
    syncRelevantFields: [],
    children: [{
      uiId: 'profile.form.email',
      tag: 'input',
      text: undefined,
      treePath: 'profile.form > profile.form.email',
      clientRect: { x: 0, y: 0, width: 300, height: 40 },
      computedStyle: { display: 'block', width: 300, height: 40 },
      visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
      media: {}, asset: {}, icon: {}, semantics: {},
      guardrails: { privateDataRedacted: true, runtimeBaseline: 'untrusted', dynamicStatefulBlock: true, unsupportedRegions: ['animated_regions'] },
      breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
      syncRelevantFields: [],
      children: []
    }]
  })
};

test('rendered extractor propagates node guardrails into review metadata for private and dynamic blocks', async () => {
  const service = new RenderedUiExtractorService(runtime);
  const document = await service.extract({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'profile.form', guardrails: { allowPrivateDataCapture: false, allowRuntimeDataAsBaseline: false } });
  const child = document.root.children[0];
  const visualConfidence = (child.meta as any)?.visualConfidence ?? child.confidence;
  assert.equal(Boolean(visualConfidence?.needsReview || (child.meta as any)?.needsReview || (child.state as any)?.expanded), true);
});
