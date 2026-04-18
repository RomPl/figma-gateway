import { z } from 'zod';

import { AppError } from './errors';
import { getBlockIdentityAliasesFromUnknown } from './block-identity';
import { extractVariantGroupSearchValues } from './variant-group-preview';
import type { SqliteDatabase } from '../db/sqlite';

const uiIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

export const uiBlockSchema = z.object({
  uiId: z.string().trim().min(1).max(200).regex(uiIdPattern),
  project: z.string().trim().min(1).max(128),
  fileKey: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  codeRepository: z.string().trim().min(1).max(200).optional(),
  codePath: z.string().trim().min(1).max(500).optional(),
  codeExportName: z.string().trim().min(1).max(200).optional(),
  codeSelector: z.string().trim().min(1).max(200).optional(),
  codeMarkerType: z.enum(['data-ui-id', 'comment', 'metadata']).default('data-ui-id'),
  figmaBindingType: z.enum(['plugin-data', 'shared-plugin-data', 'node-name']).default('plugin-data'),
  figmaBindingKey: z.string().trim().min(1).max(200).default('figma-gateway.ui-id'),
  name: z.string().trim().max(200).optional().transform((value) => value || undefined),
  description: z.string().trim().max(500).optional().transform((value) => value || undefined),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const resolveUiBlockSchema = z.object({
  uiId: z.string().trim().min(1).max(200).regex(uiIdPattern)
});

export const listUiBlocksSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  tag: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const searchUiBlocksSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  codePath: z.string().trim().min(1).max(500).optional(),
  fileKey: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type UiBlockRecord = {
  uiId: string;
  project: string;
  fileKey?: string;
  nodeId?: string;
  codeRepository?: string;
  codePath?: string;
  codeExportName?: string;
  codeSelector?: string;
  codeMarkerType: 'data-ui-id' | 'comment' | 'metadata';
  figmaBindingType: 'plugin-data' | 'shared-plugin-data' | 'node-name';
  figmaBindingKey: string;
  name?: string;
  description?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type UiBlockRow = {
  ui_id: string;
  project: string;
  file_key: string | null;
  node_id: string | null;
  code_repository: string | null;
  code_path: string | null;
  code_export_name: string | null;
  code_selector: string | null;
  code_marker_type: UiBlockRecord['codeMarkerType'];
  figma_binding_type: UiBlockRecord['figmaBindingType'];
  figma_binding_key: string;
  name: string | null;
  description: string | null;
  tags_json: string;
  metadata_json: string;
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
const blockSearchValues = (record: UiBlockRecord): string[] => {
  const aliases = getBlockIdentityAliasesFromUnknown(record.metadata);
  const variantAliases = extractVariantGroupSearchValues(record.metadata);
  return [record.uiId, record.project, record.name, record.description, record.codePath, record.codeSelector, record.fileKey, record.nodeId, ...record.tags, ...aliases, ...variantAliases].filter(Boolean) as string[];
};

const mapRow = (row: UiBlockRow): UiBlockRecord => ({
  uiId: row.ui_id,
  project: row.project,
  fileKey: row.file_key ?? undefined,
  nodeId: row.node_id ?? undefined,
  codeRepository: row.code_repository ?? undefined,
  codePath: row.code_path ?? undefined,
  codeExportName: row.code_export_name ?? undefined,
  codeSelector: row.code_selector ?? undefined,
  codeMarkerType: row.code_marker_type,
  figmaBindingType: row.figma_binding_type,
  figmaBindingKey: row.figma_binding_key,
  name: row.name ?? undefined,
  description: row.description ?? undefined,
  tags: JSON.parse(row.tags_json) as string[],
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class UiBlockRegistry {
  constructor(private readonly db: SqliteDatabase) {}

  public upsert(input: z.infer<typeof uiBlockSchema>): UiBlockRecord {
    const data = uiBlockSchema.parse(input);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO ui_blocks (
        ui_id, project, file_key, node_id, code_repository, code_path, code_export_name, code_selector,
        code_marker_type, figma_binding_type, figma_binding_key, name, description, tags_json, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ui_id) DO UPDATE SET
        project = excluded.project,
        file_key = excluded.file_key,
        node_id = excluded.node_id,
        code_repository = excluded.code_repository,
        code_path = excluded.code_path,
        code_export_name = excluded.code_export_name,
        code_selector = excluded.code_selector,
        code_marker_type = excluded.code_marker_type,
        figma_binding_type = excluded.figma_binding_type,
        figma_binding_key = excluded.figma_binding_key,
        name = excluded.name,
        description = excluded.description,
        tags_json = excluded.tags_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      data.uiId,
      data.project,
      data.fileKey ?? null,
      data.nodeId ?? null,
      data.codeRepository ?? null,
      data.codePath ?? null,
      data.codeExportName ?? null,
      data.codeSelector ?? null,
      data.codeMarkerType,
      data.figmaBindingType,
      data.figmaBindingKey,
      data.name ?? null,
      data.description ?? null,
      JSON.stringify(data.tags),
      JSON.stringify(data.metadata),
      now,
      now
    );

    return this.getByUiIdOrThrow(data.uiId);
  }

  public getByUiId(uiId: string): UiBlockRecord | null {
    const data = resolveUiBlockSchema.parse({ uiId });
    const row = this.db.prepare(`
      SELECT ui_id, project, file_key, node_id, code_repository, code_path, code_export_name, code_selector,
             code_marker_type, figma_binding_type, figma_binding_key, name, description, tags_json, metadata_json,
             created_at, updated_at
      FROM ui_blocks
      WHERE ui_id = ?
      LIMIT 1
    `).get(data.uiId) as UiBlockRow | undefined;

    return row ? mapRow(row) : null;
  }

  public getByUiIdOrThrow(uiId: string): UiBlockRecord {
    const record = this.getByUiId(uiId);
    if (!record) {
      throw new AppError(`UI block not found: ${uiId}`, 404, 'UI_BLOCK_NOT_FOUND');
    }
    return record;
  }

  public list(input?: z.input<typeof listUiBlocksSchema>): UiBlockRecord[] {
    const data = listUiBlocksSchema.parse(input ?? {});
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (data.project) {
      clauses.push('project = ?');
      params.push(data.project);
    }

    if (data.tag) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)");
      params.push(data.tag);
    }

    params.push(data.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT ui_id, project, file_key, node_id, code_repository, code_path, code_export_name, code_selector,
             code_marker_type, figma_binding_type, figma_binding_key, name, description, tags_json, metadata_json,
             created_at, updated_at
      FROM ui_blocks
      ${where}
      ORDER BY ui_id ASC
      LIMIT ?
    `).all(...(params as any[])) as UiBlockRow[];

    return rows.map(mapRow);
  }

  public search(input: z.input<typeof searchUiBlocksSchema>): UiBlockRecord[] {
    const data = searchUiBlocksSchema.parse(input);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (data.query) {
      clauses.push(`(
        ui_id LIKE ? OR project LIKE ? OR COALESCE(name, '') LIKE ? OR COALESCE(description, '') LIKE ? OR
        COALESCE(code_path, '') LIKE ? OR COALESCE(code_selector, '') LIKE ? OR COALESCE(file_key, '') LIKE ? OR COALESCE(node_id, '') LIKE ? OR metadata_json LIKE ?
      )`);
      const pattern = `%${data.query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (data.project) {
      clauses.push('project = ?');
      params.push(data.project);
    }
    if (data.codePath) {
      clauses.push('code_path = ?');
      params.push(data.codePath);
    }
    if (data.fileKey) {
      clauses.push('file_key = ?');
      params.push(data.fileKey);
    }
    if (data.nodeId) {
      clauses.push('node_id = ?');
      params.push(data.nodeId);
    }
    for (const tag of data.tags) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)");
      params.push(tag);
    }

    params.push(Math.max(data.limit * 5, data.limit));
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT ui_id, project, file_key, node_id, code_repository, code_path, code_export_name, code_selector,
             code_marker_type, figma_binding_type, figma_binding_key, name, description, tags_json, metadata_json,
             created_at, updated_at
      FROM ui_blocks
      ${where}
      ORDER BY ui_id ASC
      LIMIT ?
    `).all(...(params as any[])) as UiBlockRow[];

    return rows
      .map(mapRow)
      .map((record) => ({ record, score: computeAliasScore(data.query, blockSearchValues(record)) }))
      .sort((a, b) => b.score - a.score || a.record.uiId.localeCompare(b.record.uiId))
      .slice(0, data.limit)
      .map((item) => item.record);
  }

  public resolve(input: z.infer<typeof resolveUiBlockSchema>): UiBlockRecord {
    const data = resolveUiBlockSchema.parse(input);
    return this.getByUiIdOrThrow(data.uiId);
  }
}

export const createUiBlockService = (uiBlockRegistry: UiBlockRegistry) => ({
  upsertUiBlock: (input: z.infer<typeof uiBlockSchema>) => uiBlockRegistry.upsert(input),
  listUiBlocks: (input?: z.input<typeof listUiBlocksSchema>) => uiBlockRegistry.list(input),
  getUiBlock: (input: z.infer<typeof resolveUiBlockSchema>) => uiBlockRegistry.resolve(input),
  resolveUiBlock: (input: z.infer<typeof resolveUiBlockSchema>) => uiBlockRegistry.resolve(input),
  searchUiBlocks: (input: z.infer<typeof searchUiBlocksSchema>) => uiBlockRegistry.search(input)
});

export type UiBlockService = ReturnType<typeof createUiBlockService>;
