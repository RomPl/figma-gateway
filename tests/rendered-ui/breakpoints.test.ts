import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const breakpointRuntime: RenderedUiRuntime = {
  capture: async (input) => {
    const width = input.viewport.width;
    const breakpointName = input.breakpointName ?? 'unknown';
    const mobile = width <= 480;
    return {
      uiId: 'landing.hero',
      tag: 'section',
      text: mobile ? 'Mobile hero' : 'Desktop hero',
      treePath: 'landing.hero',
      clientRect: { x: 0, y: 0, width, height: mobile ? 540 : 720 },
      computedStyle: {
        display: 'flex',
        flexDirection: mobile ? 'column' : 'row',
        gap: mobile ? 16 : 24,
        width,
        height: mobile ? 540 : 720,
        backgroundColor: 'rgb(15, 23, 42)'
      },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 },
      media: {}, asset: {}, icon: {}, semantics: {},
      breakpoint: { viewportWidth: width, viewportHeight: input.viewport.height, name: breakpointName },
      syncRelevantFields: ['computedStyle.gap', 'computedStyle.width'],
      children: []
    };
  }
};

test('rendered ui extractor supports explicit single breakpoint presets', async () => {
  const service = new RenderedUiExtractorService(breakpointRuntime);
  const mobile = await service.extract({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoint: 'mobile' });
  const desktop = await service.extract({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoint: 'desktop' });

  assert.equal(mobile.root.responsive?.breakpointName, 'mobile');
  assert.equal(mobile.root.boundingBox?.width, 390);
  assert.equal(mobile.root.layout?.type, 'vertical');
  assert.equal(desktop.root.responsive?.breakpointName, 'desktop');
  assert.equal(desktop.root.boundingBox?.width, 1440);
  assert.equal(desktop.root.layout?.type, 'horizontal');
});

test('rendered ui extractor returns snapshot sets for multiple explicit breakpoints', async () => {
  const service = new RenderedUiExtractorService(breakpointRuntime);
  const result = await service.extractBreakpoints({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoints: ['mobile', 'desktop'] });

  assert.equal(result.activeBreakpoint, 'mobile');
  assert.equal(result.snapshots.mobile.root.responsive?.breakpointName, 'mobile');
  assert.equal(result.snapshots.desktop.root.responsive?.breakpointName, 'desktop');
  assert.equal(result.snapshots.mobile.root.boundingBox?.width, 390);
  assert.equal(result.snapshots.desktop.root.boundingBox?.width, 1440);
});

test('rendered ui breakpoint route exposes explicit multi-breakpoint snapshots', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rendered-ui-breakpoints-'));
  const dbPath = join(dir, 'rendered-ui.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/extract-breakpoints`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoints: ['mobile', 'desktop'] })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.activeBreakpoint, 'mobile');
      assert.equal(json.data.snapshots.mobile.root.responsive.breakpointName, 'mobile');
      assert.equal(json.data.snapshots.desktop.root.responsive.breakpointName, 'desktop');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('rendered ui diagnose-breakpoints route exposes breakpoint summaries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rendered-ui-diagnose-breakpoints-'));
  const dbPath = join(dir, 'rendered-ui-diagnose.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/diagnose-breakpoints`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoints: ['mobile', 'desktop'] })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.activeBreakpoint, 'mobile');
      assert.equal(json.data.summaryByBreakpoint.mobile.rootTag !== undefined, true);
      assert.equal(typeof json.data.summaryByBreakpoint.desktop.childCandidateCount, 'number');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
