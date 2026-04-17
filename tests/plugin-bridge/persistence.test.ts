import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApp } from '../../src/api/app';
import { AuditService } from '../../src/core/audit';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('plugin bridge dispatch lease prevents repeated delivery of the same queued batch across polls', () => {
  let nowMs = Date.parse('2026-04-17T10:00:00.000Z');
  const service = new PluginBridgeService({
    now: () => new Date(nowMs).toISOString(),
    dispatchLeaseMs: 5_000
  });
  const session = service.registerSession({ fileKey: 'abc123', localFileKey: 'local:figma', clientName: 'figma-plugin-bridge' });
  const queued = service.queueExecutePluginBatch({
    sessionId: session.sessionId,
    fileKey: 'abc123',
    actorId: 'test',
    commands: [{ type: 'set_fill', payload: { nodeRef: 'hero', fills: [] } } as any]
  });

  const firstPoll = service.getPendingCommands(session.sessionId, session.sessionToken);
  assert.equal(firstPoll.length, 1);
  assert.equal(firstPoll[0].commandId, queued.commandId);
  assert.equal(firstPoll[0].status, 'dispatched');

  const secondPoll = service.getPendingCommands(session.sessionId, session.sessionToken);
  assert.equal(secondPoll.length, 0);

  nowMs += 6_000;
  const reclaimedPoll = service.getPendingCommands(session.sessionId, session.sessionToken);
  assert.equal(reclaimedPoll.length, 1);
  assert.equal(reclaimedPoll[0].commandId, queued.commandId);
  assert.equal(reclaimedPoll[0].status, 'dispatched');
});

test('plugin bridge persists sessions and queued commands across service restart using sqlite state', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'plugin-bridge-persist-'));
  const db = createSqliteDatabase(join(rootDir, 'plugin-bridge.sqlite'));
  migrateDatabase(db);
  try {
    let nowMs = Date.parse('2026-04-17T10:00:00.000Z');
    const serviceA = new PluginBridgeService({ db, now: () => new Date(nowMs).toISOString(), dispatchLeaseMs: 5_000 });
    const session = serviceA.registerSession({ fileKey: 'abc123', localFileKey: 'local:figma', clientName: 'figma-plugin-bridge', fileName: 'Landing' });
    const command = serviceA.queueExecutePluginBatch({
      sessionId: session.sessionId,
      fileKey: 'abc123',
      actorId: 'test',
      commands: [{ type: 'set_fill', payload: { nodeRef: 'hero', fills: [] } } as any]
    });
    serviceA.getPendingCommands(session.sessionId, session.sessionToken);

    const serviceB = new PluginBridgeService({ db, now: () => new Date(nowMs).toISOString(), dispatchLeaseMs: 5_000 });
    assert.equal(serviceB.resolveSession({ sessionId: session.sessionId }).sessionId, session.sessionId);
    assert.equal(serviceB.getCommand(session.sessionId, command.commandId, session.sessionToken).status, 'dispatched');

    nowMs += 6_000;
    const reclaimed = serviceB.getPendingCommands(session.sessionId, session.sessionToken);
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0].commandId, command.commandId);

    serviceB.completeCommand({ sessionId: session.sessionId, commandId: command.commandId, result: { ok: true } }, session.sessionToken);
    const serviceC = new PluginBridgeService({ db });
    assert.equal(serviceC.getCommand(session.sessionId, command.commandId, session.sessionToken).status, 'completed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('plugin bridge route preserves registered session across app recreation with same sqlite database', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'plugin-bridge-route-persist-'));
  const db = createSqliteDatabase(join(rootDir, 'plugin-bridge.sqlite'));
  migrateDatabase(db);
  try {
    const auditService = new AuditService(db);
    const appA = createApp({ db, auditService, apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'] });
    const serverA = createServer(appA);
    await new Promise<void>((resolve) => serverA.listen(0, '127.0.0.1', () => resolve()));
    const addressA = serverA.address();
    if (!addressA || typeof addressA === 'string') throw new Error('Failed to get server address');
    const baseUrlA = `http://127.0.0.1:${addressA.port}`;
    const registration = await fetch(`${baseUrlA}/api/plugin-bridge/sessions/register`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-api-token', 'content-type': 'application/json' },
      body: JSON.stringify({ fileKey: 'abc123', localFileKey: 'local:figma', fileName: 'Landing', clientName: 'figma-plugin-bridge' })
    });
    const registrationJson = await registration.json() as any;
    const sessionId = registrationJson.data.sessionId;
    await new Promise<void>((resolve, reject) => serverA.close((error) => (error ? reject(error) : resolve())));

    const appB = createApp({ db, auditService, apiBearerToken: 'test-api-token', corsAllowedOrigins: ['https://chat.openai.com'] });
    const serverB = createServer(appB);
    await new Promise<void>((resolve) => serverB.listen(0, '127.0.0.1', () => resolve()));
    const addressB = serverB.address();
    if (!addressB || typeof addressB === 'string') throw new Error('Failed to get server address');
    const baseUrlB = `http://127.0.0.1:${addressB.port}`;
    try {
      const sessions = await fetch(`${baseUrlB}/api/plugin-bridge/sessions`, { headers: { authorization: 'Bearer test-api-token' } });
      const sessionsJson = await sessions.json() as any;
      assert.equal(sessions.status, 200);
      assert.equal(sessionsJson.data.some((item: any) => item.sessionId === sessionId), true);
    } finally {
      await new Promise<void>((resolve, reject) => serverB.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
