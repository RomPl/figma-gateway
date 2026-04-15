import { z } from 'zod';

import { AppError } from './errors';
import type { SqliteDatabase } from '../db/sqlite';

export const designTokenTypeSchema = z.enum(['colors', 'spacing', 'typography', 'radius', 'shadows', 'breakpoints']);

const tokenNamePattern = /^(color|space|radius|text|shadow|breakpoint)\.[a-z0-9._-]+$/i;

const designTokenSchemaBase = z.object({
  token: z.string().trim().min(1).max(200).regex(tokenNamePattern),
  type: designTokenTypeSchema,
  project: z.string().trim().min(1).max(128),
  description: z.string().trim().max(500).optional().transform((value) => value || undefined),
  value: z.object({
    raw: z.string().trim().min(1).max(500),
    numeric: z.number().finite().optional(),
    unit: z.string().trim().min(1).max(50).optional(),
    cssVar: z.string().trim().min(1).max(200).optional(),
    tailwind: z.string().trim().min(1).max(200).optional(),
    meta: z.record(z.string(), z.unknown()).optional()
  }),
  code: z.object({
    file: z.string().trim().min(1).max(500).optional(),
    exportName: z.string().trim().min(1).max(200).optional(),
    selector: z.string().trim().min(1).max(500).optional(),
    className: z.string().trim().min(1).max(200).optional(),
    stylePath: z.string().trim().min(1).max(300).optional(),
    cssVar: z.string().trim().min(1).max(200).optional(),
    tokenSource: z.string().trim().min(1).max(200).optional()
  }).default({}),
  figma: z.object({
    fileKey: z.string().trim().min(1).optional(),
    collectionId: z.string().trim().min(1).optional(),
    variableId: z.string().trim().min(1).optional(),
    styleId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    mode: z.string().trim().min(1).max(100).optional()
  }).default({}),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([])
});

export const designTokenSchema = designTokenSchemaBase;
export const resolveDesignTokenSchema = z.object({ token: z.string().trim().min(1).max(200) });
export const listDesignTokensSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  type: designTokenTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export const searchDesignTokensSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  type: designTokenTypeSchema.optional(),
  raw: z.string().trim().min(1).max(500).optional(),
  className: z.string().trim().min(1).max(200).optional(),
  cssVar: z.string().trim().min(1).max(200).optional(),
  variableId: z.string().trim().min(1).optional(),
  styleId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type DesignTokenRecord = z.infer<typeof designTokenSchema> & {
  createdAt: string;
  updatedAt: string;
};

type DesignTokenRow = {
  token: string;
  type: z.infer<typeof designTokenTypeSchema>;
  project: string;
  description: string | null;
  raw_value: string;
  numeric_value: number | null;
  unit_value: string | null;
  code_file: string | null;
  code_export_name: string | null;
  code_selector: string | null;
  code_class_name: string | null;
  code_style_path: string | null;
  code_css_var: string | null;
  code_token_source: string | null;
  figma_file_key: string | null;
  figma_collection_id: string | null;
  figma_variable_id: string | null;
  figma_style_id: string | null;
  figma_name: string | null;
  figma_mode: string | null;
  css_var_value: string | null;
  tailwind_value: string | null;
  value_meta_json: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: DesignTokenRow): DesignTokenRecord => ({
  token: row.token,
  type: row.type,
  project: row.project,
  description: row.description ?? undefined,
  value: {
    raw: row.raw_value,
    numeric: row.numeric_value ?? undefined,
    unit: row.unit_value ?? undefined,
    cssVar: row.css_var_value ?? undefined,
    tailwind: row.tailwind_value ?? undefined,
    meta: JSON.parse(row.value_meta_json) as Record<string, unknown>
  },
  code: {
    file: row.code_file ?? undefined,
    exportName: row.code_export_name ?? undefined,
    selector: row.code_selector ?? undefined,
    className: row.code_class_name ?? undefined,
    stylePath: row.code_style_path ?? undefined,
    cssVar: row.code_css_var ?? undefined,
    tokenSource: row.code_token_source ?? undefined
  },
  figma: {
    fileKey: row.figma_file_key ?? undefined,
    collectionId: row.figma_collection_id ?? undefined,
    variableId: row.figma_variable_id ?? undefined,
    styleId: row.figma_style_id ?? undefined,
    name: row.figma_name ?? undefined,
    mode: row.figma_mode ?? undefined
  },
  tags: JSON.parse(row.tags_json) as string[],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class DesignTokenRegistry {
  constructor(private readonly db: SqliteDatabase) {}

  public upsert(input: z.infer<typeof designTokenSchema>): DesignTokenRecord {
    const data = designTokenSchema.parse(input);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO design_tokens (
        token, type, project, description,
        raw_value, numeric_value, unit_value, css_var_value, tailwind_value, value_meta_json,
        code_file, code_export_name, code_selector, code_class_name, code_style_path, code_css_var, code_token_source,
        figma_file_key, figma_collection_id, figma_variable_id, figma_style_id, figma_name, figma_mode,
        tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        type = excluded.type,
        project = excluded.project,
        description = excluded.description,
        raw_value = excluded.raw_value,
        numeric_value = excluded.numeric_value,
        unit_value = excluded.unit_value,
        css_var_value = excluded.css_var_value,
        tailwind_value = excluded.tailwind_value,
        value_meta_json = excluded.value_meta_json,
        code_file = excluded.code_file,
        code_export_name = excluded.code_export_name,
        code_selector = excluded.code_selector,
        code_class_name = excluded.code_class_name,
        code_style_path = excluded.code_style_path,
        code_css_var = excluded.code_css_var,
        code_token_source = excluded.code_token_source,
        figma_file_key = excluded.figma_file_key,
        figma_collection_id = excluded.figma_collection_id,
        figma_variable_id = excluded.figma_variable_id,
        figma_style_id = excluded.figma_style_id,
        figma_name = excluded.figma_name,
        figma_mode = excluded.figma_mode,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at
    `).run(
      data.token,
      data.type,
      data.project,
      data.description ?? null,
      data.value.raw,
      data.value.numeric ?? null,
      data.value.unit ?? null,
      data.value.cssVar ?? null,
      data.value.tailwind ?? null,
      JSON.stringify(data.value.meta ?? {}),
      data.code.file ?? null,
      data.code.exportName ?? null,
      data.code.selector ?? null,
      data.code.className ?? null,
      data.code.stylePath ?? null,
      data.code.cssVar ?? null,
      data.code.tokenSource ?? null,
      data.figma.fileKey ?? null,
      data.figma.collectionId ?? null,
      data.figma.variableId ?? null,
      data.figma.styleId ?? null,
      data.figma.name ?? null,
      data.figma.mode ?? null,
      JSON.stringify(data.tags),
      now,
      now
    );
    return this.getByTokenOrThrow(data.token);
  }

  public getByToken(token: string): DesignTokenRecord | null {
    const data = resolveDesignTokenSchema.parse({ token });
    const row = this.db.prepare(`
      SELECT token, type, project, description, raw_value, numeric_value, unit_value, css_var_value, tailwind_value, value_meta_json,
             code_file, code_export_name, code_selector, code_class_name, code_style_path, code_css_var, code_token_source,
             figma_file_key, figma_collection_id, figma_variable_id, figma_style_id, figma_name, figma_mode,
             tags_json, created_at, updated_at
      FROM design_tokens WHERE token = ? LIMIT 1
    `).get(data.token) as DesignTokenRow | undefined;
    return row ? mapRow(row) : null;
  }

  public getByTokenOrThrow(token: string): DesignTokenRecord {
    const record = this.getByToken(token);
    if (!record) throw new AppError(`Design token not found: ${token}`, 404, 'DESIGN_TOKEN_NOT_FOUND');
    return record;
  }

  public list(input?: z.input<typeof listDesignTokensSchema>): DesignTokenRecord[] {
    const data = listDesignTokensSchema.parse(input ?? {});
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (data.project) { clauses.push('project = ?'); params.push(data.project); }
    if (data.type) { clauses.push('type = ?'); params.push(data.type); }
    params.push(data.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT token, type, project, description, raw_value, numeric_value, unit_value, css_var_value, tailwind_value, value_meta_json,
             code_file, code_export_name, code_selector, code_class_name, code_style_path, code_css_var, code_token_source,
             figma_file_key, figma_collection_id, figma_variable_id, figma_style_id, figma_name, figma_mode,
             tags_json, created_at, updated_at
      FROM design_tokens ${where}
      ORDER BY token ASC LIMIT ?
    `).all(...(params as any[])) as DesignTokenRow[];
    return rows.map(mapRow);
  }

  public search(input: z.input<typeof searchDesignTokensSchema>): DesignTokenRecord[] {
    const data = searchDesignTokensSchema.parse(input);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (data.query) {
      clauses.push('(token LIKE ? OR raw_value LIKE ? OR COALESCE(code_class_name, \'\') LIKE ? OR COALESCE(css_var_value, \'\') LIKE ? OR COALESCE(figma_name, \'\') LIKE ?)');
      const pattern = `%${data.query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (data.project) { clauses.push('project = ?'); params.push(data.project); }
    if (data.type) { clauses.push('type = ?'); params.push(data.type); }
    if (data.raw) { clauses.push('raw_value = ?'); params.push(data.raw); }
    if (data.className) { clauses.push('code_class_name = ?'); params.push(data.className); }
    if (data.cssVar) { clauses.push('(css_var_value = ? OR code_css_var = ?)'); params.push(data.cssVar, data.cssVar); }
    if (data.variableId) { clauses.push('figma_variable_id = ?'); params.push(data.variableId); }
    if (data.styleId) { clauses.push('figma_style_id = ?'); params.push(data.styleId); }
    params.push(data.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT token, type, project, description, raw_value, numeric_value, unit_value, css_var_value, tailwind_value, value_meta_json,
             code_file, code_export_name, code_selector, code_class_name, code_style_path, code_css_var, code_token_source,
             figma_file_key, figma_collection_id, figma_variable_id, figma_style_id, figma_name, figma_mode,
             tags_json, created_at, updated_at
      FROM design_tokens ${where}
      ORDER BY token ASC LIMIT ?
    `).all(...(params as any[])) as DesignTokenRow[];
    return rows.map(mapRow);
  }
}

export const createDesignTokenService = (designTokenRegistry: DesignTokenRegistry) => ({
  upsertDesignToken: (input: z.infer<typeof designTokenSchema>) => designTokenRegistry.upsert(input),
  listDesignTokens: (input?: z.input<typeof listDesignTokensSchema>) => designTokenRegistry.list(input),
  getDesignToken: (input: z.infer<typeof resolveDesignTokenSchema>) => designTokenRegistry.getByTokenOrThrow(input.token),
  resolveDesignToken: (input: z.infer<typeof resolveDesignTokenSchema>) => designTokenRegistry.getByTokenOrThrow(input.token),
  searchDesignTokens: (input: z.input<typeof searchDesignTokensSchema>) => designTokenRegistry.search(input),
  resolveCodeTokenHint: (input: { project?: string; raw?: string; className?: string; cssVar?: string; type?: z.infer<typeof designTokenTypeSchema> }) => {
    const results = designTokenRegistry.search({
      project: input.project,
      type: input.type,
      raw: input.raw,
      className: input.className,
      cssVar: input.cssVar,
      limit: 1
    });
    return results[0] ?? null;
  },
  resolveFigmaTokenHint: (input: { project?: string; variableId?: string; styleId?: string; raw?: string; type?: z.infer<typeof designTokenTypeSchema> }) => {
    const results = designTokenRegistry.search({
      project: input.project,
      type: input.type,
      variableId: input.variableId,
      styleId: input.styleId,
      raw: input.raw,
      limit: 1
    });
    return results[0] ?? null;
  }
});

export type DesignTokenService = ReturnType<typeof createDesignTokenService>;
