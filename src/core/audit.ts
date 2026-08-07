import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { SqliteDatabase } from '../db/sqlite';
import { logger as defaultLogger } from '../utils/logger';

const REDACTED_VALUE = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 50;
const NON_AUDITED_SYSTEM_PATHS = new Set(['/health', '/version', '/capabilities']);

export type AuditSource = 'rest' | 'mcp';
export type AuditStatus = 'success' | 'error';

export type AuditActor = {
  type: 'api-client' | 'mcp-client';
  id: string;
  ip?: string;
  userAgent?: string;
};

export type AuditEvent = {
  source: AuditSource;
  requestId?: string;
  actor: AuditActor;
  target: string;
  params?: unknown;
  status: AuditStatus;
  errorCode?: string;
  errorMessage?: string;
  timestamp?: string;
};

export type StoredAuditEvent = {
  id: number;
  source: AuditSource;
  actorType: AuditActor['type'];
  actorId: string;
  actorIp?: string;
  actorUserAgent?: string;
  requestId?: string;
  target: string;
  params: unknown;
  status: AuditStatus;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|password|cookie|api[_-]?key)/i;

const trimString = (value: string): string =>
  value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;

const sanitizeAuditValue = (value: unknown): JsonValue => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return trimString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, itemValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : sanitizeAuditValue(itemValue)
    ]);

    return Object.fromEntries(entries) as JsonValue;
  }

  return trimString(String(value));
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export class AuditService {
  private readonly insertStatement;
  private readonly listStatement;
  private readonly logger: Pick<Logger, 'warn'>;

  constructor(
    private readonly db: SqliteDatabase,
    logger: Pick<Logger, 'warn'> = defaultLogger
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_ip TEXT,
        actor_user_agent TEXT,
        request_id TEXT,
        target TEXT NOT NULL,
        params_json TEXT NOT NULL DEFAULT 'null',
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target);
    `);
    this.insertStatement = db.prepare(`
      INSERT INTO audit_events (
        source,
        actor_type,
        actor_id,
        actor_ip,
        actor_user_agent,
        request_id,
        target,
        params_json,
        status,
        error_code,
        error_message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.listStatement = db.prepare(`
      SELECT
        id,
        source,
        actor_type,
        actor_id,
        actor_ip,
        actor_user_agent,
        request_id,
        target,
        params_json,
        status,
        error_code,
        error_message,
        created_at
      FROM audit_events
      ORDER BY id DESC
      LIMIT ?
    `);
    this.logger = logger;
  }

  public record(event: AuditEvent): void {
    const createdAt = event.timestamp ?? new Date().toISOString();
    const sanitizedParams = sanitizeAuditValue(event.params);

    try {
      this.insertStatement.run(
        event.source,
        event.actor.type,
        event.actor.id,
        event.actor.ip ?? null,
        event.actor.userAgent ?? null,
        event.requestId ?? null,
        event.target,
        JSON.stringify(sanitizedParams),
        event.status,
        event.errorCode ?? null,
        event.errorMessage ?? null,
        createdAt
      );
    } catch (error) {
      this.logger.warn({ err: error, target: event.target, source: event.source }, 'Failed to persist audit event');
    }
  }

  public listRecent(limit = 50): StoredAuditEvent[] {
    const rows = this.listStatement.all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: Number(row.id),
      source: row.source as AuditSource,
      actorType: row.actor_type as AuditActor['type'],
      actorId: String(row.actor_id),
      actorIp: row.actor_ip ? String(row.actor_ip) : undefined,
      actorUserAgent: row.actor_user_agent ? String(row.actor_user_agent) : undefined,
      requestId: row.request_id ? String(row.request_id) : undefined,
      target: String(row.target),
      params: parseJson(String(row.params_json ?? 'null')),
      status: row.status as AuditStatus,
      errorCode: row.error_code ? String(row.error_code) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      createdAt: String(row.created_at)
    }));
  }
}

const getRestActorId = (headers: {
  actorId?: string;
  authorization?: string;
}): string => {
  if (headers.actorId?.trim()) {
    return headers.actorId.trim().slice(0, 128);
  }

  if (headers.authorization?.trim()) {
    return 'bearer-client';
  }

  return 'anonymous-client';
};

export const createAuditMiddleware = (auditService: AuditService): RequestHandler => {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if ((method === 'GET' || method === 'HEAD') && NON_AUDITED_SYSTEM_PATHS.has(req.path)) {
      next();
      return;
    }

    res.on('finish', () => {
      auditService.record({
        source: 'rest',
        requestId: req.id,
        actor: {
          type: 'api-client',
          id: getRestActorId({
            actorId: req.header('x-actor-id'),
            authorization: req.header('authorization')
          }),
          ip: req.ip,
          userAgent: req.header('user-agent') ?? undefined
        },
        target: `${req.method} ${req.originalUrl}`,
        params: {
          params: req.params,
          query: req.query,
          body: req.body,
          metric_context: req.metricContext
        },
        status: res.statusCode < 400 ? 'success' : 'error',
        errorCode: res.locals.auditErrorCode as string | undefined,
        errorMessage: res.locals.auditErrorMessage as string | undefined
      });
    });

    next();
  };
};

export const auditMcpToolExecution = async <T>(
  auditService: AuditService,
  toolName: string,
  input: unknown,
  execute: () => Promise<T>
): Promise<T> => {
  try {
    const result = await execute();
    auditService.record({
      source: 'mcp',
      actor: {
        type: 'mcp-client',
        id: 'mcp-client'
      },
      target: toolName,
      params: input,
      status: 'success'
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'INTERNAL_ERROR';

    auditService.record({
      source: 'mcp',
      actor: {
        type: 'mcp-client',
        id: 'mcp-client'
      },
      target: toolName,
      params: input,
      status: 'error',
      errorCode: code,
      errorMessage: message
    });
    throw error;
  }
};

export const sanitizeAuditParams = sanitizeAuditValue;
