import { createHash } from 'node:crypto';
import { z } from 'zod';

import { AppError } from './errors';
import type { SqliteDatabase } from '../db/sqlite';

const isoDateTime = z.string().datetime({ offset: true });

export const assetRegistryRecordSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  project: z.string().trim().min(1).max(128),
  uiId: z.string().trim().min(1).max(200).optional(),
  assetKind: z.enum(['image', 'svg', 'background-image', 'icon', 'placeholder']),
  sourcePath: z.string().trim().min(1).max(2000).optional(),
  resolvedUrl: z.string().trim().min(1).max(4000).optional(),
  hash: z.string().trim().min(1).max(128),
  width: z.number().finite().nonnegative().optional(),
  height: z.number().finite().nonnegative().optional(),
  role: z.enum(['content', 'decorative']).optional(),
  figmaStrategy: z.enum(['image_fill', 'vector_icon', 'placeholder']).default('placeholder'),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const upsertAssetRegistrySchema = assetRegistryRecordSchema;
export const resolveAssetRegistrySchema = z.object({ assetId: z.string().trim().min(1).max(200) });
export const listAssetRegistrySchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  uiId: z.string().trim().min(1).max(200).optional(),
  assetKind: z.enum(['image', 'svg', 'background-image', 'icon', 'placeholder']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type AssetRegistryRecord = z.infer<typeof assetRegistryRecordSchema> & { createdAt: string; updatedAt: string };

type AssetRegistryRow = {
  asset_id: string;
  project: string;
  ui_id: string | null;
  asset_kind: AssetRegistryRecord['assetKind'];
  source_path: string | null;
  resolved_url: string | null;
  hash: string;
  width: number | null;
  height: number | null;
  role: AssetRegistryRecord['role'] | null;
  figma_strategy: AssetRegistryRecord['figmaStrategy'];
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: AssetRegistryRow): AssetRegistryRecord => ({
  assetId: row.asset_id,
  project: row.project,
  uiId: row.ui_id ?? undefined,
  assetKind: row.asset_kind,
  sourcePath: row.source_path ?? undefined,
  resolvedUrl: row.resolved_url ?? undefined,
  hash: row.hash,
  width: row.width ?? undefined,
  height: row.height ?? undefined,
  role: row.role ?? undefined,
  figmaStrategy: row.figma_strategy,
  metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const inferAssetHash = (input: { assetKind: string; sourcePath?: string; resolvedUrl?: string; width?: number; height?: number; role?: string; spriteRef?: string; textLabel?: string }): string =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');

export const inferAssetId = (project: string, uiId: string | undefined, hash: string): string =>
  `${project}:${uiId ?? 'unbound'}:${hash.slice(0, 16)}`;

export const inferFigmaAssetStrategy = (input: { assetKind: AssetRegistryRecord['assetKind']; role?: AssetRegistryRecord['role']; sourcePath?: string; resolvedUrl?: string; metadata?: Record<string, unknown> }): AssetRegistryRecord['figmaStrategy'] => {
  if (input.assetKind === 'image' || input.assetKind === 'background-image') return 'image_fill';
  if (input.assetKind === 'svg' || input.assetKind === 'icon') return 'vector_icon';
  return 'placeholder';
};

export class AssetRegistry {
  constructor(private readonly db: SqliteDatabase) {}

  public upsert(input: z.input<typeof upsertAssetRegistrySchema>): AssetRegistryRecord {
    const data = upsertAssetRegistrySchema.parse(input);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO asset_registry (
        asset_id, project, ui_id, asset_kind, source_path, resolved_url, hash, width, height, role, figma_strategy, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        project = excluded.project,
        ui_id = excluded.ui_id,
        asset_kind = excluded.asset_kind,
        source_path = excluded.source_path,
        resolved_url = excluded.resolved_url,
        hash = excluded.hash,
        width = excluded.width,
        height = excluded.height,
        role = excluded.role,
        figma_strategy = excluded.figma_strategy,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      data.assetId,
      data.project,
      data.uiId ?? null,
      data.assetKind,
      data.sourcePath ?? null,
      data.resolvedUrl ?? null,
      data.hash,
      data.width ?? null,
      data.height ?? null,
      data.role ?? null,
      data.figmaStrategy,
      JSON.stringify(data.metadata ?? {}),
      now,
      now
    );
    return this.getByAssetIdOrThrow(data.assetId);
  }

  public getByAssetId(assetId: string): AssetRegistryRecord | null {
    const row = this.db.prepare(`SELECT asset_id, project, ui_id, asset_kind, source_path, resolved_url, hash, width, height, role, figma_strategy, metadata_json, created_at, updated_at FROM asset_registry WHERE asset_id = ? LIMIT 1`).get(assetId) as AssetRegistryRow | undefined;
    return row ? mapRow(row) : null;
  }

  public getByAssetIdOrThrow(assetId: string): AssetRegistryRecord {
    const record = this.getByAssetId(assetId);
    if (!record) throw new AppError(`Asset registry record not found: ${assetId}`, 404, 'ASSET_NOT_FOUND');
    return record;
  }

  public list(input?: z.input<typeof listAssetRegistrySchema>): AssetRegistryRecord[] {
    const data = listAssetRegistrySchema.parse(input ?? {});
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (data.project) { clauses.push('project = ?'); params.push(data.project); }
    if (data.uiId) { clauses.push('ui_id = ?'); params.push(data.uiId); }
    if (data.assetKind) { clauses.push('asset_kind = ?'); params.push(data.assetKind); }
    params.push(data.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT asset_id, project, ui_id, asset_kind, source_path, resolved_url, hash, width, height, role, figma_strategy, metadata_json, created_at, updated_at FROM asset_registry ${where} ORDER BY asset_id ASC LIMIT ?`).all(...(params as any[])) as AssetRegistryRow[];
    return rows.map(mapRow);
  }
}

export const createAssetRegistryService = (assetRegistry: AssetRegistry) => ({
  upsertAsset: (input: z.input<typeof upsertAssetRegistrySchema>): AssetRegistryRecord => assetRegistry.upsert(input),
  resolveAsset: (input: z.input<typeof resolveAssetRegistrySchema>): AssetRegistryRecord => assetRegistry.getByAssetIdOrThrow(resolveAssetRegistrySchema.parse(input).assetId),
  listAssets: (input?: z.input<typeof listAssetRegistrySchema>): AssetRegistryRecord[] => assetRegistry.list(input)
});
