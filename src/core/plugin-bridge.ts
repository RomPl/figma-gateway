import crypto from 'node:crypto';

import { AppError } from './errors';
import type { FigmaCommandResult, FigmaCommandStep, FigmaLowLevelCommandType } from './figma-write-types';

export type PluginBridgeCommandType =
  | 'create-page'
  | 'create-frame'
  | 'update-text'
  | 'create-section'
  | 'duplicate-block'
  | 'apply-style-from-alias'
  | 'execute-plugin-command'
  | 'execute-plugin-batch';
export type PluginBridgeCommandStatus = 'queued' | 'completed' | 'failed';

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

type ResolveSessionInput = {
  sessionId?: string;
  fileKey?: string;
  clientName?: string;
};

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const ACTIVE_SESSION_MAX_AGE_MS = 60_000;

const createQueuedCommand = (
  type: PluginBridgeCommandType,
  payload: Record<string, unknown>
): PluginBridgeCommand => ({
  commandId: makeId('pbc'),
  type,
  payload,
  status: 'queued',
  createdAt: nowIso()
});

export class PluginBridgeService {
  private readonly sessions = new Map<string, PluginBridgeSession>();
  private readonly commandsBySession = new Map<string, PluginBridgeCommand[]>();

  registerSession(input: RegisterSessionInput): PluginBridgeSession {
    const session: PluginBridgeSession = {
      sessionId: makeId('pbs'),
      sessionToken: makeId('pbt'),
      fileKey: input.fileKey,
      localFileKey: input.localFileKey,
      fileName: input.fileName,
      clientName: input.clientName,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      connected: true
    };
    this.sessions.set(session.sessionId, session);
    this.commandsBySession.set(session.sessionId, []);
    return session;
  }

  listSessions(): PluginBridgeSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listActiveSessions(): PluginBridgeSession[] {
    const threshold = Date.now() - ACTIVE_SESSION_MAX_AGE_MS;
    return this.listSessions().filter((session) => {
      const seen = Date.parse(session.lastSeenAt || session.createdAt);
      return session.connected && Number.isFinite(seen) && seen >= threshold;
    });
  }

  resolveSession(input: ResolveSessionInput): PluginBridgeSession {
    if (input.sessionId) {
      return this.getSession(input.sessionId);
    }

    let sessions = this.listActiveSessions();

    if (input.fileKey) {
      sessions = sessions.filter((session) => session.fileKey === input.fileKey);
    }

    if (input.clientName) {
      sessions = sessions.filter((session) => session.clientName === input.clientName);
    }

    if (sessions.length === 0) {
      throw new AppError('No active plugin bridge session found', 409, 'PLUGIN_SESSION_NOT_FOUND');
    }

    return sessions[0];
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
    session.lastSeenAt = nowIso();
    session.connected = true;
    return session;
  }

  private enqueueCommand(sessionId: string, command: PluginBridgeCommand): PluginBridgeCommand {
    const queue = this.commandsBySession.get(sessionId) ?? [];
    queue.push(command);
    this.commandsBySession.set(sessionId, queue);
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
      createQueuedCommand('create-page', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        name: input.name,
        actorId: input.actorId
      })
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
      })
    );
  }

  queueUpdateText(input: QueueUpdateTextInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('update-text', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        nodeId: input.nodeId,
        text: input.text,
        actorId: input.actorId
      })
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
      })
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
      })
    );
  }

  queueApplyStyleFromAlias(input: QueueApplyStyleFromAliasInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('apply-style-from-alias', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        alias: input.alias,
        nodeId: input.nodeId,
        actorId: input.actorId
      })
    );
  }

  queueExecutePluginCommand(input: QueueExecutePluginCommandInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('execute-plugin-command', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        command: input.command,
        actorId: input.actorId
      })
    );
  }

  queueExecutePluginBatch(input: QueueExecutePluginBatchInput): PluginBridgeCommand {
    const session = this.assertSessionFileMatch(input.sessionId, input.fileKey);
    return this.enqueueCommand(
      input.sessionId,
      createQueuedCommand('execute-plugin-batch', {
        fileKey: input.fileKey ?? session.fileKey ?? null,
        commands: input.commands,
        actorId: input.actorId
      })
    );
  }

  getPendingCommands(sessionId: string, sessionToken?: string): PluginBridgeCommand[] {
    this.authenticateSession(sessionId, sessionToken);
    const queue = this.commandsBySession.get(sessionId) ?? [];
    return queue.filter((command) => command.status === 'queued');
  }

  completeCommand(input: CompleteCommandInput, sessionToken?: string): PluginBridgeCommand {
    this.authenticateSession(input.sessionId, sessionToken);
    const queue = this.commandsBySession.get(input.sessionId) ?? [];
    const command = queue.find((item) => item.commandId === input.commandId);
    if (!command) {
      throw new AppError(`Plugin command not found: ${input.commandId}`, 404, 'PLUGIN_COMMAND_NOT_FOUND');
    }
    command.status = input.error ? 'failed' : 'completed';
    command.completedAt = nowIso();
    command.result = input.result;
    command.error = input.error;
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
