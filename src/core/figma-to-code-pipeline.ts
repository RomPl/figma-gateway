import { createHash } from 'node:crypto';
import { z } from 'zod';

import { patchCodeFile, type CodePatchResult } from './code-patcher';
import { AppError } from './errors';
import type { CodeUiParserService } from './code-ui-parser';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import type { UiMappingService, UiMappingRecord } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';

export const figmaToCodePipelineSchema = z.object({
  project: z.string().trim().min(1).max(128),
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1).optional(),
  rootDir: z.string().trim().min(1).optional(),
  uiIds: z.array(z.string().trim().min(1)).max(200).optional(),
  apply: z.coerce.boolean().default(false)
});

export type UiDiffKind = 'text' | 'style' | 'layout' | 'order' | 'structure';
export type UiDiffEntry = {
  uiId: string;
  filePath: string;
  kinds: UiDiffKind[];
  summary: string;
};

export type FigmaToCodePipelineResult = {
  figma: UiModelDocument;
  codeComponentCount: number;
  diffs: UiDiffEntry[];
  patches: Array<Pick<CodePatchResult, 'filePath' | 'uiId' | 'applied' | 'changed'>>;
  notes: string[];
};

const hashNode = (node: UiNode): string => createHash('sha256').update(JSON.stringify(node)).digest('hex');

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

const byUiId = (document: UiModelDocument): Map<string, UiNode> => {
  const map = new Map<string, UiNode>();
  walk(document.root, (node) => map.set(node.uiId, node));
  return map;
};

const getMappingsForFile = (uiMappingService: UiMappingService, project: string, fileKey: string): UiMappingRecord[] =>
  uiMappingService.listUiMappings({ project, fileKey, limit: 100 });

const overlayMappedUiIds = (document: UiModelDocument, mappings: UiMappingRecord[]): UiModelDocument => {
  const byNode = new Map(mappings.map((mapping) => [`${mapping.figma.fileKey}:${mapping.figma.nodeId}`, mapping.uiId]));
  walk(document.root, (node) => {
    const fileKey = node.source?.fileKey;
    const nodeId = node.source?.nodeId;
    if (!fileKey || !nodeId) return;
    const mapped = byNode.get(`${fileKey}:${nodeId}`);
    if (mapped) node.uiId = mapped;
  });
  return document;
};

const diffNodes = (figmaNode: UiNode, codeNode: UiNode): UiDiffKind[] => {
  const diffs = new Set<UiDiffKind>();
  if ((figmaNode.text ?? '') !== (codeNode.text ?? '')) diffs.add('text');
  if (JSON.stringify(figmaNode.style ?? {}) !== JSON.stringify(codeNode.style ?? {})) diffs.add('style');
  if (JSON.stringify({ layout: figmaNode.layout, spacing: figmaNode.spacing, padding: figmaNode.padding }) !== JSON.stringify({ layout: codeNode.layout, spacing: codeNode.spacing, padding: codeNode.padding })) diffs.add('layout');
  const figmaOrder = figmaNode.children.map((child) => child.uiId);
  const codeOrder = codeNode.children.map((child) => child.uiId);
  if (JSON.stringify(figmaOrder) !== JSON.stringify(codeOrder)) diffs.add('order');
  if (figmaNode.children.length !== codeNode.children.length || figmaOrder.some((uiId) => !codeOrder.includes(uiId)) || codeOrder.some((uiId) => !figmaOrder.includes(uiId))) diffs.add('structure');
  return Array.from(diffs);
};

const findCodeNodeAcrossComponents = (components: UiModelDocument[], uiId: string): UiNode | null => {
  for (const component of components) {
    const map = byUiId(component);
    const node = map.get(uiId);
    if (node) return node;
  }
  return null;
};

export class FigmaToCodePipelineService {
  constructor(
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly codeUiParserService: CodeUiParserService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public async run(input: z.input<typeof figmaToCodePipelineSchema>): Promise<FigmaToCodePipelineResult> {
    const data = figmaToCodePipelineSchema.parse(input);
    const mappings = getMappingsForFile(this.uiMappingService, data.project, data.fileKey);
    const figmaDocument = overlayMappedUiIds(await this.figmaUiExtractorService.extract({ fileKey: data.fileKey, project: data.project, nodeId: data.nodeId }), mappings);
    const code = this.codeUiParserService.parseProject({ rootDir: data.rootDir, limit: 200 });
    const codeTrees = code.components.map((component) => component.tree);
    const figmaMap = byUiId(figmaDocument);
    const selectedUiIds = data.uiIds?.length ? data.uiIds : mappings.map((mapping) => mapping.uiId);
    const diffs: UiDiffEntry[] = [];
    const patches: Array<Pick<CodePatchResult, 'filePath' | 'uiId' | 'applied' | 'changed'>> = [];

    for (const uiId of selectedUiIds) {
      const mapping = mappings.find((item) => item.uiId === uiId);
      if (!mapping) continue;
      const figmaNode = figmaMap.get(uiId);
      const codeNode = findCodeNodeAcrossComponents(codeTrees, uiId);
      if (!figmaNode || !codeNode) continue;
      const kinds = diffNodes(figmaNode, codeNode);
      if (!kinds.length) continue;
      diffs.push({
        uiId,
        filePath: mapping.code.file,
        kinds,
        summary: `Sync ${uiId}: ${kinds.join(', ')}`
      });
      const patch = patchCodeFile({
        rootDir: data.rootDir ?? process.cwd(),
        filePath: mapping.code.file,
        uiId,
        node: figmaNode,
        apply: data.apply
      });
      patches.push({ filePath: patch.filePath, uiId: patch.uiId, applied: patch.applied, changed: patch.changed });
      if (data.apply && patch.changed) {
        this.uiMappingService.upsertUiMapping({
          uiId: mapping.uiId,
          project: mapping.project,
          semanticRole: mapping.semanticRole,
          code: {
            ...mapping.code,
            snapshotHash: hashNode(figmaNode),
            snapshot: figmaNode as unknown as Record<string, unknown>
          },
          figma: {
            ...mapping.figma,
            snapshotHash: hashNode(figmaNode),
            snapshot: figmaNode as unknown as Record<string, unknown>
          },
          sync: {
            lastDirection: 'figma_to_code',
            lastSyncedAt: new Date().toISOString(),
            lastCodeHash: hashNode(figmaNode),
            lastFigmaHash: hashNode(figmaNode)
          }
        });
      }
    }

    if (data.apply && !patches.length) {
      throw new AppError('No visual code patches were generated from Figma diff', 404, 'FIGMA_TO_CODE_NO_PATCHES');
    }

    return {
      figma: figmaDocument,
      codeComponentCount: code.componentCount,
      diffs,
      patches,
      notes: [
        'Only visual JSX patches are generated in MVP.',
        'Business logic, hooks, API calls, routing, and data layer are never auto-patched.',
        'Simple subtree replacement is used only for JSX blocks addressable by stable uiId.'
      ]
    };
  }
}
