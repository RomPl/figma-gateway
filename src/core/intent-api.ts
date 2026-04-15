import { z } from 'zod';

import { AppError } from './errors';
import type { CodeToFigmaPipelineService } from './code-to-figma-pipeline';
import type { CodeUiParserService } from './code-ui-parser';
import type { DesignTokenService } from './design-token-registry';
import type { FigmaToCodePipelineService } from './figma-to-code-pipeline';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import type { PluginBridgeService } from './plugin-bridge';
import type { ReconcilePipelineService } from './reconcile-pipeline';
import type { UiMappingService } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';

export const intentCommandSchema = z.enum([
  'reconstruct_design_from_code',
  'sync_block_to_figma',
  'sync_block_to_code',
  'sync_page_to_figma',
  'sync_page_to_code',
  'reconcile_design_and_code',
  'apply_tokens_to_figma',
  'rebind_mappings',
  'annotate_ui_ids'
]);

export const executeIntentSchema = z.object({
  intent: intentCommandSchema,
  payload: z.record(z.string(), z.unknown()).default({})
});

export type IntentExecutionResult = {
  intent: z.infer<typeof intentCommandSchema>;
  phases: string[];
  result: unknown;
};

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

const toUiMap = (document: UiModelDocument): Map<string, UiNode> => {
  const map = new Map<string, UiNode>();
  walk(document.root, (node) => map.set(node.uiId, node));
  return map;
};

export class IntentApiService {
  constructor(
    private readonly codeToFigmaPipelineService: CodeToFigmaPipelineService,
    private readonly figmaToCodePipelineService: FigmaToCodePipelineService,
    private readonly reconcilePipelineService: ReconcilePipelineService,
    private readonly codeUiParserService: CodeUiParserService,
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly uiMappingService: UiMappingService,
    private readonly pluginBridgeService: PluginBridgeService,
    private readonly designTokenService: DesignTokenService,
    private readonly selectorResolverService: any
  ) {}

  private async resolveUiIdsFromPayload(payload: Record<string, unknown>): Promise<string[] | undefined> {
    const selector = typeof payload.selector === 'string' ? payload.selector.trim() : '';
    if (!selector) return undefined;
    const resolved = await this.selectorResolverService.resolve({
      query: selector,
      project: payload.project as string | undefined,
      fileKey: payload.fileKey as string | undefined,
      nodeId: payload.nodeId as string | undefined,
      rootDir: payload.rootDir as string | undefined,
      source: payload.selectorSource as 'code' | 'figma' | 'both' | undefined,
      limit: 5
    });
    return resolved.matches.map((item: { uiId: string }) => item.uiId);
  }

  public async execute(input: z.input<typeof executeIntentSchema>): Promise<IntentExecutionResult> {
    const data = executeIntentSchema.parse(input);
    switch (data.intent) {
      case 'reconstruct_design_from_code':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'batch_low_level_operations'],
          result: this.codeToFigmaPipelineService.run(data.payload as any)
        };
      case 'sync_block_to_figma':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'batch_low_level_operations'],
          result: this.codeToFigmaPipelineService.run({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? [(data.payload as any).uiId] })
        };
      case 'sync_page_to_figma':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'batch_low_level_operations'],
          result: this.codeToFigmaPipelineService.run(data.payload as any)
        };
      case 'sync_block_to_code':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'batch_low_level_operations'],
          result: await this.figmaToCodePipelineService.run({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? [(data.payload as any).uiId] })
        };
      case 'sync_page_to_code':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'batch_low_level_operations'],
          result: await this.figmaToCodePipelineService.run(data.payload as any)
        };
      case 'reconcile_design_and_code':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'merge_plan'],
          result: await this.reconcilePipelineService.run({ ...(data.payload as any), mode: 'reconcile' })
        };
      case 'apply_tokens_to_figma':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff', 'batch_low_level_operations'],
          result: this.applyTokensToFigma({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (data.payload as any).uiIds })
        };
      case 'rebind_mappings':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'diff'],
          result: await this.rebindMappings({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (data.payload as any).uiIds })
        };
      case 'annotate_ui_ids':
        return {
          intent: data.intent,
          phases: ['snapshot', 'normalize', 'batch_low_level_operations'],
          result: this.annotateUiIds({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (data.payload as any).uiIds })
        };
      default:
        throw new AppError(`Unsupported intent: ${(data as any).intent}`, 400, 'INTENT_NOT_SUPPORTED');
    }
  }

  private applyTokensToFigma(payload: Record<string, unknown>) {
    const project = String(payload.project || '');
    const fileKey = String(payload.fileKey || '');
    const session = this.pluginBridgeService.resolveSession({
      sessionId: payload.sessionId as string | undefined,
      fileKey,
      clientName: payload.clientName as string | undefined
    });
    const requestedUiIds = Array.isArray(payload.uiIds) ? payload.uiIds.map(String) : [];
    const mappings = this.uiMappingService.listUiMappings({ project, fileKey, limit: 100 }).filter((mapping) => !requestedUiIds.length || requestedUiIds.includes(mapping.uiId));
    const commands: Array<Record<string, unknown>> = [];
    for (const mapping of mappings) {
      const snapshot = mapping.code.snapshot as unknown as UiNode | undefined;
      const bindings = snapshot?.meta && typeof snapshot.meta.tokenBindings === 'object' ? snapshot.meta.tokenBindings as Record<string, any> : {};
      const fill = bindings.fill;
      const typography = bindings.typography;
      const radius = bindings.radius;
      if (fill?.raw) commands.push({ type: 'set_fill', payload: { nodeId: mapping.figma.nodeId, token: fill.token, fills: [{ type: 'SOLID', color: hexToColor(fill.raw) }] } });
      if (snapshot?.style?.radius !== undefined) commands.push({ type: 'set_corner_radius', payload: { nodeId: mapping.figma.nodeId, token: radius?.token, cornerRadius: snapshot.style.radius } });
      if (snapshot?.style?.text) commands.push({ type: 'set_text_style', payload: { nodeId: mapping.figma.nodeId, token: typography?.token, fontFamily: snapshot.style.text.fontFamily, fontStyle: snapshot.style.text.fontStyle, fontSize: snapshot.style.text.fontSize } });
    }
    const command = this.pluginBridgeService.queueExecutePluginBatch({
      sessionId: session.sessionId,
      fileKey: fileKey || session.fileKey,
      commands: commands as any,
      actorId: 'intent.apply_tokens_to_figma'
    });
    return { sessionId: session.sessionId, commandId: command.commandId, status: command.status, commandCount: commands.length };
  }

  private async rebindMappings(payload: Record<string, unknown>) {
    const project = String(payload.project || '');
    const fileKey = String(payload.fileKey || '');
    const requestedUiIds = Array.isArray(payload.uiIds) ? payload.uiIds.map(String) : [];
    const code = this.codeUiParserService.parseProject({ rootDir: payload.rootDir as string | undefined, project, limit: 200 });
    const figma = await this.figmaUiExtractorService.extract({ fileKey, project, nodeId: payload.nodeId as string | undefined });
    const codeMap = new Map<string, UiNode>();
    for (const component of code.components) walk(component.tree.root, (node) => codeMap.set(node.uiId, node));
    const figmaMap = toUiMap(figma);
    const uiIds = requestedUiIds.length ? requestedUiIds : Array.from(codeMap.keys()).filter((uiId) => figmaMap.has(uiId));
    let rebound = 0;
    for (const uiId of uiIds) {
      const codeNode = codeMap.get(uiId);
      const figmaNode = figmaMap.get(uiId);
      if (!codeNode || !figmaNode) continue;
      this.uiMappingService.upsertUiMapping({
        uiId,
        project,
        semanticRole: codeNode.role ?? figmaNode.role,
        code: {
          file: codeNode.source?.codePath ?? 'unknown',
          component: codeNode.source?.codeExportName ?? 'unknown',
          selector: codeNode.source?.codeSelector,
          sourceRange: codeNode.source?.lineStart && codeNode.source?.lineEnd ? { lineStart: codeNode.source.lineStart, lineEnd: codeNode.source.lineEnd } : undefined,
          jsxPath: codeNode.source?.jsxPath,
          snapshot: codeNode as unknown as Record<string, unknown>
        },
        figma: {
          fileKey,
          nodeId: figmaNode.source?.nodeId ?? `pending:${uiId}`,
          snapshot: figmaNode as unknown as Record<string, unknown>
        },
        sync: {
          lastDirection: 'bidirectional',
          lastSyncedAt: new Date().toISOString()
        }
      });
      rebound += 1;
    }
    return { reboundCount: rebound, project, fileKey };
  }

  private annotateUiIds(payload: Record<string, unknown>) {
    const project = String(payload.project || '');
    const fileKey = String(payload.fileKey || '');
    const session = this.pluginBridgeService.resolveSession({
      sessionId: payload.sessionId as string | undefined,
      fileKey,
      clientName: payload.clientName as string | undefined
    });
    const requestedUiIds = Array.isArray(payload.uiIds) ? payload.uiIds.map(String) : [];
    const mappings = this.uiMappingService.listUiMappings({ project, fileKey, limit: 100 }).filter((mapping) => !requestedUiIds.length || requestedUiIds.includes(mapping.uiId));
    const commands = mappings.map((mapping) => ({
      type: 'set_plugin_data',
      payload: {
        nodeId: mapping.figma.nodeId,
        uiId: mapping.uiId
      }
    }));
    const command = this.pluginBridgeService.queueExecutePluginBatch({
      sessionId: session.sessionId,
      fileKey: fileKey || session.fileKey,
      commands: commands as any,
      actorId: 'intent.annotate_ui_ids'
    });
    return { sessionId: session.sessionId, commandId: command.commandId, status: command.status, commandCount: commands.length };
  }
}

const hexToColor = (raw: string): { r: number; g: number; b: number } => {
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  const normalized = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex;
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
};
