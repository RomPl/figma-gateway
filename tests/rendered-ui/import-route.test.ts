import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { CodeUiParserService } from '../../src/core/code-ui-parser';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({ document: { id: '0:1', name: 'Document', type: 'DOCUMENT' } }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

const runtime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster Start',
    treePath: 'landing.hero',
    clientRect: { x: 20, y: 40, width: 1280, height: 680 },
    computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 64, paddingRight: 64, paddingBottom: 64, paddingLeft: 64, width: 1280, height: 680, alignItems: 'center', justifyContent: 'center' },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 120, y: 120, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 56, fontWeight: '700', lineHeight: 64, textAlign: 'center', width: 640, height: 72, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
      { uiId: 'landing.hero.cta', tag: 'button', text: 'Start', treePath: 'landing.hero > landing.hero.cta', clientRect: { x: 120, y: 220, width: 180, height: 48 }, computedStyle: { color: 'rgb(255,255,255)', backgroundColor: 'rgb(37,99,235)', borderRadius: 12, fontFamily: 'Inter', fontSize: 16, fontWeight: '600', lineHeight: 24, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 48 }, visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: { role: 'button', clickTarget: true }, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

test('rendered-ui import route prepends deep-first exact uiId cleanup commands before live queueing', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-import-cleanup-'));
  const dbPath = join(rootDir, 'rendered-import.sqlite');
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
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['execute-plugin-batch'],
      codeUiParserService: new CodeUiParserService({ rootDir }),
      renderedUiExtractorService: new RenderedUiExtractorService(runtime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = await registration.json() as any;
      const sessionId = registrationJson.data.sessionId;
      const sessionToken = registrationJson.data.sessionToken;

      const response = await fetch(`${baseUrl}/api/rendered-ui/import-to-figma`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          project: 'marketing-site',
          target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' },
          rootDir,
          componentName: 'Hero',
          filePath: 'src/components/Hero.tsx',
          fileKey: 'abc123',
          sessionId,
          dryRun: false
        })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.breakpointVariantSet.active, 'desktop');
      const cleanup = json.data.plan.commands.slice(0, 3);
      assert.equal(cleanup.every((command: any) => command.type === 'delete_matching_nodes'), true);
      const cleanupUiIds = cleanup.map((command: any) => command.payload.query.uiId);
      assert.deepEqual(new Set(cleanupUiIds.slice(0, 2)), new Set(['landing.hero.title', 'landing.hero.cta']));
      assert.equal(cleanupUiIds[2], 'landing.hero');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('rendered-ui import-breakpoints-to-figma builds separate variant node refs per breakpoint', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-import-breakpoints-'));
  const dbPath = join(rootDir, 'rendered-import-breakpoints.sqlite');
  const breakpointRuntime: RenderedUiRuntime = {
    capture: async (input) => ({
      uiId: 'landing.hero',
      tag: 'section',
      text: `Hero ${String(input.breakpointName || input.breakpoint || 'desktop')}`,
      treePath: 'landing.hero',
      clientRect: { x: 20, y: 40, width: input.viewport?.width ?? 1280, height: 680 },
      computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, width: input.viewport?.width ?? 1280, height: 680 },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1280, viewportHeight: input.viewport?.height ?? 680, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [],
      children: [
        { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title', clientRect: { x: 120, y: 120, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 56, fontWeight: '700', lineHeight: 64, width: 640, height: 72, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1280, viewportHeight: input.viewport?.height ?? 680, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [], children: [] }
      ]
    })
  };
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `export function Hero(){return null;}`, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService,
      enableWriteActions: true, writeAllowedOperations: ['execute-plugin-batch'],
      codeUiParserService: new CodeUiParserService({ rootDir }), renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/import-breakpoints-to-figma`, {
        method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootDir, componentName: 'Hero', filePath: 'src/components/Hero.tsx', breakpoints: ['mobile', 'desktop'], dryRun: true })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.activeBreakpoint, 'mobile');
      assert.equal(json.data.plansByBreakpoint.mobile.model.root.uiId.endsWith('--mobile'), true);
      assert.equal(json.data.plansByBreakpoint.desktop.model.root.uiId.endsWith('--desktop'), true);
      assert.equal(json.data.variantGroup.variantGroupId, 'landing.hero');
      assert.equal(json.data.notes.some((note: string) => note.includes('variant node refs')), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('diagnose-breakpoints returns diagnostics by breakpoint', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-diagnose-breakpoints-'));
  const dbPath = join(rootDir, 'rendered-diagnose-breakpoints.sqlite');
  const breakpointRuntime: RenderedUiRuntime = {
    capture: async (input) => ({
      uiId: 'landing.hero', tag: 'section', text: `Hero ${String(input.breakpointName || input.breakpoint || 'desktop')}`, treePath: 'landing.hero',
      clientRect: { x: 20, y: 40, width: input.viewport?.width ?? 1280, height: 680 },
      computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, width: input.viewport?.width ?? 1280, height: 680 },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: input.viewport?.width ?? 1280, viewportHeight: input.viewport?.height ?? 680, name: String(input.breakpointName || input.breakpoint || 'desktop') }, syncRelevantFields: [], children: []
    })
  };
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({ figmaClient: createMockClient(), apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'], db, auditService, renderedUiExtractorService: new RenderedUiExtractorService(breakpointRuntime) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const response = await fetch(`${baseUrl}/api/rendered-ui/diagnose-breakpoints`, { method: 'POST', headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' }, body: JSON.stringify({ target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoints: ['mobile', 'desktop'] }) });
      const json = await response.json() as any;
      assert.equal(response.status, 200);
      assert.equal(json.data.diagnosticsByBreakpoint.mobile.rootRequestedUiId, 'landing.hero');
      assert.equal(json.data.diagnosticsByBreakpoint.desktop.rootRequestedUiId, 'landing.hero');
      assert.equal(json.data.notes.some((note: string) => note.includes('desktop/tablet/mobile')), true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('rendered-ui live import blocks queued batch when planned model contains duplicate uiIds', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-import-duplicate-uiids-'));
  const dbPath = join(rootDir, 'rendered-import-duplicate-uiids.sqlite');
  const duplicateRuntime: RenderedUiRuntime = {
    capture: async () => ({
      uiId: 'landing.hero',
      tag: 'section',
      text: 'Build faster Start',
      treePath: 'landing.hero',
      clientRect: { x: 20, y: 40, width: 1280, height: 680 },
      computedStyle: { backgroundColor: 'rgb(17, 34, 51)', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 24, width: 1280, height: 680 },
      visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
      children: [
        { uiId: 'landing.hero.title', tag: 'h1', text: 'Build faster', treePath: 'landing.hero > landing.hero.title[1]', clientRect: { x: 120, y: 120, width: 640, height: 72 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 56, fontWeight: '700', lineHeight: 64, width: 640, height: 72, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] },
        { uiId: 'landing.hero.title', tag: 'p', text: 'Duplicate', treePath: 'landing.hero > landing.hero.title[2]', clientRect: { x: 120, y: 220, width: 320, height: 40 }, computedStyle: { color: 'rgb(255,255,255)', fontFamily: 'Inter', fontSize: 18, fontWeight: '400', lineHeight: 24, width: 320, height: 40, display: 'block' }, visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
      ]
    })
  };
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['execute-plugin-batch'],
      codeUiParserService: new CodeUiParserService({ rootDir }),
      renderedUiExtractorService: new RenderedUiExtractorService(duplicateRuntime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = await registration.json() as any;
      const sessionId = registrationJson.data.sessionId;

      const response = await fetch(`${baseUrl}/api/rendered-ui/import-to-figma`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          project: 'marketing-site',
          target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' },
          rootDir,
          componentName: 'Hero',
          filePath: 'src/components/Hero.tsx',
          fileKey: 'abc123',
          sessionId,
          dryRun: false
        })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 409);
      assert.equal(json.error.code, 'DUPLICATE_UI_IDS_IN_PLAN');
      assert.equal(Array.isArray(json.error.details.duplicateUiIds), true);
      assert.equal(json.error.details.duplicateUiIds[0].uiId, 'landing.hero.title');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});


test('rendered-ui repeated live imports stay stable across consecutive runs', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'rendered-import-repeat-stable-'));
  const dbPath = join(rootDir, 'rendered-import-repeat-stable.sqlite');
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
      figmaClient: createMockClient(),
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['execute-plugin-batch'],
      codeUiParserService: new CodeUiParserService({ rootDir }),
      renderedUiExtractorService: new RenderedUiExtractorService(runtime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = await registration.json() as any;
      const sessionId = registrationJson.data.sessionId;

      const runImport = async () => {
        const response = await fetch(`${baseUrl}/api/rendered-ui/import-to-figma`, {
          method: 'POST',
          headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
          body: JSON.stringify({
            project: 'marketing-site',
            target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' },
            rootDir,
            componentName: 'Hero',
            filePath: 'src/components/Hero.tsx',
            fileKey: 'abc123',
            sessionId,
            dryRun: false
          })
        });
        return { status: response.status, json: await response.json() as any };
      };

      const first = await runImport();
      const second = await runImport();
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(first.json.data.queued ?? null, second.json.data.queued ?? null);
      assert.deepEqual(first.json.data.uiIdStats, second.json.data.uiIdStats);
      assert.deepEqual(first.json.data.plan.commands.slice(0, 3), second.json.data.plan.commands.slice(0, 3));
      assert.deepEqual(first.json.data.plan.model.root.uiId, second.json.data.plan.model.root.uiId);
      assert.equal(first.json.data.uiIdStats.duplicates.length, 0);
      assert.equal(second.json.data.uiIdStats.duplicates.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
