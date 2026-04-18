import crypto from 'node:crypto';

import { AppError } from './errors';
import type { FigmaCommandResult, FigmaCommandStep, FigmaLowLevelCommandType } from './figma-write-types';
import type { SqliteDatabase } from '../db/sqlite';

export type PluginBridgeCommandType =
  | 'create-page'
  | 'create-frame'
  | 'update-text'
  | 'create-section'
  | 'duplicate-block'
  | 'apply-style-from-alias'
  | 'execute-plugin-command'
  | 'execute-plugin-batch';
export type PluginBridgeCommandStatus = 'queued' | 'dispatched' | 'completed' | 'failed';

export type PluginBridgeSession = {
  sessionId: string;
  sessionToken: string;
  fileKey?: string;
  localFileKey?: string;
  fileName?: string;
  clientName?: string;
  createdAt: string;
  lastSeenAt: string;
  connected: boolean;
};

export type PluginBridgeCommand = {
  commandId: string;
  type: PluginBridgeCommandType;
  payload: Record<string, unknown>;
  status: PluginBridgeCommandStatus;
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

type RegisterSessionInput = {
  fileKey?: string;
  localFileKey?: string;
  fileName?: string;
  clientName?: string;
};

type QueueCommandBaseInput = {
  sessionId: string;
  fileKey?: string;
  actorId: string;
};

type QueueCreatePageInput = QueueCommandBaseInput & { name: string };
type QueueCreateFrameInput = QueueCommandBaseInput & {
  parentNodeId?: string;
  uiId?: string;
  name: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
};
type QueueUpdateTextInput = QueueCommandBaseInput & { nodeId: string; text: string };
type QueueCreateSectionInput = QueueCommandBaseInput & {
  parentNodeId?: string;
  uiId?: string;
  name: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};
type QueueDuplicateBlockInput = QueueCommandBaseInput & {
  nodeId: string;
  targetParentNodeId?: string;
  name?: string;
  x?: number;
  y?: number;
};
type QueueApplyStyleFromAliasInput = QueueCommandBaseInput & { alias: string; nodeId: string };
type QueueExecutePluginCommandInput = QueueCommandBaseInput & { command: FigmaCommandStep };
type QueueExecutePluginBatchInput = QueueCommandBaseInput & { commands: FigmaCommandStep[] };

type CompleteCommandInput = {
  sessionId: string;
  commandId: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

type PluginSessionScopeSummary = {
  sessionId: string;
  fileKey?: string;
  localFileKey?: string;
  fileName?: string;
  activeSessionCount: number;
  activeSessionIds: string[];
};

type ResolveSessionInput = {
  sessionId?: string;
  fileKey?: string;
  localFileKey?: string;
  clientName?: string;
};

type PluginBridgeServiceOptions = {
  db?: SqliteDatabase;
  now?: () => string;
  activeSessionMaxAgeMs?: number;
  dispatchLeaseMs?: number;
};

const DEFAULT_ACTIVE_SESSION_MAX_AGE_MS = 60_000;
const DEFAULT_DISPATCH_LEASE_MS = 30_000;

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const normalizePluginCommandStep = (step: FigmaCommandStep | Record<string, unknown>): Record<string, unknown> => {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return step as Record<string, unknown>;
  }
  const value = step as Record<string, unknown>;
  if (value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)) {
    return value;
  }
  const { type, ...rest } = value;
  return {
    type,
    ...(Object.keys(rest).length ? { payload: rest } : {})
  };
};

const createQueuedCommand = (
  type: PluginBridgeCommandType,
  payload: Record<string, unknown>,
  now: () => string
): PluginBridgeCommand => ({
  commandId: makeId('pbc'),
  type,
  payload,
  status: 'queued',
  createdAt: now()
});

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export class PluginBridgeService {
  private readonly sessions = new Map<string, PluginBridgeSession>();
  private readonly commandsBySession = new Map<string, PluginBridgeCommand[]>();
  private readonly db?: SqliteDatabase;
  private readonly now: () => string;
  private readonly activeSessionMaxAgeMs: number;
  private readonly dispatchLeaseMs: number;

  constructor(options: PluginBridgeServiceOptions = {}) {
    this.db = options.db;
    this.now = options.now ?? (() => new Date().toISOString());
    this.activeSessionMaxAgeMs = options.activeSessionMaxAgeMs ?? DEFAULT_ACTIVE_SESSION_MAX_AGE_MS;
    this.dispatchLeaseMs = options.dispatchLeaseMs ?? DEFAULT_DISPATCH_LEASE_MS;
    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    if (!this.db) return;
    const sessionRows = this.db
      .prepare(`SELECT session_id, session_token, file_key, local_file_key, file_name, client_name, created_at, last_seen_at, connected FROM plugin_bridge_sessions ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    for (const row of sessionRows) {
      const session: PluginBridgeSession = {
        sessionId: String(row.session_id),
        sessionToken: String(row.session_token),
        fileKey: row.file_key ? String(row.file_key) : undefined,
        localFileKey: row.local_file_key ? String(row.local_file_key) : undefined,
        fileName: row.file_name ? String(row.file_name) : undefined,
        clientName: row.client_name ? String(row.client_name) : undefined,
        createdAt: String(row.created_at),
        lastSeenAt: String(row.last_seen_at),
        connected: Boolean(row.connected)
      };
      this.sessions.set(session.sessionId, session);
      this.commandsBySession.set(session.sessionId, []);
    }
    const commandRows = this.db
      .prepare(`SELECT command_id, session_id, type, payload_json, status, created_at, dispatched_at, completed_at, result_json, error_json FROM plugin_bridge_commands ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    for (const row of commandRows) {
      const command: PluginBridgeCommand = {
        commandId: String(row.command_id),
        type: String(row.type) as PluginBridgeCommandType,
        payload: parseJson<Record<string, unknown>>(row.payload_json ? String(row.payload_json) : null, {}),
        status: String(row.status) as PluginBridgeCommandStatus,
        createdAt: String(row.created_at),
        dispatchedAt: row.dispatched_at ? String(row.dispatched_at) : undefined,
        completedAt: row.completed_at ? String(row.completed_at) : undefined,
        result: parseJson(row.result_json ? String(row.result_json) : null, undefined),
        error: parseJson(row.error_json ? String(row.error_json) : null, undefined)
      };
      const sessionId = String(row.session_id);
      const queue = this.commandsBySession.get(sessionId) ?? [];
      queue.push(command);
      this.commandsBySession.set(sessionId, queue);
    }
  }

  private persistSession(session: PluginBridgeSession): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO plugin_bridge_sessions (session_id, session_token, file_key, local_file_key, file_name, client_name, created_at, last_seen_at, connected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         session_token = excluded.session_token,
         file_key = excluded.file_key,
         local_file_key = excluded.local_file_key,
         file_name = excluded.file_name,
         client_name = excluded.client_name,
         created_at = excluded.created_at,
         last_seen_at = excluded.last_seen_at,
         connected = excluded.connected`
    ).run(
      session.sessionId,
      session.sessionToken,
      session.fileKey ?? null,
      session.localFileKey ?? null,
      session.fileName ?? null,
      session.clientName ?? null,
      session.createdAt,
      session.lastSeenAt,
      session.connected ? 1 : 0
    );
  }

  private persistCommand(sessionId: string, command: PluginBridgeCommand): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO plugin_bridge_commands (command_id, session_id, type, payload_json, status, created_at, dispatched_at, completed_at, result_json, error_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(command_id) DO UPDATE SET
         session_id = excluded.session_id,
         type = excluded.type,
         payload_json = excluded.payload_json,
         status = excluded.status,
         created_at = excluded.created_at,
         dispatched_at = excluded.dispatched_at,
         completed_at = excluded.completed_at,
         result_json = excluded.result_json,
         error_json = excluded.error_json`
    ).run(
      command.commandId,
      sessionId,
      command.type,
      JSON.stringify(command.payload ?? {}),
      command.status,
      command.createdAt,
      command.dispatchedAt ?? null,
      command.completedAt ?? null,
      command.result === undefined ? null : JSON.stringify(command.result),
      command.error === undefined ? null : JSON.stringify(command.error)
    );
  }

  registerSession(input: RegisterSessionInput): PluginBridgeSession {
    const timestamp = this.now();
    const session: PluginBridgeSession = {
      sessionId: makeId('pbs'),
      sessionToken: makeId('pbt'),
      fileKey: input.fileKey,
      localFileKey: input.localFileKey,
      fileName: input.fileName,
      clientName: input.clientName,
      createdAt: timestamp,
      lastSeenAt: timestamp,
      connected: true
    };
    this.sessions.set(session.sessionId, session);
    this.commandsBySession.set(session.sessionId, []);
    this.persistSession(session);
    return session;
  }

  listSessions(): PluginBridgeSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listActiveSessions(): PluginBridgeSession[] {
    const threshold = Date.parse(this.now()) - this.activeSessionMaxAgeMs;
    return this.listSessions().filter((session) => {
      const seen = Date.parse(session.lastSeenAt || session.createdAt);
      return session.connected && Number.isFinite(seen) && seen >= threshold;
    });
  }

  private getSessionsForSameFile(session: PluginBridgeSession): PluginBridgeSession[] {
    const fileKey = session.fileKey;
    const localFileKey = session.localFileKey;
    const fileName = session.fileName;
    return this.listActiveSessions().filter((candidate) => {
      if (fileKey && candidate.fileKey === fileKey) return true;
      if (localFileKey && candidate.localFileKey === localFileKey) return true;
      if (!fileKey && !localFileKey && fileName && candidate.fileName === fileName) return true;
      return false;
    });
  }

  getSessionScopeSummary(sessionId: string, sessionToken?: string): PluginSessionScopeSummary {
    const session = this.authenticateSession(sessionId, sessionToken);
    const matching = this.getSessionsForSameFile(session);
    return {
      sessionId: session.sessionId,
      fileKey: session.fileKey,
      localFileKey: session.localFileKey,
      fileName: session.fileName,
      activeSessionCount: matching.length,
      activeSessionIds: matching.map((item) => item.sessionId)
    };
  }

  keepOnlySessionForFile(sessionId: string, sessionToken?: string): PluginSessionScopeSummary & { deactivatedSessionIds: string[] } {
    const session = this.authenticateSession(sessionId, sessionToken);
    const matching = this.getSessionsForSameFile(session);
    const deactivatedSessionIds: string[] = [];
    for (const candidate of matching) {
      if (candidate.sessionId === session.sessionId) continue;
      candidate.connected = false;
      this.persistSession(candidate);
      deactivatedSessionIds.push(candidate.sessionId);
    }
    const refreshed = this.getSessionsForSameFile(session);
    return {
      sessionId: session.sessionId,
      fileKey: session.fileKey,
      localFileKey: session.localFileKey,
      fileName: session.fileName,
      activeSessionCount: refreshed.length,
      activeSessionIds: refreshed.map((item) => item.sessionId),
      deactivatedSessionIds
    };
  }

  resolveSession(input: ResolveSessionInput): PluginBridgeSession {
    if (input.sessionId) {
      return this.getSession(input.sessionId);
    }
    let sessions = this.listActiveSessions();
    if (input.fileKey) sessions = sessions.filter((session) => session.fileKey === input.fileKey);
    if (input.localFileKey) sessions = sessions.filter((session) => session.localFileKey === input.localFileKey);
    if (input.clientName) sessions = sessions.filter((session) => session.clientName === input.clientName);
    if (sessions.length === 0) {
      throw new AppError('No active plugin bridge session found', 409, 'PLUGIN_SESSION_NOT_FOUND');
    }
    return sessions[0];
  }

  assertSingleActiveSessionForFile(input: ResolveSessionInput): PluginBridgeSession {
    const resolved = this.resolveSession(input);
    const fileKey = resolved.fileKey ?? input.fileKey;
    const localFileKey = resolved.localFileKey ?? input.localFileKey;
    if (!fileKey && !localFileKey) {
      return resolved;
    }
    const matching = this.listActiveSessions().filter((session) => {
      if (fileKey && session.fileKey === fileKey) return true;
      if (localFileKey && session.localFileKey === localFileKey) return true;
      return false;
    });
    if (matching.length > 1) {
      throw new AppError(
        'Multiple active plugin sessions found for the same Figma file. Live import is blocked until only one session remains active.',
        409,
        'MULTIPLE_ACTIVE_SESSIONS',
        {
          requestedSessionId: input.sessionId ?? resolved.sessionId,
          fileKey: fileKey ?? null,
          localFileKey: localFileKey ?? null,
          activeSessionIds: matching.map((session) => session.sessionId)
        }
      );
    }
    return resolved;
  }

  getSession(sessionId: string): PluginBridgeSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AppError(`Plugin session not found: ${sessionId}`, 404, 'PLUGIN_SESSION_NOT_FOUND');
    }
    return session;
  }

  authenticateSession(sessionId: string, sessionToken?: string): PluginBridgeSession {
    const session = this.getSession(sessionId);
    if (!sessionToken || session.sessionToken !== sessionToken) {
      throw new AppError('Invalid plugin session token', 403, 'PLUGIN_SESSION_FORBIDDEN');
    }
    session.lastSeenAt = this.now();
    session.connected = true;
    this.persistSession(session);
    return session;
  }

  private enqueueCommand(sessionId: string, command: PluginBridgeCommand): PluginBridgeCommand {
    const queue = this.commandsBySession.get(sessionId) ?? [];
    queue.push(command);
    this.commandsBySession.set(sessionId, queue);
    this.persistCommand(sessionId, command);
    return command;
  }

  private assertSessionFileMatch(sessionId: string, fileKey?: string): PluginBridgeSession {
    const session = this.getSession(sessionId);
    if (session.fileKey && fileKey && session.fileKey !== fileKey) {
      throw new AppError('Plugin session fileKey does not match request fileKey', 409, 'PLUGIN_SESSION_FILE_MISMATCH');
    }
    return session;
  }

  queueCreatePage(input: QueueCreatePageInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('create-page', { fileKey: input.fileKey ?? session.fileKey ?? null, name: input.name, actorId: input.actorId }, this.now)
    );
  }

  queueCreateFrame(input: QueueCreateFrameInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('create-frame', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        parentNodeId: input.parentNodeId ?? null,
        uiId: input.uiId ?? null,
        name: input.name,
        width: input.width,
        height: input.height,
        x: input.x ?? null,
        y: input.y ?? null,
        actorId: input.actorId
      }, this.now)
    );
  }

  queueUpdateText(input: QueueUpdateTextInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('update-text', { fileKey: input.fileKey ?? session.fileKey ?? null, nodeId: input.nodeId, text: input.text, actorId: input.actorId }, this.now)
    );
  }

  queueCreateSection(input: QueueCreateSectionInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('create-section', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        parentNodeId: input.parentNodeId ?? null,
        uiId: input.uiId ?? null,
        name: input.name,
        width: input.width ?? null,
        height: input.height ?? null,
        x: input.x ?? null,
        y: input.y ?? null,
        actorId: input.actorId
      }, this.now)
    );
  }

  queueDuplicateBlock(input: QueueDuplicateBlockInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('duplicate-block', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        nodeId: input.nodeId,
        targetParentNodeId: input.targetParentNodeId ?? null,
        name: input.name ?? null,
        x: input.x ?? null,
        y: input.y ?? null,
        actorId: input.actorId
      }, this.now)
    );
  }

  queueApplyStyleFromAlias(input: QueueApplyStyleFromAliasInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('apply-style-from-alias', { fileKey: input.fileKey ?? session.fileKey ?? null, alias: input.alias, nodeId: input.nodeId, actorId: input.actorId }, this.now)
    );
  }

  queueExecutePluginCommand(input: QueueExecutePluginCommandInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('execute-plugin-command', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        command: normalizePluginCommandStep(input.command as Record<string, unknown>),
        actorId: input.actorId
      }, this.now)
    );
  }

  queueExecutePluginBatch(input: QueueExecutePluginBatchInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('execute-plugin-batch', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        commands: input.commands.map((step) => normalizePluginCommandStep(step as Record<string, unknown>)),
        actorId: input.actorId
      }, this.now)
    );
  }

  getCommand(sessionId: string, commandId: string, sessionToken?: string): PluginBridgeCommand {
    this.authenticateSession(sessionId, sessionToken);
    const queue = this.commandsBySession.get(sessionId) ?? [];
    const command = queue.find((item) => item.commandId === commandId);
    if (!command) {
      throw new AppError(`Plugin command not found: ${commandId}`, 404, 'PLUGIN_COMMAND_NOT_FOUND');
    }
    return command;
  }

  private reclaimExpiredDispatchedCommands(sessionId: string): void {
    const queue = this.commandsBySession.get(sessionId) ?? [];
    const threshold = Date.parse(this.now()) - this.dispatchLeaseMs;
    for (const command of queue) {
      if (command.status !== 'dispatched' || !command.dispatchedAt) continue;
      const dispatchedAt = Date.parse(command.dispatchedAt);
      if (!Number.isFinite(dispatchedAt) || dispatchedAt < threshold) {
        command.status = 'queued';
        command.dispatchedAt = undefined;
        this.persistCommand(sessionId, command);
      }
    }
  }

  getPendingCommands(sessionId: string, sessionToken?: string): PluginBridgeCommand[] {
    this.authenticateSession(sessionId, sessionToken);
    this.reclaimExpiredDispatchedCommands(sessionId);
    const queue = this.commandsBySession.get(sessionId) ?? [];
    if (queue.some((command) => command.status === 'dispatched')) {
      return [];
    }
    const next = queue.find((command) => command.status === 'queued');
    if (!next) return [];
    next.status = 'dispatched';
    next.dispatchedAt = this.now();
    this.persistCommand(sessionId, next);
    return [next];
  }

  completeCommand(input: CompleteCommandInput, sessionToken?: string): PluginBridgeCommand {
    this.authenticateSession(input.sessionId, sessionToken);
    const queue = this.commandsBySession.get(input.sessionId) ?? [];
    const command = queue.find((item) => item.commandId === input.commandId);
    if (!command) {
      throw new AppError(`Plugin command not found: ${input.commandId}`, 404, 'PLUGIN_COMMAND_NOT_FOUND');
    }
    command.status = input.error ? 'failed' : 'completed';
    command.dispatchedAt = command.dispatchedAt ?? this.now();
    command.completedAt = this.now();
    command.result = input.result;
    command.error = input.error;
    this.persistCommand(input.sessionId, command);
    return command;
  }
}

export const normalizePluginCommandResult = (
  commandType: FigmaLowLevelCommandType | string,
  result: Partial<FigmaCommandResult>
): FigmaCommandResult => ({
  commandType,
  status: result.status === 'error' ? 'error' : 'ok',
  nodeId: result.nodeId ?? null,
  data: result.data,
  error: result.error
});
