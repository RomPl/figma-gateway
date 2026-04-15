import { AppError } from './errors';
import type { FigmaGatewayService } from './figma-gateway-service';
import { z } from 'zod';
import type { SqliteDatabase } from '../db/sqlite';

export const aliasSchema = z.object({
  alias: z.string().trim().min(1).max(128).regex(/^[a-z0-9:_-]+$/i),
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  project: z.string().trim().min(1).max(128),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  description: z.string().trim().max(500).optional().transform((value) => value || undefined)
});

export const resolveAliasSchema = z.object({
  alias: z.string().trim().min(1).max(128)
});

export const searchAliasesSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const listAliasesSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  tag: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type AliasRecord = {
  alias: string;
  fileKey: string;
  nodeId: string;
  project: string;
  tags: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
};

type AliasRow = {
  alias: string;
  file_key: string;
  node_id: string;
  project: string;
  tags_json: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const mapAliasRow = (row: AliasRow): AliasRecord => ({
  alias: row.alias,
  fileKey: row.file_key,
  nodeId: row.node_id,
  project: row.project,
  tags: JSON.parse(row.tags_json) as string[],
  description: row.description ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class AliasRegistry {
  constructor(private readonly db: SqliteDatabase) {}

  public upsert(input: z.infer<typeof aliasSchema>): AliasRecord {
    const data = aliasSchema.parse(input);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO aliases (alias, file_key, node_id, project, tags_json, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alias) DO UPDATE SET
        file_key = excluded.file_key,
        node_id = excluded.node_id,
        project = excluded.project,
        tags_json = excluded.tags_json,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(
      data.alias,
      data.fileKey,
      data.nodeId,
      data.project,
      JSON.stringify(data.tags),
      data.description ?? null,
      now,
      now
    );

    return this.getByAliasOrThrow(data.alias);
  }

  public list(input?: z.input<typeof listAliasesSchema>): AliasRecord[] {
    const data = listAliasesSchema.parse(input ?? {});
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

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT alias, file_key, node_id, project, tags_json, description, created_at, updated_at
      FROM aliases
      ${where}
      ORDER BY alias ASC
      LIMIT ?
    `).all(...(params as any[])) as AliasRow[];

    return rows.map(mapAliasRow);
  }

  public getByAlias(alias: string): AliasRecord | null {
    const data = resolveAliasSchema.parse({ alias });
    const row = this.db.prepare(`
      SELECT alias, file_key, node_id, project, tags_json, description, created_at, updated_at
      FROM aliases
      WHERE alias = ?
      LIMIT 1
    `).get(data.alias) as AliasRow | undefined;

    return row ? mapAliasRow(row) : null;
  }

  public getByAliasOrThrow(alias: string): AliasRecord {
    const record = this.getByAlias(alias);
    if (!record) {
      throw new AppError(`Alias not found: ${alias}`, 404, 'ALIAS_NOT_FOUND');
    }

    return record;
  }

  public resolve(input: z.infer<typeof resolveAliasSchema>): AliasRecord {
    const data = resolveAliasSchema.parse(input);
    return this.getByAliasOrThrow(data.alias);
  }

  public search(input: z.infer<typeof searchAliasesSchema>): AliasRecord[] {
    const data = searchAliasesSchema.parse(input);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (data.query) {
      clauses.push('(alias LIKE ? OR project LIKE ? OR COALESCE(description, \'\') LIKE ?)');
      const pattern = `%${data.query}%`;
      params.push(pattern, pattern, pattern);
    }

    if (data.project) {
      clauses.push('project = ?');
      params.push(data.project);
    }

    for (const tag of data.tags) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)");
      params.push(tag);
    }

    params.push(data.limit);

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT alias, file_key, node_id, project, tags_json, description, created_at, updated_at
      FROM aliases
      ${where}
      ORDER BY alias ASC
      LIMIT ?
    `).all(...(params as any[])) as AliasRow[];

    return rows.map(mapAliasRow);
  }
}

export const createAliasService = (
  aliasRegistry: AliasRegistry,
  figmaGatewayService: FigmaGatewayService
) => ({
  upsertAlias: (input: z.infer<typeof aliasSchema>) => aliasRegistry.upsert(input),
  listAliases: (input?: z.input<typeof listAliasesSchema>) => aliasRegistry.list(input),
  getAlias: (input: z.infer<typeof resolveAliasSchema>) => aliasRegistry.resolve(input),
  resolveAlias: (input: z.infer<typeof resolveAliasSchema>) => aliasRegistry.resolve(input),
  searchAliases: (input: z.infer<typeof searchAliasesSchema>) => aliasRegistry.search(input),
  getDesignBlock: async (input: z.infer<typeof resolveAliasSchema>) => {
    const resolved = aliasRegistry.resolve(input);
    const node = await figmaGatewayService.getNode({
      fileKey: resolved.fileKey,
      nodeId: resolved.nodeId
    });

    return {
      alias: resolved,
      node
    };
  }
});

export type AliasService = ReturnType<typeof createAliasService>;
