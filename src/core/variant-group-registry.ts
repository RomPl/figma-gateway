import { z } from 'zod';

import type { UiMappingService, UiMappingRecord } from './ui-mapping-registry';
import { extractVariantGroupSearchValues } from './variant-group-preview';

export const listVariantGroupsSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  fileKey: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const searchVariantGroupsSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  fileKey: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type VariantGroupRecord = {
  variantGroupId: string;
  project: string;
  rootUiId: string;
  breakpoints: string[];
  variantUiIdsByBreakpoint: Record<string, string>;
  aliases: string[];
  uiIds: string[];
  mappingMode: 'deferred';
};

const normalize = (value: string): string => value.toLowerCase().trim();
const inferBreakpoint = (values: string[]): string | undefined => {
  for (const value of values) {
    if (value.startsWith('breakpoint:')) return value.slice('breakpoint:'.length);
  }
  return undefined;
};

const extractVariantMeta = (record: UiMappingRecord): { variantGroupId?: string; originalUiId?: string; variantUiId?: string; breakpoint?: string; aliases: string[] } => {
  const codeMeta = record.code.snapshot && typeof record.code.snapshot === 'object' ? (record.code.snapshot as Record<string, unknown>).meta : undefined;
  const figmaMeta = record.figma.snapshot && typeof record.figma.snapshot === 'object' ? (record.figma.snapshot as Record<string, unknown>).meta : undefined;
  const values = Array.from(new Set([...extractVariantGroupSearchValues(codeMeta), ...extractVariantGroupSearchValues(figmaMeta)]));
  const variantGroupId = values.find((item) => item === record.uiId || !item.startsWith('breakpoint:') && !item.includes('--'));
  const variantUiId = values.find((item) => item.includes('--'));
  const breakpoint = inferBreakpoint(values);
  const originalUiId = values.find((item) => !item.startsWith('breakpoint:') && item === record.uiId) ?? record.uiId;
  return { variantGroupId, originalUiId, variantUiId, breakpoint, aliases: values };
};

const buildVariantGroups = (records: UiMappingRecord[]): VariantGroupRecord[] => {
  const groups = new Map<string, VariantGroupRecord>();
  for (const record of records) {
    const meta = extractVariantMeta(record);
    if (!meta.variantGroupId && !meta.variantUiId) continue;
    const key = meta.variantGroupId ?? meta.originalUiId ?? record.uiId;
    const existing = groups.get(key) ?? {
      variantGroupId: key,
      project: record.project,
      rootUiId: meta.originalUiId ?? record.uiId,
      breakpoints: [],
      variantUiIdsByBreakpoint: {},
      aliases: [],
      uiIds: [],
      mappingMode: 'deferred' as const
    };
    if (meta.breakpoint && meta.variantUiId) existing.variantUiIdsByBreakpoint[meta.breakpoint] = meta.variantUiId;
    if (meta.breakpoint && !existing.breakpoints.includes(meta.breakpoint)) existing.breakpoints.push(meta.breakpoint);
    if (!existing.uiIds.includes(record.uiId)) existing.uiIds.push(record.uiId);
    existing.aliases = Array.from(new Set([...existing.aliases, ...meta.aliases, record.uiId]));
    groups.set(key, existing);
  }
  return Array.from(groups.values()).map((item) => ({ ...item, breakpoints: item.breakpoints.sort() }));
};

const scoreVariantGroup = (query: string | undefined, record: VariantGroupRecord): number => {
  if (!query) return 0;
  const q = normalize(query);
  const values = [record.variantGroupId, record.rootUiId, ...record.breakpoints, ...Object.values(record.variantUiIdsByBreakpoint), ...record.aliases, ...record.uiIds].map(normalize);
  let score = 0;
  for (const value of values) {
    if (value === q) score = Math.max(score, 100);
    else if (value.includes(q) || q.includes(value)) score = Math.max(score, 70);
  }
  return score;
};

export class VariantGroupRegistry {
  constructor(private readonly uiMappingService: UiMappingService) {}

  public list(input?: z.input<typeof listVariantGroupsSchema>): VariantGroupRecord[] {
    const data = listVariantGroupsSchema.parse(input ?? {});
    const records = this.uiMappingService.listUiMappings({ project: data.project, fileKey: data.fileKey, limit: Math.min(100, Math.max(data.limit * 5, data.limit)) });
    return buildVariantGroups(records).slice(0, data.limit);
  }

  public search(input?: z.input<typeof searchVariantGroupsSchema>): VariantGroupRecord[] {
    const data = searchVariantGroupsSchema.parse(input ?? {});
    const records = this.uiMappingService.searchUiMappings({ query: data.query, project: data.project, fileKey: data.fileKey, limit: Math.min(100, Math.max(data.limit * 5, data.limit)) });
    return buildVariantGroups(records)
      .map((record) => ({ record, score: scoreVariantGroup(data.query, record) }))
      .sort((a, b) => b.score - a.score || a.record.variantGroupId.localeCompare(b.record.variantGroupId))
      .slice(0, data.limit)
      .map((item) => item.record);
  }
}
