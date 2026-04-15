import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { FigmaUiExtractorService } from '../../src/core/figma-ui-extractor';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    name: 'Landing file',
    document: {
      id: '0:1',
      name: 'Page 1',
      type: 'CANVAS',
      visible: true,
      children: [
        {
          id: '1:1',
          name: 'Hero',
          type: 'SECTION',
          visible: true,
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
          layoutMode: 'VERTICAL',
          itemSpacing: 24,
          paddingTop: 64,
          paddingRight: 64,
          paddingBottom: 64,
          paddingLeft: 64,
          fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 }, opacity: 1 }],
          cornerRadius: 24,
          children: [
            {
              id: '1:2',
              name: 'Hero Title',
              type: 'TEXT',
              visible: true,
              characters: 'Build faster',
              absoluteBoundingBox: { x: 64, y: 64, width: 500, height: 60 },
              fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
              fontName: { family: 'Inter', style: 'Bold' },
              fontSize: 56,
              lineHeight: { value: 64 },
              letterSpacing: { value: 0 },
              textAlignHorizontal: 'CENTER'
            }
          ]
        }
      ]
    }
  }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({ nodes: {} }),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

test('figma ui extractor converts Figma file tree into Unified UI Model', async () => {
  const service = new FigmaUiExtractorService(createMockClient());
  const document = await service.extract({ fileKey: 'file-123' });

  assert.equal(document.root.kind, 'page');
  assert.equal(document.root.children[0].kind, 'section');
  assert.equal(document.root.children[0].layout?.type, 'vertical');
  assert.equal(document.root.children[0].padding?.top, 64);
  assert.equal(document.root.children[0].spacing, 24);
  assert.equal(document.root.children[0].style?.radius, 24);
  assert.equal(document.root.children[0].children[0].kind, 'text');
  assert.equal(document.root.children[0].children[0].text, 'Build faster');
  assert.equal(document.root.children[0].children[0].style?.text?.fontFamily, 'Inter');
  assert.equal(document.root.children[0].children[0].source?.nodeId, '1:2');
});

test('figma ui routes expose backend extract and plugin-enriched export queue', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-ui-api-'));
  const dbPath = join(dir, 'figma-ui.sqlite');

  try {
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
      writeAllowedOperations: ['execute-plugin-command', 'execute-plugin-batch']
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to get server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const extractResponse = await fetch(`${baseUrl}/api/figma-ui/extract`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ fileKey: 'file-123' })
      });
      const extractJson = (await extractResponse.json()) as { data: { root: { kind: string } } };
      assert.equal(extractResponse.status, 200);
      assert.equal(extractJson.data.root.kind, 'page');

      const registration = await fetch(`${baseUrl}/api/plugin-bridge/sessions/register`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ fileKey: 'file-123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'test-plugin' })
      });
      const registrationJson = (await registration.json()) as { data: { sessionId: string; sessionToken: string } };
      const sessionId = registrationJson.data.sessionId;
      const sessionToken = registrationJson.data.sessionToken;

      const exportResponse = await fetch(`${baseUrl}/api/figma-ui/export-snapshot`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-api-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          fileKey: 'file-123',
          sessionId,
          command: {
            type: 'export_ui_snapshot',
            payload: {
              includePages: true
            }
          }
        })
      });
      const exportJson = (await exportResponse.json()) as { data: { result: { commandId: string; status: string } } };
      assert.equal(exportResponse.status, 202);
      assert.equal(exportJson.data.result.status, 'queued');

      const pendingResponse = await fetch(`${baseUrl}/api/plugin-bridge/sessions/${sessionId}/commands/pending`, {
        headers: {
          authorization: 'Bearer test-api-token',
          'x-plugin-session-token': sessionToken
        }
      });
      const pendingJson = (await pendingResponse.json()) as { data: Array<{ type: string; payload: { command?: { type?: string } } }> };
      assert.equal(pendingResponse.status, 200);
      assert.equal(pendingJson.data[0].type, 'execute-plugin-command');
      assert.equal(pendingJson.data[0].payload.command?.type, 'export_ui_snapshot');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
