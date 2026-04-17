import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { RenderedToCodeMapperService } from '../../src/core/rendered-to-code-mapper';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const mockRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster Start',
    treePath: 'landing.hero',
    clientRect: { x: 0, y: 0, width: 1440, height: 720 },
    computedStyle: { display: 'flex', flexDirection: 'column', gap: 24, width: 1440, height: 720 },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 },
    media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      {
        uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title',
        clientRect: { x: 0, y: 0, width: 500, height: 60 }, computedStyle: { fontSize: 56, width: 500, height: 60, display: 'block' },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: []
      },
      {
        uiId: 'landing.hero.cta', tag: 'button', text: 'Start', treePath: 'landing.hero > landing.hero.cta',
        clientRect: { x: 0, y: 0, width: 160, height: 44 }, computedStyle: { width: 160, height: 44, display: 'inline-flex' },
        visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button' }, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: []
      }
    ]
  })
};

test('rendered to code mapper links rendered nodes to exact JSX source mapping', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-map-code-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero" className="flex flex-col gap-6">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
      }
    `, 'utf8');
    const renderedService = new RenderedUiExtractorService(mockRuntime);
    const codeService = new CodeUiParserService({ rootDir });
    const mapper = new RenderedToCodeMapperService(renderedService, codeService);
    const result = await mapper.map({ rootDir, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } });

    assert.equal(result.componentCount, 1);
    assert.equal(result.unmatchedNodeCount, 0);
    const root = result.rendered.root;
    assert.equal(root.source?.codePath, 'src/components/Hero.tsx');
    assert.equal(root.source?.codeExportName, 'Hero');
    assert.match(String(root.source?.jsxPath), /Hero/);
    assert.equal((root.meta as any)?.codeMapping?.matchType, 'exact_ui_id');
    assert.equal((root.meta as any)?.codeMapping?.confidence, 1);
    assert.equal((root.meta as any)?.codeMapping?.stable, true);
    assert.equal((root.children[0].meta as any)?.codeMapping?.componentName, 'Hero');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('rendered to code route returns rendered tree with code mapping confidence', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-map-api-'));
  const dbPath = join(rootDir, 'map.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      codeUiParserService: new CodeUiParserService({ rootDir }),
      renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/map-to-code`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ rootDir, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.rendered.root.source.codePath, 'src/components/Hero.tsx');
      assert.equal(json.data.rendered.root.meta.codeMapping.matchType, 'exact_ui_id');
      assert.equal(json.data.rendered.root.children[1].meta.codeMapping.componentName, 'Hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('rendered to code mapper keeps segmentation and identity metadata after code enrichment', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-map-segmentation-'));
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <div data-ui-id="landing.hero.shell"><h1 data-ui-id="landing.hero.title">Build faster</h1></div>
          </section>
        );
      }
    `, 'utf8');
    const renderedService = new RenderedUiExtractorService({
      capture: async () => ({
        uiId: 'landing.hero', tag: 'section', text: 'Build faster', treePath: 'landing.hero',
        clientRect: { x: 0, y: 0, width: 1440, height: 720 },
        computedStyle: { display: 'block', width: 1440, height: 720 },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
          { uiId: 'landing.hero.shell', tag: 'div', text: 'Build faster', treePath: 'landing.hero > landing.hero.shell', clientRect: { x: 120, y: 80, width: 1200, height: 240 }, computedStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: 1200, height: 240 }, visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [
            { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.shell > landing.hero.title', clientRect: { x: 300, y: 140, width: 420, height: 56 }, computedStyle: { color: 'rgb(255,255,255)', fontSize: 48, width: 420, height: 56, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
          ] }
        ]
      })
    });
    const codeService = new CodeUiParserService({ rootDir });
    const mapper = new RenderedToCodeMapperService(renderedService, codeService);
    const result = await mapper.map({ rootDir, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero' } });
    const shell = result.rendered.root.children[0];
    assert.equal(shell.meta?.identity?.sourceUiId, 'landing.hero.shell');
    assert.equal(shell.meta?.identity?.visualUiId, 'landing.hero.shell');
    assert.equal(shell.meta?.segmentation?.boundaryKind, 'layout-wrapper');
    assert.equal(shell.meta?.segmentation?.blockBoundary, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
