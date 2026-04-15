import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { UiMappingRecord } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';

export const syncModeSchema = z.enum(['code_to_figma', 'figma_to_code', 'reconcile']);

export type SyncMode = z.infer<typeof syncModeSchema>;
export type UiFieldName = 'text' | 'style' | 'layout' | 'order' | 'structure' | 'visibility';
export type UiFieldChange = {
  field: UiFieldName;
  codeChanged: boolean;
  figmaChanged: boolean;
  conflict: boolean;
};

export type UiConflict = {
  uiId: string;
  fields: UiFieldName[];
  reason: string;
};

export type UiMergeAction = {
  uiId: string;
  target: 'code' | 'figma' | 'conflict';
  fields: UiFieldName[];
  reason: string;
};

export type UiReconcilePlan = {
  mode: SyncMode;
  changes: Array<{
    uiId: string;
    fieldChanges: UiFieldChange[];
  }>;
  mergePlan: UiMergeAction[];
  conflicts: UiConflict[];
};

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

export const toUiMap = (document: UiModelDocument): Map<string, UiNode> => {
  const map = new Map<string, UiNode>();
  walk(document.root, (node) => map.set(node.uiId, node));
  return map;
};

const hashValue = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const childOrder = (node: UiNode | undefined): string[] => (node?.children ?? []).map((child) => child.uiId);

const getSnapshotNode = (mapping: UiMappingRecord): UiNode | null => {
  const codeSnapshot = mapping.code.snapshot as unknown;
  const figmaSnapshot = mapping.figma.snapshot as unknown;
  if (codeSnapshot && typeof codeSnapshot === 'object' && 'uiId' in (codeSnapshot as Record<string, unknown>)) return codeSnapshot as UiNode;
  if (figmaSnapshot && typeof figmaSnapshot === 'object' && 'uiId' in (figmaSnapshot as Record<string, unknown>)) return figmaSnapshot as UiNode;
  return null;
};

const getFieldHashes = (node: UiNode | undefined | null) => ({
  text: hashValue(node?.text ?? ''),
  style: hashValue(node?.style ?? {}),
  layout: hashValue({ layout: node?.layout ?? {}, spacing: node?.spacing, padding: node?.padding ?? {} }),
  order: hashValue(childOrder(node ?? undefined)),
  structure: hashValue((node?.children ?? []).map((child) => child.uiId)),
  visibility: hashValue(node?.visible ?? true)
});

const determineFieldChanges = (uiId: string, codeNode: UiNode | null, figmaNode: UiNode | null, baseNode: UiNode | null): UiFieldChange[] => {
  const codeHashes = getFieldHashes(codeNode);
  const figmaHashes = getFieldHashes(figmaNode);
  const baseHashes = getFieldHashes(baseNode);
  const fields: UiFieldName[] = ['text', 'style', 'layout', 'order', 'structure', 'visibility'];
  return fields.map((field) => {
    const codeChanged = codeHashes[field] !== baseHashes[field];
    const figmaChanged = figmaHashes[field] !== baseHashes[field];
    return {
      field,
      codeChanged,
      figmaChanged,
      conflict: codeChanged && figmaChanged && codeHashes[field] !== figmaHashes[field]
    };
  }).filter((item) => item.codeChanged || item.figmaChanged);
};

const buildModeAction = (mode: SyncMode, uiId: string, fieldChanges: UiFieldChange[]): UiMergeAction[] => {
  if (!fieldChanges.length) return [];
  if (mode === 'code_to_figma') {
    return [{ uiId, target: 'figma', fields: fieldChanges.map((item) => item.field), reason: 'Code is authoritative in code_to_figma mode.' }];
  }
  if (mode === 'figma_to_code') {
    return [{ uiId, target: 'code', fields: fieldChanges.map((item) => item.field), reason: 'Figma is authoritative in figma_to_code mode.' }];
  }
  const conflicts = fieldChanges.filter((item) => item.conflict).map((item) => item.field);
  const safeCode = fieldChanges.filter((item) => item.figmaChanged && !item.codeChanged).map((item) => item.field);
  const safeFigma = fieldChanges.filter((item) => item.codeChanged && !item.figmaChanged).map((item) => item.field);
  const actions: UiMergeAction[] = [];
  if (safeCode.length) actions.push({ uiId, target: 'code', fields: safeCode, reason: 'Changed only in Figma since last sync.' });
  if (safeFigma.length) actions.push({ uiId, target: 'figma', fields: safeFigma, reason: 'Changed only in code since last sync.' });
  if (conflicts.length) actions.push({ uiId, target: 'conflict', fields: conflicts, reason: 'Both sides changed the same field differently since last sync.' });
  return actions;
};

export const buildUiReconcilePlan = (
  mode: SyncMode,
  codeDocument: UiModelDocument,
  figmaDocument: UiModelDocument,
  mappings: UiMappingRecord[],
  uiIds?: string[]
): UiReconcilePlan => {
  const codeMap = toUiMap(codeDocument);
  const figmaMap = toUiMap(figmaDocument);
  const targets = uiIds?.length ? uiIds : mappings.map((mapping) => mapping.uiId);
  const changes: UiReconcilePlan['changes'] = [];
  const mergePlan: UiMergeAction[] = [];
  const conflicts: UiConflict[] = [];

  for (const uiId of targets) {
    const mapping = mappings.find((item) => item.uiId === uiId);
    const baseNode = mapping ? getSnapshotNode(mapping) : null;
    const codeNode = codeMap.get(uiId) ?? null;
    const figmaNode = figmaMap.get(uiId) ?? null;
    const fieldChanges = determineFieldChanges(uiId, codeNode, figmaNode, baseNode);
    if (!fieldChanges.length) continue;
    changes.push({ uiId, fieldChanges });
    const actions = buildModeAction(mode, uiId, fieldChanges);
    mergePlan.push(...actions);
    const conflictFields = actions.filter((item) => item.target === 'conflict').flatMap((item) => item.fields);
    if (conflictFields.length) {
      conflicts.push({
        uiId,
        fields: conflictFields,
        reason: `Conflicting fields for ${uiId}: ${conflictFields.join(', ')}`
      });
    }
  }

  return {
    mode,
    changes,
    mergePlan,
    conflicts
  };
};
