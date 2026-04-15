import { z } from 'zod';

import { AppError } from './errors';
import type { CodeUiParserService } from './code-ui-parser';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import { buildUiReconcilePlan, syncModeSchema, toUiMap, type UiReconcilePlan } from './ui-diff-engine';
import type { UiMappingRecord, UiMappingService } from './ui-mapping-registry';
import type { UiModelDocument } from './ui-model';

export const reconcilePipelineSchema = z.object({
  project: z.string().trim().min(1).max(128),
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1).optional(),
  rootDir: z.string().trim().min(1).optional(),
  mode: syncModeSchema.default('reconcile'),
  uiIds: z.array(z.string().trim().min(1)).max(200).optional()
});

export type ReconcilePipelineResult = {
  mode: z.infer<typeof syncModeSchema>;
  codeComponentCount: number;
  mergePlan: UiReconcilePlan['mergePlan'];
  conflicts: UiReconcilePlan['conflicts'];
  changes: UiReconcilePlan['changes'];
  notes: string[];
};

const walk = (node: any, fn: (node: any) => void): void => {
  fn(node);
  (node.children ?? []).forEach((child: any) => walk(child, fn));
};

const overlayMappedUiIds = (document: UiModelDocument, mappings: UiMappingRecord[]): UiModelDocument => {
  const byNode = new Map(mappings.map((mapping) => [`${mapping.figma.fileKey}:${mapping.figma.nodeId}`, mapping.uiId]));
  walk(document.root, (node) => {
    const key = node.source?.fileKey && node.source?.nodeId ? `${node.source.fileKey}:${node.source.nodeId}` : null;
    if (!key) return;
    const mapped = byNode.get(key);
    if (mapped) node.uiId = mapped;
  });
  return document;
};

const pickRootCodeDocument = (documents: UiModelDocument[], mappings: UiMappingRecord[]): UiModelDocument => {
  if (!documents.length) throw new AppError('No code UI documents available for reconcile', 404, 'CODE_UI_COMPONENT_NOT_FOUND');
  const byUiIdDocs = documents.map((doc) => toUiMap(doc));
  const scored = documents.map((doc, index) => ({
    doc,
    score: mappings.filter((mapping) => byUiIdDocs[index].has(mapping.uiId)).length
  })).sort((a, b) => b.score - a.score);
  return scored[0].doc;
};

export class ReconcilePipelineService {
  constructor(
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly codeUiParserService: CodeUiParserService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public async run(input: z.input<typeof reconcilePipelineSchema>): Promise<ReconcilePipelineResult> {
    const data = reconcilePipelineSchema.parse(input);
    const mappings = this.uiMappingService.listUiMappings({ project: data.project, fileKey: data.fileKey, limit: 100 });
    const figmaDocument = overlayMappedUiIds(await this.figmaUiExtractorService.extract({ fileKey: data.fileKey, project: data.project, nodeId: data.nodeId }), mappings);
    const code = this.codeUiParserService.parseProject({ rootDir: data.rootDir, limit: 200 });
    const codeDocument = pickRootCodeDocument(code.components.map((component) => component.tree), mappings);
    const plan = buildUiReconcilePlan(data.mode, codeDocument, figmaDocument, mappings, data.uiIds);

    return {
      mode: data.mode,
      codeComponentCount: code.componentCount,
      mergePlan: plan.mergePlan,
      conflicts: plan.conflicts,
      changes: plan.changes,
      notes: [
        'reconcile compares code, figma, and last synced snapshot state from ui_mappings.',
        'conflicting fields are isolated instead of being auto-merged.',
        'safe one-way modes remain available through code_to_figma and figma_to_code.'
      ]
    };
  }
}
