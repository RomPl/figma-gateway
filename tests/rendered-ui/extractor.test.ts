import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { RenderedUiExtractorService, type RenderedUiRuntime, RENDERED_UI_CONTRACT_VERSION } from '../../src/core/rendered-ui-extractor';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const mockRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster Start',
    treePath: 'landing.hero',
    clientRect: { x: 0, y: 0, width: 1440, height: 720 },
    computedStyle: {
      backgroundColor: 'rgb(15, 23, 42)', borderColor: 'rgb(148, 163, 184)', borderWidth: 1, borderStyle: 'solid', borderRadius: 24,
      boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px', opacity: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
      paddingTop: 64, paddingRight: 64, paddingBottom: 64, paddingLeft: 64, width: 1440, height: 720, position: 'relative'
    },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 },
    media: {},
    asset: {},
    icon: {},
    semantics: { role: 'region', clickTarget: false, hidden: false },
    breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
    syncRelevantFields: ['computedStyle.backgroundColor', 'computedStyle.gap', 'clientRect.width'],
    children: [
      {
        uiId: 'landing.hero.title',
        tag: 'h1',
        text: 'Build faster',
        treePath: 'landing.hero > landing.hero.title',
        clientRect: { x: 64, y: 80, width: 640, height: 72 },
        computedStyle: { color: 'rgb(255, 255, 255)', fontFamily: 'Inter', fontSize: 56, fontWeight: '700', lineHeight: 64, letterSpacing: 0, textAlign: 'center', display: 'block', width: 640, height: 72, position: 'static' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
        media: {},
        asset: {},
        icon: {},
        semantics: { headingLevel: 1, clickTarget: false, hidden: false },
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: ['text', 'computedStyle.fontSize', 'computedStyle.color'],
        children: []
      },
      {
        uiId: 'landing.hero.ctaIcon',
        tag: 'svg',
        text: undefined,
        treePath: 'landing.hero > landing.hero.ctaIcon',
        clientRect: { x: 64, y: 150, width: 20, height: 20 },
        computedStyle: { color: 'rgb(255, 255, 255)', display: 'block', width: 20, height: 20, position: 'static' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
        media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' },
        asset: { layer: 'svg-icon', role: 'content' },
        icon: { sourceType: 'inline-svg', textLabel: 'Arrow right', fill: 'rgb(255, 255, 255)', stroke: 'none', size: { width: 20, height: 20 }, placement: 'leading' },
        semantics: { clickTarget: false, hidden: false },
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: ['icon.fill', 'icon.size.width', 'icon.placement'],
        children: []
      },
      {
        uiId: 'landing.hero.image',
        tag: 'img',
        text: undefined,
        treePath: 'landing.hero > landing.hero.image',
        clientRect: { x: 700, y: 80, width: 320, height: 240 },
        computedStyle: { display: 'block', width: 320, height: 240, position: 'relative' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
        media: { kind: 'img', sourceUrl: 'https://cdn.example/hero.png', alt: 'Hero illustration', contentRole: 'content' },
        asset: { layer: 'image', sourceUrl: 'https://cdn.example/hero.png', resolvedAssetPath: '/hero.png', naturalSize: { width: 1280, height: 960 }, renderedSize: { width: 320, height: 240 }, objectFit: 'cover', alt: 'Hero illustration', role: 'content' },
        icon: {},
        semantics: { clickTarget: false, hidden: false },
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: ['asset.sourceUrl', 'asset.renderedSize.width'],
        children: []
      },
      {
        uiId: 'landing.hero.cta',
        tag: 'button',
        text: 'Start',
        treePath: 'landing.hero > landing.hero.cta',
        clientRect: { x: 64, y: 184, width: 180, height: 48 },
        computedStyle: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(37, 99, 235)', borderRadius: 12, opacity: 1, fontFamily: 'Inter', fontSize: 16, fontWeight: '600', lineHeight: 24, letterSpacing: 0, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingRight: 20, paddingBottom: 12, paddingLeft: 20, width: 180, height: 48, position: 'relative' },
        visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 },
        media: {},
        asset: {},
        icon: {},
        semantics: { role: 'button', clickTarget: true, hidden: false },
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: ['text', 'computedStyle.backgroundColor', 'computedStyle.borderRadius'],
        children: []
      }
    ]
  })
};

test('rendered ui extractor normalizes asset and icon layers into Unified UI Model metadata', async () => {
  const service = new RenderedUiExtractorService(mockRuntime);
  const document = await service.extract({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' });

  assert.equal(document.root.uiId, 'landing.hero');
  assert.equal(document.root.kind, 'section');
  assert.equal(document.root.layout?.type, 'vertical');
  assert.equal(document.root.layout?.gap, 24);
  assert.equal(document.root.padding?.top, 64);
  assert.equal(document.root.style?.radius, 24);
  assert.equal(document.root.children[0].kind, 'text');
  assert.equal(document.root.children[0].text, 'Build faster');
  assert.equal(document.root.children[1].kind, 'icon');
  assert.equal(document.root.children[2].kind, 'image');
  assert.equal(document.root.children[3].kind, 'button');
  assert.equal((document.root.children[1].meta as any)?.rendered?.icon?.sourceType, 'inline-svg');
  assert.equal((document.root.children[2].meta as any)?.rendered?.asset?.layer, 'image');
  assert.equal((document.root.children[2].meta as any)?.rendered?.asset?.resolvedAssetPath, '/hero.png');
  assert.equal((document.root.meta as any)?.rendered?.treePath, 'landing.hero');
  assert.equal((document.root.meta as any)?.rendered?.contractVersion, RENDERED_UI_CONTRACT_VERSION);
});

test('rendered ui route exposes rendered DOM -> UI model extraction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rendered-ui-api-'));
  const dbPath = join(dir, 'rendered-ui.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/extract`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' })
      });
      const json = (await response.json()) as { data: { root: { uiId: string; children: Array<{ uiId: string }> } } };
      assert.equal(response.status, 200);
      assert.equal(json.data.root.uiId, 'landing.hero');
      assert.equal(json.data.root.children[1].uiId, 'landing.hero.ctaIcon');
      assert.equal(json.data.root.children[2].uiId, 'landing.hero.image');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('rendered extractor does not promote generic ancestor containers to svg-icon when they only contain descendant svg nodes', async () => {
  const html = `<!doctype html><html><body>
    <div data-ui-id="layout.root" class="shell">
      <div data-ui-id="layout.wrapper" class="wrapper">
        <a data-ui-id="layout.link" href="#">
          <span data-ui-id="layout.label">Docs</span>
          <svg data-ui-id="layout.icon" viewBox="0 0 24 24" aria-label="Arrow"><path d="M5 12h14"></path></svg>
        </a>
      </div>
    </div>
  </body></html>`;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to get server address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const service = new RenderedUiExtractorService();
    const document = await service.extract({ target: { mode: 'existing_url', url }, rootUiId: 'layout.root', browserExecutablePath: '/usr/bin/google-chrome', breakpointName: 'desktop' });
    const root = document.root;
    const wrapper = root.children[0];
    const link = wrapper.children[0];
    const icon = link.children.find((child) => child.uiId === 'layout.icon');
    assert.equal(root.kind === 'icon', false);
    assert.equal(wrapper.kind === 'icon', false);
    assert.equal(link.kind === 'icon', false);
    assert.equal((root.meta as any)?.rendered?.asset?.layer ?? null, null);
    assert.equal((wrapper.meta as any)?.rendered?.asset?.layer ?? null, null);
    assert.equal((link.meta as any)?.rendered?.asset?.layer ?? null, null);
    assert.equal(icon?.kind, 'icon');
    assert.equal((icon?.meta as any)?.rendered?.icon?.sourceType, 'inline-svg');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('rendered extractor assigns non-root synthetic auto ids to nested svg elements without data-ui-id', async () => {
  const html = `<!doctype html><html><body>
    <div data-ui-id="layout.root">
      <span data-ui-id="layout.badge">
        <svg viewBox="0 0 24 24"><path d="M5 12h14"></path></svg>
      </span>
    </div>
  </body></html>`;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to get server address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const service = new RenderedUiExtractorService();
    const document = await service.extract({ target: { mode: 'existing_url', url }, rootUiId: 'layout.root', browserExecutablePath: '/usr/bin/google-chrome', breakpointName: 'desktop' });
    const badge = document.root.children[0];
    const icon = badge.children[0];
    assert.equal(icon.uiId === '__auto__/', false);
    assert.equal(icon.uiId.startsWith('__auto__/span[1]/svg[') || icon.uiId.includes('/svg['), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('rendered extractor keeps text for inline-flex badge containers that have svg child plus own text', async () => {
  const html = `<!doctype html><html><body>
    <div data-ui-id="hero.root">
      <span class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
        <svg class="lucide lucide-sparkles h-4 w-4" viewBox="0 0 24 24"><path d="M12 3 10 9 3 12l7 3 2 6 2-6 7-3-7-3-2-6Z"></path></svg>
        AI-Powered Presentations
      </span>
    </div>
  </body></html>`;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to get server address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const service = new RenderedUiExtractorService();
    const document = await service.extract({ target: { mode: 'existing_url', url }, rootUiId: 'hero.root', browserExecutablePath: '/usr/bin/google-chrome', breakpointName: 'desktop' });
    const badge = document.root.children[0];
    assert.equal(badge.text, 'AI-Powered Presentations');
    assert.equal(badge.children.some((child) => child.kind === 'icon'), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('rendered extractor preserves small visual icon-holder wrappers with svg children', async () => {
  const html = `<!doctype html><html><body>
    <div data-ui-id="layout.root">
      <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10" style="display:flex;width:48px;height:48px;align-items:center;justify-content:center;border-radius:8px;background:rgba(36,99,235,0.1)">
        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 12h14"></path></svg>
      </div>
      <div class="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30" style="display:flex;width:64px;height:64px;align-items:center;justify-content:center;border-radius:9999px;background:rgb(36,99,235);box-shadow:rgba(36,99,235,0.3) 0px 10px 15px -3px, rgba(36,99,235,0.3) 0px 4px 6px -4px;margin-top:-24px;">
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 3 10 9 3 12"></path></svg>
      </div>
    </div>
  </body></html>`;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to get server address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const service = new RenderedUiExtractorService();
    const document = await service.extract({ target: { mode: 'existing_url', url }, rootUiId: 'layout.root', browserExecutablePath: '/usr/bin/google-chrome', breakpointName: 'desktop' });
    const wrappers = document.root.children.filter((child) => child.kind === 'frame').sort((a, b) => (a.boundingBox?.width ?? 0) - (b.boundingBox?.width ?? 0));
    assert.equal(wrappers.length, 2);
    const small = wrappers.find((child) => child.boundingBox?.width === 48 && child.boundingBox?.height === 48);
    const large = wrappers.find((child) => child.boundingBox?.width === 64 && child.boundingBox?.height === 64);
    assert.equal(Boolean(small), true);
    assert.equal(Boolean(large), true);
    assert.equal((small?.icon as any)?.sourceType ?? null, null);
    assert.equal((large?.icon as any)?.sourceType ?? null, null);
    assert.equal(small?.children[0]?.kind, 'icon');
    assert.equal(large?.children[0]?.kind, 'icon');
    assert.equal((large?.style as any)?.radius !== undefined, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
