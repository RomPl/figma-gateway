import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../../src/core/errors';
import { PluginBridgeService, normalizePluginCommandResult } from '../../src/core/plugin-bridge';

test('plugin bridge resolves active session by file and client filters', () => {
  const service = new PluginBridgeService();
  const sessionA = service.registerSession({ fileKey: 'file-1', localFileKey: 'local-a', clientName: 'client-a', fileName: 'A' });
  const sessionB = service.registerSession({ fileKey: 'file-2', localFileKey: 'local-b', clientName: 'client-b', fileName: 'B' });

  assert.equal(service.resolveSession({ sessionId: sessionA.sessionId }).sessionId, sessionA.sessionId);
  assert.equal(service.resolveSession({ fileKey: 'file-2' }).sessionId, sessionB.sessionId);
  assert.equal(service.resolveSession({ localFileKey: 'local-a' }).sessionId, sessionA.sessionId);
  assert.equal(service.resolveSession({ clientName: 'client-b' }).sessionId, sessionB.sessionId);
});

test('plugin bridge execute-plugin-batch normalizes shorthand command steps into payload form', () => {
  const service = new PluginBridgeService();
  const session = service.registerSession({ fileKey: 'file-1', clientName: 'client-a' });

  const command = service.queueExecutePluginBatch({
    sessionId: session.sessionId,
    fileKey: 'file-1',
    actorId: 'test',
    commands: [
      { type: 'set_fill', nodeRef: 'node-1', fills: [] } as any,
      { type: 'set_position', payload: { nodeRef: 'node-2', x: 10, y: 20 } } as any
    ]
  });

  const steps = command.payload.commands as Array<any>;
  assert.equal(steps[0].type, 'set_fill');
  assert.deepEqual(steps[0].payload, { nodeRef: 'node-1', fills: [] });
  assert.equal(steps[1].type, 'set_position');
  assert.deepEqual(steps[1].payload, { nodeRef: 'node-2', x: 10, y: 20 });
});

test('plugin bridge authenticates pending command access and marks completion states', () => {
  const service = new PluginBridgeService();
  const session = service.registerSession({ fileKey: 'file-1', clientName: 'client-a' });
  const queued = service.queueCreateFrame({ sessionId: session.sessionId, fileKey: 'file-1', actorId: 'test', name: 'Card', width: 320, height: 200 });

  assert.throws(() => service.getPendingCommands(session.sessionId, 'wrong-token'), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'PLUGIN_SESSION_FORBIDDEN');
    return true;
  });

  const pending = service.getPendingCommands(session.sessionId, session.sessionToken);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].commandId, queued.commandId);
  assert.equal(pending[0].status, 'dispatched');

  const completed = service.completeCommand({ sessionId: session.sessionId, commandId: queued.commandId, result: { nodeId: '10:1' } }, session.sessionToken);
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.result, { nodeId: '10:1' });
  assert.equal(service.getPendingCommands(session.sessionId, session.sessionToken).length, 0);

  const failedQueued = service.queueUpdateText({ sessionId: session.sessionId, fileKey: 'file-1', actorId: 'test', nodeId: '10:1', text: 'Hello' });
  const failed = service.completeCommand({ sessionId: session.sessionId, commandId: failedQueued.commandId, error: { code: 'NODE_NOT_FOUND', message: 'missing node' } }, session.sessionToken);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error?.code, 'NODE_NOT_FOUND');
});

test('normalizePluginCommandResult preserves ok/error contract and default nodeId null', () => {
  assert.deepEqual(normalizePluginCommandResult('set_fill', { status: 'ok', data: { fills: [] } }), {
    commandType: 'set_fill',
    status: 'ok',
    nodeId: null,
    data: { fills: [] },
    error: undefined
  });

  assert.deepEqual(normalizePluginCommandResult('set_text_style', { status: 'error', nodeId: '12:1', error: { code: 'MISSING_FONT', message: 'font not loaded' } }), {
    commandType: 'set_text_style',
    status: 'error',
    nodeId: '12:1',
    data: undefined,
    error: { code: 'MISSING_FONT', message: 'font not loaded' }
  });
});

test('plugin bridge font selection prefers fontWeight over generic Regular style hint', async () => {
  const source = require('node:fs').readFileSync('plugin-bridge/code.js', 'utf8');
  assert.match(source, /normalizedStyle === 'regular'[\s\S]*numericWeight >= 500/);
  assert.match(source, /styleAttempts = Array\.from\(new Set\(\[styleGuess,[\s\S]*'Black',[\s\S]*'Extra Bold',[\s\S]*'Bold',[\s\S]*'Semibold',[\s\S]*'Medium',[\s\S]*'Regular'/);
});

test('plugin bridge create_text applies requested font before characters assignment', async () => {
  const source = require('node:fs').readFileSync('plugin-bridge/code.js', 'utf8');
  assert.match(source, /const effectiveFont = requestedFont \|\| textNode\.fontName;/);
  assert.match(source, /await figma\.loadFontAsync\(effectiveFont\);[\s\S]*if \(requestedFont\) textNode\.fontName = requestedFont;[\s\S]*textNode\.characters =/);
  assert.match(source, /fontName: textNode\.fontName/);
});

test('plugin runtime source exposes debug_runtime_info command for font diagnostics', async () => {
  const source = require('node:fs').readFileSync('plugin-bridge/code.js', 'utf8');
  assert.match(source, /RUNTIME_BUILD = '2026-04-17-font-debug-1'/);
  assert.match(source, /'debug_runtime_info'/);
  assert.match(source, /listAvailableFontsAsync\(\)/);
});

test('server allows debug_runtime_info as low-level diagnostic command', async () => {
  const writeTypes = require('node:fs').readFileSync('src/core/figma-write-types.ts', 'utf8');
  const guardrails = require('node:fs').readFileSync('src/core/mvp-guardrails.ts', 'utf8');
  assert.match(writeTypes, /'debug_runtime_info'/);
  assert.match(guardrails, /'debug_runtime_info'/);
});
