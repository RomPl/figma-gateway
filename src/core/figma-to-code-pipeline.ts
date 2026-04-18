import { createHash } from 'node:crypto';
import { z } from 'zod';

import { patchCodeFile, type CodePatchResult } from './code-patcher';
import { AppError } from './errors';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import { extractRenderedUiSchema } from './rendered-ui-extractor';
import type { RenderedToCodeMapperService } from './rendered-to-code-mapper';
import type { UiMappingService, UiMappingRecord } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';
import { attachPlanningContext, createPlanningContextFromNode } from './planning-context';
import { attachBlockIdentity } from './block-identity';
import { annotateVisualConfidence } from './visual-confidence';

export const figmaToCodePipelineSchema = z.object({
  project: z.string().trim().min(1).max(128),
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1).optional(),
  rootDir: z.string().trim().min(1).optional(),
  uiIds: z.array(z.string().trim().min(1)).max(200).optional(),
  render: extractRenderedUiSchema.optional(),
  apply: z.coerce.boolean().default(false)
});

export type UiDiffKind = 'text' | 'style' | 'layout' | 'order' | 'structure' | 'visibility' | 'asset' | 'icon';
export type UiDiffEntry = {
  needsReview?: boolean;
  uiId: string;
  filePath: string;
  kinds: UiDiffKind[];
  summary: string;
  visualSource: 'rendered' | 'code_fallback';
  patchable: boolean;
  confidence: number;
};

export type FigmaToCodePipelineResult = {
  needsReview: Array<{ uiId: string; visual: number; reasons: string[] }>;
  figma: UiModelDocument;
  rendered?: UiModelDocument;
  codeComponentCount: number;
  diffs: UiDiffEntry[];
  patches: Array<Pick<CodePatchResult, 'filePath' | 'uiId' | 'applied' | 'changed'>>;
  notes: string[];
};

const hashNode = (node: UiNode): string => createHash('sha256').update(JSON.stringify(node)).digest('hex');
const walk = (node: UiNode, fn: (node: UiNode) => void): void => { fn(node); node.children.forEach((child) => walk(child, fn)); };
const byUiId = (document: UiModelDocument): Map<string, UiNode> => { const map = new Map<string, UiNode>(); walk(document.root, (node) => map.set(node.uiId, node)); return map; };
const getMappingsForFile = (uiMappingService: UiMappingService, project: string, fileKey: string): UiMappingRecord[] => uiMappingService.listUiMappings({ project, fileKey, limit: 100 });

const overlayMappedUiIds = (document: UiModelDocument, mappings: UiMappingRecord[]): UiModelDocument => {
  const byNode = new Map(mappings.map((mapping) => [`${mapping.figma.fileKey}:${mapping.figma.nodeId}`, mapping.uiId]));
  walk(document.root, (node) => {
    const fileKey = node.source?.fileKey; const nodeId = node.source?.nodeId;
    if (!fileKey || !nodeId) return;
    const mapped = byNode.get(`${fileKey}:${nodeId}`);
    if (mapped) node.uiId = mapped;
  });
  return document;
};

const visualStyleHash = (node: UiNode | null | undefined): string => createHash('sha256').update(JSON.stringify({
  declarativeStyle: node?.declarativeStyle ?? node?.style ?? {},
  computedStyle: node?.computedStyle ?? {},
  semanticTokens: node?.semanticTokens ?? node?.tokens ?? {},
  asset: node?.asset ?? {},
  icon: node?.icon ?? {}
})).digest('hex');

const visualLayoutHash = (node: UiNode | null | undefined): string => createHash('sha256').update(JSON.stringify({
  layout: node?.layout ?? {},
  spacing: node?.spacing,
  padding: node?.padding ?? {},
  boundingBox: node?.boundingBox ?? {},
  size: node?.size ?? {},
  position: node?.position ?? {},
  responsive: node?.responsive ?? {}
})).digest('hex');

const childOrder = (node: UiNode | undefined | null): string[] => (node?.children ?? []).map((child) => child.uiId);

const diffNodes = (figmaNode: UiNode, renderedNode: UiNode): { kinds: UiDiffKind[]; assetChangeType?: 'asset_ref_change' | 'layout_around_asset_change' } => {
  const diffs = new Set<UiDiffKind>();
  if ((figmaNode.text ?? '') !== (renderedNode.text ?? '')) diffs.add('text');
  if (visualStyleHash(figmaNode) !== visualStyleHash(renderedNode)) diffs.add('style');
  if (visualLayoutHash(figmaNode) !== visualLayoutHash(renderedNode)) diffs.add('layout');
  if (JSON.stringify(childOrder(figmaNode)) !== JSON.stringify(childOrder(renderedNode))) diffs.add('order');
  if (figmaNode.children.length !== renderedNode.children.length || childOrder(figmaNode).some((uiId) => !childOrder(renderedNode).includes(uiId)) || childOrder(renderedNode).some((uiId) => !childOrder(figmaNode).includes(uiId))) diffs.add('structure');
  if ((figmaNode.visible ?? true) !== (renderedNode.state?.visible ?? renderedNode.visible ?? true)) diffs.add('visibility');
  let assetChangeType: 'asset_ref_change' | 'layout_around_asset_change' | undefined;
  if (JSON.stringify(figmaNode.asset ?? {}) !== JSON.stringify(renderedNode.asset ?? {})) {
    diffs.add('asset');
    const figmaAssetRef = JSON.stringify({ sourceUrl: figmaNode.asset?.sourceUrl, resolvedAssetPath: figmaNode.asset?.resolvedAssetPath, hash: figmaNode.asset?.hash, assetId: figmaNode.asset?.assetId });
    const renderedAssetRef = JSON.stringify({ sourceUrl: renderedNode.asset?.sourceUrl, resolvedAssetPath: renderedNode.asset?.resolvedAssetPath, hash: renderedNode.asset?.hash, assetId: renderedNode.asset?.assetId });
    assetChangeType = figmaAssetRef !== renderedAssetRef ? 'asset_ref_change' : 'layout_around_asset_change';
  }
  if (JSON.stringify(figmaNode.icon ?? {}) !== JSON.stringify(renderedNode.icon ?? {})) diffs.add('icon');
  return { kinds: Array.from(diffs), assetChangeType };
};

const getCodeMapping = (node: UiNode | null): { filePath?: string; confidence: number; stable: boolean; jsxPath?: string; lineStart?: number; lineEnd?: number } => {
  const meta = node?.meta && typeof node.meta.codeMapping === 'object' ? node.meta.codeMapping as Record<string, unknown> : undefined;
  return {
    filePath: (meta?.filePath as string | undefined) ?? node?.source?.codePath,
    confidence: typeof meta?.confidence === 'number' ? meta.confidence : node?.source?.codePath ? 0.6 : 0,
    stable: typeof meta?.stable === 'boolean' ? meta.stable : false,
    jsxPath: (meta?.jsxPath as string | undefined) ?? node?.source?.jsxPath,
    lineStart: typeof (meta?.sourceRange as any)?.lineStart === 'number' ? (meta?.sourceRange as any).lineStart : node?.source?.lineStart,
    lineEnd: typeof (meta?.sourceRange as any)?.lineEnd === 'number' ? (meta?.sourceRange as any).lineEnd : node?.source?.lineEnd
  };
};

const isSafeSourceMapping = (node: UiNode | null, mapping: UiMappingRecord | undefined): boolean => {
  const codeMapping = getCodeMapping(node);
  return Boolean(codeMapping.filePath && codeMapping.stable && codeMapping.confidence >= 0.85 && (codeMapping.jsxPath || (codeMapping.lineStart && codeMapping.lineEnd) || mapping?.code.selector));
};

const withCodeSource = (targetNode: UiNode, renderedNode: UiNode | null, mapping: UiMappingRecord | undefined): UiNode => ({
  ...targetNode,
  source: {
    ...(targetNode.source ?? {}),
    codePath: renderedNode?.source?.codePath ?? mapping?.code.file,
    codeExportName: renderedNode?.source?.codeExportName ?? mapping?.code.component,
    codeSelector: renderedNode?.source?.codeSelector ?? mapping?.code.selector,
    jsxPath: renderedNode?.source?.jsxPath ?? mapping?.code.jsxPath,
    lineStart: renderedNode?.source?.lineStart ?? mapping?.code.sourceRange?.lineStart,
    lineEnd: renderedNode?.source?.lineEnd ?? mapping?.code.sourceRange?.lineEnd
  },
  meta: {
    ...(targetNode.meta ?? {}),
    codeMapping: renderedNode?.meta?.codeMapping ?? {
      filePath: mapping?.code.file,
      componentName: mapping?.code.component,
      jsxPath: mapping?.code.jsxPath,
      confidence: mapping?.code.selector ? 0.9 : 0.5,
      stable: Boolean(mapping?.code.selector || mapping?.code.jsxPath),
      matchType: mapping?.code.selector || mapping?.code.jsxPath ? 'exact_ui_id' : 'heuristic_fallback',
      reasons: ['mapping registry source mapping']
    }
  }
});

export class FigmaToCodePipelineService {
  constructor(
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly renderedToCodeMapperService: RenderedToCodeMapperService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public async run(input: z.input<typeof figmaToCodePipelineSchema>): Promise<FigmaToCodePipelineResult> {
    const data = figmaToCodePipelineSchema.parse(input);
    const mappings = getMappingsForFile(this.uiMappingService, data.project, data.fileKey);
    const figmaDocument = attachBlockIdentity(overlayMappedUiIds(await this.figmaUiExtractorService.extract({ fileKey: data.fileKey, project: data.project, nodeId: data.nodeId }), mappings));
    const renderedResult = data.render ? await this.renderedToCodeMapperService.map({ project: data.project, rootDir: data.rootDir, render: data.render as unknown as Record<string, unknown> }) : null;
    const renderedDocument = renderedResult?.rendered;
    attachBlockIdentity(annotateVisualConfidence(figmaDocument));
    if (renderedDocument) attachPlanningContext(annotateVisualConfidence(renderedDocument));
    const figmaMap = byUiId(figmaDocument);
    const renderedMap = renderedDocument ? byUiId(renderedDocument) : new Map<string, UiNode>();
    const selectedUiIds = data.uiIds?.length ? data.uiIds : mappings.map((mapping) => mapping.uiId);
    const diffs: UiDiffEntry[] = [];
    const patches: Array<Pick<CodePatchResult, 'filePath' | 'uiId' | 'applied' | 'changed'>> = [];

    for (const uiId of selectedUiIds) {
      const mapping = mappings.find((item) => item.uiId === uiId);
      if (!mapping) continue;
      const figmaNode = figmaMap.get(uiId);
      const renderedNode = renderedMap.get(uiId) ?? null;
      const visualNode = renderedNode ?? null;
      if (!figmaNode || !visualNode) continue;
      const diff = diffNodes(figmaNode, visualNode);
      const kinds = diff.kinds;
      if (!kinds.length) continue;
      const safePatch = isSafeSourceMapping(renderedNode, mapping) && (renderedNode?.confidence?.visual ?? 0) >= 0.5 && !Boolean((renderedNode?.meta as any)?.guardrails?.dynamicStatefulBlock);
      const codeMapping = getCodeMapping(renderedNode);
      diffs.push({
        uiId,
        filePath: codeMapping.filePath ?? mapping.code.file,
        kinds,
        summary: `Sync ${uiId}: ${kinds.join(', ')}${diff.assetChangeType ? ` [${diff.assetChangeType}]` : ''}`,
        visualSource: renderedNode ? 'rendered' : 'code_fallback',
        patchable: safePatch,
        confidence: renderedNode?.confidence?.visual ?? codeMapping.confidence,
        needsReview: Boolean(renderedNode?.confidence?.needsReview)
      });
      if (!safePatch) continue;
      const patchTarget = withCodeSource({ ...figmaNode, asset: diff.assetChangeType ? { ...(figmaNode.asset ?? {}), changeType: diff.assetChangeType } : figmaNode.asset }, renderedNode, mapping);
      const patch = patchCodeFile({ rootDir: data.rootDir ?? process.cwd(), filePath: codeMapping.filePath ?? mapping.code.file, uiId, node: patchTarget, apply: data.apply });
      patches.push({ filePath: patch.filePath, uiId: patch.uiId, applied: patch.applied, changed: patch.changed });
      if (data.apply && patch.changed) {
        this.uiMappingService.upsertUiMapping({
          uiId: mapping.uiId,
          project: mapping.project,
          semanticRole: mapping.semanticRole,
          code: { ...mapping.code, snapshotHash: hashNode(patchTarget), snapshot: patchTarget as unknown as Record<string, unknown> },
          figma: { ...mapping.figma, snapshotHash: hashNode(figmaNode), snapshot: figmaNode as unknown as Record<string, unknown> },
          sync: { lastDirection: 'figma_to_code', lastSyncedAt: new Date().toISOString(), lastCodeHash: hashNode(patchTarget), lastFigmaHash: hashNode(figmaNode) }
        });
      }
    }

    if (data.apply && !patches.length) throw new AppError('No safe visual code patches were generated from Figma diff', 404, 'FIGMA_TO_CODE_NO_PATCHES');

    const needsReview = diffs.filter((item) => item.needsReview).map((item) => ({ uiId: item.uiId, visual: item.confidence, reasons: ['needs review'] }));
    return {
      figma: figmaDocument,
      rendered: renderedDocument ?? undefined,
      codeComponentCount: renderedResult?.componentCount ?? 0,
      diffs,
      patches,
      needsReview,
      notes: [
        'Diff compares Figma UI Model against Rendered UI Model for visual truth.',
        'Code AST mapping is used only to locate safe patch targets in code.',
        'Code patcher runs only for nodes with safe source mapping and sufficient confidence.',
        ...(needsReview.length ? ['Low-confidence nodes were marked as needs review and skipped for auto patching.'] : []),
        ...(renderedDocument ? [`Rendered planning context: ${createPlanningContextFromNode(renderedDocument.root).surfaceMode} / ${createPlanningContextFromNode(renderedDocument.root).breakpointFamily}.`] : [])
      ]
    };
  }
}
