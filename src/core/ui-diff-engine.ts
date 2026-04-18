import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { UiMappingRecord } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';
import { createPlanningContextFromNode } from './planning-context';

export const syncModeSchema = z.enum(['code_to_figma', 'figma_to_code', 'reconcile']);
export type SyncMode = z.infer<typeof syncModeSchema>;
export type UiFieldName = 'text' | 'style' | 'layout' | 'order' | 'structure' | 'visibility' | 'asset' | 'icon' | 'tokens';

export type UiFieldChange = {
  field: UiFieldName;
  codeChanged: boolean;
  renderedChanged: boolean;
  figmaChanged: boolean;
  lastSyncedPresent: boolean;
  conflict: boolean;
  conflictType?: 'ast_changed_render_unchanged' | 'render_changed_figma_unchanged' | 'figma_changed_code_changed_differently' | 'rendered_figma_diverged' | 'multi_source_divergence';
};

export type UiConflict = {
  uiId: string;
  fields: UiFieldName[];
  reason: string;
  conflictType: NonNullable<UiFieldChange['conflictType']>;
};

export type UiMergeAction = {
  uiId: string;
  target: 'code' | 'figma' | 'conflict';
  fields: UiFieldName[];
  reason: string;
  priorityBasis?: 'structural_truth_ast' | 'visual_truth_rendered' | 'design_truth_tokens' | 'design_editing_truth_figma';
};

export type UiReconcilePlan = {
  mode: SyncMode;
  changes: Array<{ uiId: string; fieldChanges: UiFieldChange[] }>;
  mergePlan: UiMergeAction[];
  conflicts: UiConflict[];
};

const walk = (node: UiNode, fn: (node: UiNode) => void): void => { fn(node); node.children.forEach((child) => walk(child, fn)); };
export const toUiMap = (document: UiModelDocument): Map<string, UiNode> => { const map = new Map<string, UiNode>(); walk(document.root, (node) => map.set(node.uiId, node)); return map; };
const hashValue = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const childOrder = (node: UiNode | undefined | null): string[] => (node?.children ?? []).map((child) => child.uiId);

const getSnapshotNode = (mapping: UiMappingRecord): UiNode | null => {
  const codeSnapshot = mapping.code.snapshot as unknown;
  const figmaSnapshot = mapping.figma.snapshot as unknown;
  if (codeSnapshot && typeof codeSnapshot === 'object' && 'uiId' in (codeSnapshot as Record<string, unknown>)) return codeSnapshot as UiNode;
  if (figmaSnapshot && typeof figmaSnapshot === 'object' && 'uiId' in (figmaSnapshot as Record<string, unknown>)) return figmaSnapshot as UiNode;
  return null;
};

const getFieldHashes = (node: UiNode | undefined | null) => ({
  text: hashValue(node?.text ?? ''),
  style: hashValue({ declarativeStyle: node?.declarativeStyle ?? node?.style ?? {}, computedStyle: node?.computedStyle ?? {}, boundingBox: node?.boundingBox ?? {}, state: node?.state ?? {} }),
  layout: hashValue({ layout: node?.layout ?? {}, spacing: node?.spacing, padding: node?.padding ?? {}, responsive: node?.responsive ?? {}, boundingBox: node?.boundingBox ?? {} }),
  order: hashValue(childOrder(node)),
  structure: hashValue((node?.children ?? []).map((child) => child.uiId)),
  visibility: hashValue(node?.state?.visible ?? node?.visible ?? true),
  asset: hashValue(node?.asset ?? {}),
  icon: hashValue(node?.icon ?? {}),
  tokens: hashValue(node?.semanticTokens ?? node?.tokens ?? {})
});

const determineConflictType = (field: UiFieldName, codeChanged: boolean, renderedChanged: boolean, figmaChanged: boolean, codeHash: string, renderedHash: string, figmaHash: string): UiFieldChange['conflictType'] | undefined => {
  if (codeChanged && !renderedChanged) return 'ast_changed_render_unchanged';
  if (renderedChanged && !figmaChanged) return 'render_changed_figma_unchanged';
  if (figmaChanged && codeChanged && codeHash !== figmaHash) return 'figma_changed_code_changed_differently';
  if (renderedChanged && figmaChanged && renderedHash !== figmaHash) return 'rendered_figma_diverged';
  if ((codeChanged && renderedChanged) || (codeChanged && figmaChanged) || (renderedChanged && figmaChanged)) return 'multi_source_divergence';
  return undefined;
};

const determineFieldChanges = (codeNode: UiNode | null, renderedNode: UiNode | null, figmaNode: UiNode | null, baseNode: UiNode | null): UiFieldChange[] => {
  const codeHashes = getFieldHashes(codeNode);
  const renderedHashes = getFieldHashes(renderedNode);
  const figmaHashes = getFieldHashes(figmaNode);
  const baseHashes = getFieldHashes(baseNode);
  const fields: UiFieldName[] = ['text', 'style', 'layout', 'order', 'structure', 'visibility', 'asset', 'icon', 'tokens'];
  return fields.map((field) => {
    const codeChanged = codeHashes[field] !== baseHashes[field];
    const renderedChanged = renderedHashes[field] !== baseHashes[field];
    const figmaChanged = figmaHashes[field] !== baseHashes[field];
    const conflictType = determineConflictType(field, codeChanged, renderedChanged, figmaChanged, codeHashes[field], renderedHashes[field], figmaHashes[field]);
    return { field, codeChanged, renderedChanged, figmaChanged, lastSyncedPresent: Boolean(baseNode), conflict: Boolean(conflictType && (codeChanged || renderedChanged || figmaChanged)), conflictType };
  }).filter((item) => item.codeChanged || item.renderedChanged || item.figmaChanged);
};

const buildModeAction = (mode: SyncMode, uiId: string, fieldChanges: UiFieldChange[], renderedRootContext?: ReturnType<typeof createPlanningContextFromNode>): UiMergeAction[] => {
  if (!fieldChanges.length) return [];
  if (mode === 'code_to_figma') return [{ uiId, target: 'figma', fields: fieldChanges.map((item) => item.field), reason: `Code AST structural truth is authoritative in code_to_figma mode${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'structural_truth_ast' }];
  if (mode === 'figma_to_code') return [{ uiId, target: 'code', fields: fieldChanges.map((item) => item.field), reason: `Figma design editing truth is authoritative in figma_to_code mode${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'design_editing_truth_figma' }];

  const actions: UiMergeAction[] = [];
  const conflictFields = fieldChanges.filter((item) => item.conflict).map((item) => item.field);
  const structuralFields = fieldChanges.filter((item) => ['order', 'structure'].includes(item.field) && item.codeChanged && !item.conflict).map((item) => item.field);
  const visualFields = fieldChanges.filter((item) => ['style', 'layout', 'visibility', 'asset', 'icon', 'text'].includes(item.field) && item.renderedChanged && !item.figmaChanged && !item.conflict).map((item) => item.field);
  const tokenFields = fieldChanges.filter((item) => item.field === 'tokens' && (item.renderedChanged || item.codeChanged) && !item.conflict).map((item) => item.field);
  const figmaEditingFields = fieldChanges.filter((item) => item.figmaChanged && !item.renderedChanged && !item.conflict && !structuralFields.includes(item.field) && !tokenFields.includes(item.field)).map((item) => item.field);

  if (structuralFields.length) actions.push({ uiId, target: 'figma', fields: structuralFields, reason: `Structural truth follows AST${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'structural_truth_ast' });
  if (visualFields.length) actions.push({ uiId, target: 'figma', fields: visualFields, reason: `Visual truth follows rendered DOM${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'visual_truth_rendered' });
  if (tokenFields.length) actions.push({ uiId, target: 'figma', fields: tokenFields, reason: `Design truth follows semantic tokens${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'design_truth_tokens' });
  if (figmaEditingFields.length) actions.push({ uiId, target: 'code', fields: figmaEditingFields, reason: `Design editing truth follows Figma where render has not changed${renderedRootContext ? ` within ${renderedRootContext.surfaceMode}/${renderedRootContext.breakpointFamily}` : ''}.`, priorityBasis: 'design_editing_truth_figma' });
  if (conflictFields.length) actions.push({ uiId, target: 'conflict', fields: conflictFields, reason: 'Multiple sources changed differently and require explicit conflict handling.' });
  return actions;
};

export const buildUiReconcilePlan = (mode: SyncMode, codeDocument: UiModelDocument, renderedDocument: UiModelDocument, figmaDocument: UiModelDocument, mappings: UiMappingRecord[], uiIds?: string[]): UiReconcilePlan => {
  const renderedRootContext = createPlanningContextFromNode(renderedDocument.root);
  const codeMap = toUiMap(codeDocument);
  const renderedMap = toUiMap(renderedDocument);
  const figmaMap = toUiMap(figmaDocument);
  const targets = uiIds?.length ? uiIds : mappings.map((mapping) => mapping.uiId);
  const changes: UiReconcilePlan['changes'] = [];
  const mergePlan: UiMergeAction[] = [];
  const conflicts: UiConflict[] = [];

  for (const uiId of targets) {
    const mapping = mappings.find((item) => item.uiId === uiId);
    const baseNode = mapping ? getSnapshotNode(mapping) : null;
    const codeNode = codeMap.get(uiId) ?? null;
    const renderedNode = renderedMap.get(uiId) ?? null;
    const figmaNode = figmaMap.get(uiId) ?? null;
    const fieldChanges = determineFieldChanges(codeNode, renderedNode, figmaNode, baseNode);
    if (!fieldChanges.length) continue;
    changes.push({ uiId, fieldChanges });
    const actions = buildModeAction(mode, uiId, fieldChanges, renderedRootContext);
    mergePlan.push(...actions);
    for (const item of fieldChanges.filter((change) => change.conflict && change.conflictType)) {
      conflicts.push({ uiId, fields: [item.field], reason: `${item.conflictType} for ${uiId} on ${item.field}`, conflictType: item.conflictType! });
    }
  }

  return { mode, changes, mergePlan, conflicts };
};
