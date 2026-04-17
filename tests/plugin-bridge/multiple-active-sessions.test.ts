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

const mockRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero',
    tag: 'section',
    text: 'Build faster Start',
    treePath: 'landing.hero',
    clientRect: { x: 0, y: 0, width: 1440, height: 720 },
    computedStyle: {
      backgroundColor: 'rgb(15, 23, 42)',
      borderRadius: 24,
      boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      paddingTop: 64,
      paddingRight: 64,
      paddingBottom: 64,
      paddingLeft: 64,
      width: 1440,
      height: 720,
      alignItems: 'center',
      justifyContent: 'center'
    },
    visibility: { visible: true, display: 'flex', visibility: 'visible', opacity: 1 },
    media: {},
    asset: {},
    icon: {},
    semantics: {},
    breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
    syncRelevantFields: [],
    children: [
      {
        uiId: 'landing.hero.title',
        tag: 'h1',
        text: 'Build faster',
        treePath: 'landing.hero > landing.hero.title',
        clientRect: { x: 64, y: 80, width: 640, height: 72 },
        computedStyle: {
          color: 'rgb(255, 255, 255)',
          fontFamily: 'Inter',
          fontSize: 56,
          fontWeight: '700',
          lineHeight: 64,
          textAlign: 'center',
          display: 'block',
          width: 640,
          height: 72
        },
        visibility: { visible: true, display: 'block', visibility: 'visible', opacity: 1 },
        media: {},
        asset: {},
        icon: {},
        semantics: {},
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: [],
        children: []
      },
      {
        uiId: 'landing.hero.cta',
        tag: 'button',
        text: 'Start',
        treePath: 'landing.hero > landing.hero.cta',
        clientRect: { x: 64, y: 184, width: 180, height: 48 },
        computedStyle: {
          color: 'rgb(255, 255, 255)',
          backgroundColor: 'rgb(37, 99, 235)',
          borderRadius: 12,
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: '600',
          lineHeight: 24,
          textAlign: 'center',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 180,
          height: 48
        },
        visibility: { visible: true, display: 'inline-flex', visibility: 'visible', opacity: 1 },
        media: {},
        asset: {},
        icon: {},
        semantics: { role: 'button', clickTarget: true },
        breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' },
        syncRelevantFields: [],
        children: []
      }
    ]
  })
};

test('code-to-figma live route rejects multiple active sessions for the same file before queueing', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-to-figma-multi-session-'));
  const dbPath = join(rootDir, 'pipeline.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(rootDir, 'src', 'components', 'Hero.tsx'),
      `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero" className="flex flex-col gap-6 p-16 rounded-2xl">
            <h1 data-ui-id="landing.hero.title">Build faster</h1>
            <button data-ui-id="landing.hero.cta">Start</button>
          </section>
        );
      }
    `,
      'utf8'
    );
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
      renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const registrationA = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin-a' })
      });
      const registrationJsonA = await registrationA.json() as any;
      const sessionId = registrationJsonA.data.sessionId;

      const registrationB = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin-b' })
      });
      assert.equal(registrationB.status, 200);

      const response = await fetch(`${baseUrl}/api/code-to-figma/build`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          project: 'marketing-site',
          componentName: 'Hero',
          rootDir,
          fileKey: 'abc123',
          sessionId,
          dryRun: false,
          render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpointName: 'desktop' }
        })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 409);
      assert.equal(json.error.code, 'MULTIPLE_ACTIVE_SESSIONS');
      assert.match(String(json.error.message), /same Figma file/i);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('rendered-ui live import rejects multiple active sessions for the same file before queueing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rendered-ui-import-multi-session-'));
  const dbPath = join(dir, 'rendered-ui.sqlite');
  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const auditService = new AuditService(db);
    const app = createApp({
      apiBearerToken: 'test-api-token',
      corsAllowedOrigins: ['https://chat.openai.com'],
      db,
      auditService,
      enableWriteActions: true,
      writeAllowedOperations: ['execute-plugin-batch'],
      renderedUiExtractorService: new RenderedUiExtractorService(mockRuntime)
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const registrationA = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin-a' })
      });
      const registrationJsonA = await registrationA.json() as any;
      const sessionId = registrationJsonA.data.sessionId;

      const registrationB = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin-b' })
      });
      assert.equal(registrationB.status, 200);

      const response = await fetch(`${baseUrl}/api/rendered-ui/import-to-figma`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' },
          rootUiId: 'landing.hero',
          breakpointName: 'desktop',
          componentName: 'rendered-ui-import',
          filePath: '[rendered-ui]',
          fileKey: 'abc123',
          sessionId,
          dryRun: false
        })
      });
      const json = await response.json() as any;
      assert.equal(response.status, 409);
      assert.equal(json.error.code, 'MULTIPLE_ACTIVE_SESSIONS');
      assert.match(String(json.error.message), /same Figma file/i);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
