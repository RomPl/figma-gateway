import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { BrowserRendererService } from '../../src/core/browser-renderer';

const html = `<!doctype html><html><head><title>Hydrated Page</title></head><body><div id="app" data-ui-id="landing.hero" data-hydrated="true">Hello</div></body></html>`;

test('browser renderer opens existing url with stability wait and returns live page metadata', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const service = new BrowserRendererService();
    const result = await service.openPage({
      target: { mode: 'existing_url', url },
      waitUntil: 'domcontentloaded',
      hydrationSelector: '[data-hydrated="true"]',
      browserExecutablePath: '/usr/bin/google-chrome'
    });
    assert.equal(result.resolvedUrl, url);
    assert.equal(result.title, 'Hydrated Page');
    assert.equal(result.targetMode, 'existing_url');
    assert.equal(result.htmlLength > 20, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('browser renderer reports risky visual audit regions for canvas carousel and animated content', async () => {
  const auditHtml = `<!doctype html><html><head><title>Audit Page</title><style>@keyframes pulse{from{opacity:0.5}to{opacity:1}} .animated{animation:pulse 1s infinite}</style></head><body><div class="carousel" aria-roledescription="carousel">Slides</div><canvas id="chart"></canvas><div class="animated">Animated</div></body></html>`;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(auditHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const service = new BrowserRendererService();
    const result = await service.openPage({
      target: { mode: 'existing_url', url },
      waitUntil: 'domcontentloaded',
      browserExecutablePath: '/usr/bin/google-chrome',
      guardrails: { allowAuthenticatedPages: true }
    });
    assert.equal(result.pageAudit.hasCanvas, true);
    assert.equal(result.pageAudit.hasCarousel, true);
    assert.equal(result.pageAudit.hasAnimatedRegions, true);
    assert.equal(result.pageAudit.riskyRegions.includes('canvas'), true);
    assert.equal(result.pageAudit.riskyRegions.includes('carousel'), true);
    assert.equal(result.pageAudit.riskyRegions.includes('animated_regions'), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
