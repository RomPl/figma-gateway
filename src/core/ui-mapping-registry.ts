import { z } from 'zod';

import { AppError } from './errors';
import { getBlockIdentityAliasesFromUnknown } from './block-identity';
import type { SqliteDatabase } from '../db/sqlite';

const uiIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;
const isoDateTime = z.string().datetime({ offset: true });

const codeRefSchema = z.object({
  file: z.string().trim().min(1).max(500),
  component: z.string().trim().min(1).max(200),
  selector: z.string().trim().min(1).max(500).optional(),
  sourceRange: z.object({
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive()
  }).optional(),
  jsxPath: z.string().trim().min(1).max(1000).optional(),
  snapshotHash: z.string().trim().min(1).max(200).optional(),
  snapshot: z.record(z.string(), z.unknown()).optional()
});

const figmaRefSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  snapshotHash: z.string().trim().min(1).max(200).optional(),
  snapshot: z.record(z.string(), z.unknown()).optional()
});

const syncSchema = z.object({
  lastDirection: z.enum(['code_to_figma', 'figma_to_code', 'bidirectional', 'unknown']).default('unknown'),
  lastSyncedAt: isoDateTime.optional(),
  lastCodeHash: z.string().trim().min(1).max(200).optional(),
  lastFigmaHash: z.string().trim().min(1).max(200).optional()
});

export const uiMappingSchema = z.object({
  uiId: z.string().trim().min(1).max(200).regex(uiIdPattern),
  project: z.string().trim().min(1).max(128),
  semanticRole: z.string().trim().min(1).max(100).optional(),
  code: codeRefSchema,
  figma: figmaRefSchema,
  sync: syncSchema.default({ lastDirection: 'unknown' })
});

export const resolveUiMappingSchema = z.object({
  uiId: z.string().trim().min(1).max(200).regex(uiIdPattern)
});

export const listUiMappingsSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  semanticRole: z.string().trim().min(1).max(100).optional(),
  fileKey: z.string().trim().min(1).optional(),
  codeFile: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const searchUiMappingsSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  semanticRole: z.string().trim().min(1).max(100).optional(),
  fileKey: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  codeFile: z.string().trim().min(1).max(500).optional(),
  component: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type UiMappingRecord = {
  uiId: string;
  project: string;
  semanticRole?: string;
  code: {
    file: string;
    component: string;
    selector?: string;
    sourceRange?: {
      lineStart: number;
      lineEnd: number;
    };
    jsxPath?: string;
    snapshotHash?: string;
    snapshot?: Record<string, unknown>;
  };
  figma: {
    fileKey: string;
    nodeId: string;
    snapshotHash?: string;
    snapshot?: Record<string, unknown>;
  };
  sync: {
    lastDirection: 'code_to_figma' | 'figma_to_code' | 'bidirectional' | 'unknown';
    lastSyncedAt?: string;
    lastCodeHash?: string;
    lastFigmaHash?: string;
  };
  createdAt: string;
  updatedAt: string;
};

type UiMappingRow = {
  ui_id: string;
  project: string;
  semantic_role: string | null;
  code_file: string;
  code_component: string;
  code_selector: string | null;
  code_line_start: number | null;
  code_line_end: number | null;
  code_jsx_path: string | null;
  code_snapshot_hash: string | null;
  code_snapshot_json: string;
  figma_file_key: string;
  figma_node_id: string;
  figma_snapshot_hash: string | null;
  figma_snapshot_json: string;
  sync_last_direction: UiMappingRecord['sync']['lastDirection'];
  sync_last_synced_at: string | null;
  sync_last_code_hash: string | null;
  sync_last_figma_hash: string | null;
  created_at: string;
  updated_at: string;
};


const normalizeSearch = (value: string): string => value.toLowerCase().trim();
const computeAliasScore = (query: string | undefined, values: string[]): number => {
  if (!query) return 0;
  const q = normalizeSearch(query);
  let score = 0;
  for (const value of values.map((item) => normalizeSearch(item)).filter(Boolean)) {
    if (value === q) score = Math.max(score, 100);
    else if (value.includes(q) || q.includes(value)) score = Math.max(score, 70);
  }
  return score;
};
const mappingSearchValues = (record: UiMappingRecord): string[] => {
  const codeAliases = getBlockIdentityAliasesFromUnknown(record.code.snapshot && typeof record.code.snapshot === 'object' ? (record.code.snapshot as Record<string, unknown>).meta : undefined);
  const figmaAliases = getBlockIdentityAliasesFromUnknown(record.figma.snapshot && typeof record.figma.snapshot === 'object' ? (record.figma.snapshot as Record<string, unknown>).meta : undefined);
  return [record.uiId, record.project, record.semanticRole, record.code.file, record.code.component, record.code.selector, record.code.jsxPath, record.figma.fileKey, record.figma.nodeId, ...codeAliases, ...figmaAliases].filter(Boolean) as string[];
};

const mapRow = (row: UiMappingRow): UiMappingRecord => ({
  uiId: row.ui_id,
  project: row.project,
  semanticRole: row.semantic_role ?? undefined,
  code: {
    file: row.code_file,
    component: row.code_component,
    selector: row.code_selector ?? undefined,
    sourceRange: row.code_line_start && row.code_line_end ? { lineStart: row.code_line_start, lineEnd: row.code_line_end } : undefined,
    jsxPath: row.code_jsx_path ?? undefined,
    snapshotHash: row.code_snapshot_hash ?? undefined,
    snapshot: JSON.parse(row.code_snapshot_json) as Record<string, unknown>
  },
  figma: {
    fileKey: row.figma_file_key,
    nodeId: row.figma_node_id,
    snapshotHash: row.figma_snapshot_hash ?? undefined,
    snapshot: JSON.parse(row.figma_snapshot_json) as Record<string, unknown>
  },
  sync: {
    lastDirection: row.sync_last_direction,
    lastSyncedAt: row.sync_last_synced_at ?? undefined,
    lastCodeHash: row.sync_last_code_hash ?? undefined,
    lastFigmaHash: row.sync_last_figma_hash ?? undefined
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class UiMappingRegistry {
  constructor(private readonly db: SqliteDatabase) {}

  public upsert(input: z.infer<typeof uiMappingSchema>): UiMappingRecord {
    const data = uiMappingSchema.parse(input);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO ui_mappings (
        ui_id, project, semantic_role,
        code_file, code_component, code_selector, code_line_start, code_line_end, code_jsx_path, code_snapshot_hash, code_snapshot_json,
        figma_file_key, figma_node_id, figma_snapshot_hash, figma_snapshot_json,
        sync_last_direction, sync_last_synced_at, sync_last_code_hash, sync_last_figma_hash,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ui_id) DO UPDATE SET
        project = excluded.project,
        semantic_role = excluded.semantic_role,
        code_file = excluded.code_file,
        code_component = excluded.code_component,
        code_selector = excluded.code_selector,
        code_line_start = excluded.code_line_start,
        code_line_end = excluded.code_line_end,
        code_jsx_path = excluded.code_jsx_path,
        code_snapshot_hash = excluded.code_snapshot_hash,
        code_snapshot_json = excluded.code_snapshot_json,
        figma_file_key = excluded.figma_file_key,
        figma_node_id = excluded.figma_node_id,
        figma_snapshot_hash = excluded.figma_snapshot_hash,
        figma_snapshot_json = excluded.figma_snapshot_json,
        sync_last_direction = excluded.sync_last_direction,
        sync_last_synced_at = excluded.sync_last_synced_at,
        sync_last_code_hash = excluded.sync_last_code_hash,
        sync_last_figma_hash = excluded.sync_last_figma_hash,
        updated_at = excluded.updated_at
    `).run(
      data.uiId,
      data.project,
      data.semanticRole ?? null,
      data.code.file,
      data.code.component,
      data.code.selector ?? null,
      data.code.sourceRange?.lineStart ?? null,
      data.code.sourceRange?.lineEnd ?? null,
      data.code.jsxPath ?? null,
      data.code.snapshotHash ?? null,
      JSON.stringify(data.code.snapshot ?? {}),
      data.figma.fileKey,
      data.figma.nodeId,
      data.figma.snapshotHash ?? null,
      JSON.stringify(data.figma.snapshot ?? {}),
      data.sync.lastDirection,
      data.sync.lastSyncedAt ?? null,
      data.sync.lastCodeHash ?? null,
      data.sync.lastFigmaHash ?? null,
      now,
      now
    );

    return this.getByUiIdOrThrow(data.uiId);
  }

  public getByUiId(uiId: string): UiMappingRecord | null {
    const data = resolveUiMappingSchema.parse({ uiId });
    const row = this.db.prepare(`
      SELECT ui_id, project, semantic_role,
             code_file, code_component, code_selector, code_line_start, code_line_end, code_jsx_path, code_snapshot_hash, code_snapshot_json,
             figma_file_key, figma_node_id, figma_snapshot_hash, figma_snapshot_json,
             sync_last_direction, sync_last_synced_at, sync_last_code_hash, sync_last_figma_hash,
             created_at, updated_at
      FROM ui_mappings
      WHERE ui_id = ?
      LIMIT 1
    `).get(data.uiId) as UiMappingRow | undefined;

    return row ? mapRow(row) : null;
  }

  public getByUiIdOrThrow(uiId: string): UiMappingRecord {
    const record = this.getByUiId(uiId);
    if (!record) {
      throw new AppError(`UI mapping not found: ${uiId}`, 404, 'UI_MAPPING_NOT_FOUND');
    }
    return record;
  }

  public list(input?: z.input<typeof listUiMappingsSchema>): UiMappingRecord[] {
    const data = listUiMappingsSchema.parse(input ?? {});
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (data.project) {
      clauses.push('project = ?');
      params.push(data.project);
    }
    if (data.semanticRole) {
      clauses.push('semantic_role = ?');
      params.push(data.semanticRole);
    }
    if (data.fileKey) {
      clauses.push('figma_file_key = ?');
      params.push(data.fileKey);
    }
    if (data.codeFile) {
      clauses.push('code_file = ?');
      params.push(data.codeFile);
    }

    params.push(data.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT ui_id, project, semantic_role,
             code_file, code_component, code_selector, code_line_start, code_line_end, code_jsx_path, code_snapshot_hash, code_snapshot_json,
             figma_file_key, figma_node_id, figma_snapshot_hash, figma_snapshot_json,
             sync_last_direction, sync_last_synced_at, sync_last_code_hash, sync_last_figma_hash,
             created_at, updated_at
      FROM ui_mappings
      ${where}
      ORDER BY ui_id ASC
      LIMIT ?
    `).all(...(params as any[])) as UiMappingRow[];

    return rows.map(mapRow);
  }

  public search(input: z.input<typeof searchUiMappingsSchema>): UiMappingRecord[] {
    const data = searchUiMappingsSchema.parse(input);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (data.query) {
      clauses.push(`(
        ui_id LIKE ? OR project LIKE ? OR COALESCE(semantic_role, '') LIKE ? OR code_file LIKE ? OR code_component LIKE ? OR COALESCE(code_selector, '') LIKE ? OR COALESCE(code_jsx_path, '') LIKE ? OR figma_file_key LIKE ? OR figma_node_id LIKE ? OR code_snapshot_json LIKE ? OR figma_snapshot_json LIKE ?
      )`);
      const pattern = `%${data.query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (data.project) { clauses.push('project = ?'); params.push(data.project); }
    if (data.semanticRole) { clauses.push('semantic_role = ?'); params.push(data.semanticRole); }
    if (data.fileKey) { clauses.push('figma_file_key = ?'); params.push(data.fileKey); }
    if (data.nodeId) { clauses.push('figma_node_id = ?'); params.push(data.nodeId); }
    if (data.codeFile) { clauses.push('code_file = ?'); params.push(data.codeFile); }
    if (data.component) { clauses.push('code_component = ?'); params.push(data.component); }

    params.push(Math.max(data.limit * 5, data.limit));
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT ui_id, project, semantic_role,
             code_file, code_component, code_selector, code_line_start, code_line_end, code_jsx_path, code_snapshot_hash, code_snapshot_json,
             figma_file_key, figma_node_id, figma_snapshot_hash, figma_snapshot_json,
             sync_last_direction, sync_last_synced_at, sync_last_code_hash, sync_last_figma_hash,
             created_at, updated_at
      FROM ui_mappings
      ${where}
      ORDER BY ui_id ASC
      LIMIT ?
    `).all(...(params as any[])) as UiMappingRow[];

    return rows
      .map(mapRow)
      .map((record) => ({ record, score: computeAliasScore(data.query, mappingSearchValues(record)) }))
      .sort((a, b) => b.score - a.score || a.record.uiId.localeCompare(b.record.uiId))
      .slice(0, data.limit)
      .map((item) => item.record);
  }

  public resolve(input: z.infer<typeof resolveUiMappingSchema>): UiMappingRecord {
    const data = resolveUiMappingSchema.parse(input);
    return this.getByUiIdOrThrow(data.uiId);
  }
}

export const createUiMappingService = (uiMappingRegistry: UiMappingRegistry) => ({
  upsertUiMapping: (input: z.infer<typeof uiMappingSchema>) => uiMappingRegistry.upsert(input),
  listUiMappings: (input?: z.input<typeof listUiMappingsSchema>) => uiMappingRegistry.list(input),
  getUiMapping: (input: z.infer<typeof resolveUiMappingSchema>) => uiMappingRegistry.resolve(input),
  resolveUiMapping: (input: z.infer<typeof resolveUiMappingSchema>) => uiMappingRegistry.resolve(input),
  searchUiMappings: (input: z.infer<typeof searchUiMappingsSchema>) => uiMappingRegistry.search(input)
});

export type UiMappingService = ReturnType<typeof createUiMappingService>;
