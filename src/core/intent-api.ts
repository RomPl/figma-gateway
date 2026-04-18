import { z } from 'zod';

import { AppError } from './errors';
import type { CodeToFigmaPipelineService } from './code-to-figma-pipeline';
import type { CodeUiParserService } from './code-ui-parser';
import type { DesignTokenService } from './design-token-registry';
import type { FigmaToCodePipelineService } from './figma-to-code-pipeline';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import type { PluginBridgeService } from './plugin-bridge';
import type { ReconcilePipelineService } from './reconcile-pipeline';
import type { RenderedToCodeMapperService } from './rendered-to-code-mapper';
import type { RenderedUiExtractorService } from './rendered-ui-extractor';
import type { UiMappingService } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';
import { materializeBreakpointVariantNodeRefs } from './breakpoint-variant-materializer';

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
  artifacts?: Record<string, unknown>;
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

const countNodes = (document: UiModelDocument): number => {
  let count = 0;
  walk(document.root, () => { count += 1; });
  return count;
};

const countTokenBoundNodes = (document: UiModelDocument): number => {
  let count = 0;
  walk(document.root, (node) => {
    const bindings = node.meta && typeof node.meta.tokenBindings === 'object' ? node.meta.tokenBindings as Record<string, unknown> : undefined;
    if (bindings && Object.keys(bindings).length) count += 1;
  });
  return count;
};

const VISUAL_INTENT_PHASES = ['snapshot_code', 'render_ui', 'normalize', 'token_resolve', 'diff', 'plan', 'batch'];
const RECONCILE_PHASES = ['snapshot_code', 'snapshot_figma', 'render_ui', 'normalize', 'token_resolve', 'diff', 'plan'];
const APPLY_TOKENS_PHASES = ['snapshot_code', 'render_ui', 'normalize', 'token_resolve', 'diff', 'plan', 'batch'];

export class IntentApiService {
  constructor(
    private readonly codeToFigmaPipelineService: CodeToFigmaPipelineService,
    private readonly figmaToCodePipelineService: FigmaToCodePipelineService,
    private readonly reconcilePipelineService: ReconcilePipelineService,
    private readonly codeUiParserService: CodeUiParserService,
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly renderedUiExtractorService: RenderedUiExtractorService,
    private readonly renderedToCodeMapperService: RenderedToCodeMapperService,
    private readonly uiMappingService: UiMappingService,
    private readonly pluginBridgeService: PluginBridgeService,
    private readonly designTokenService: DesignTokenService,
    private readonly selectorResolverService: any
  ) {}

  private requireRender(payload: Record<string, unknown>, intent: z.infer<typeof intentCommandSchema>): Record<string, unknown> {
    if (!payload.render || typeof payload.render !== 'object') {
      throw new AppError(`Intent ${intent} requires a render payload so the agent can operate on rendered UI instead of AST-only guesses`, 400, 'INTENT_RENDER_REQUIRED');
    }
    return payload.render as Record<string, unknown>;
  }

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


  private getBreakpointRequests(payload: Record<string, unknown>): Array<'mobile' | 'tablet' | 'desktop'> {
    if (!Array.isArray(payload.breakpoints)) return [];
    const normalized = payload.breakpoints.map(String).filter((item) => ['mobile', 'tablet', 'desktop'].includes(item)) as Array<'mobile' | 'tablet' | 'desktop'>;
    return Array.from(new Set(normalized));
  }

  private async executeCodeToFigmaBreakpointsIntent(intent: z.infer<typeof intentCommandSchema>, payload: Record<string, unknown>): Promise<{ phases: string[]; artifacts: Record<string, unknown>; result: unknown; }> {
    const render = this.requireRender(payload, intent);
    const breakpoints = this.getBreakpointRequests(payload);
    const session = !payload.dryRun
      ? this.pluginBridgeService.assertSingleActiveSessionForFile({ sessionId: payload.sessionId as string | undefined, fileKey: payload.fileKey as string | undefined, clientName: payload.clientName as string | undefined })
      : undefined;
    const resultsByBreakpoint: Record<string, unknown> = {};
    const combinedCommands: Array<Record<string, unknown>> = [];
    for (const breakpoint of breakpoints) {
      const result = await this.codeToFigmaPipelineService.run({ ...(payload as any), dryRun: true, render: { ...render, breakpoint, breakpointName: breakpoint } });
      const family = ((((result.plan.model.root.meta as any)?.planningContext?.breakpointFamily) ?? breakpoint) as 'mobile' | 'tablet' | 'desktop');
      const variantModel = materializeBreakpointVariantNodeRefs(result.plan.model, family);
      result.plan.model = variantModel;
      result.model = variantModel;
      result.plan.commands = result.plan.commands.map((command: any) => {
        const payload = command?.payload && typeof command.payload === 'object' ? { ...command.payload } : command?.payload;
        if (payload?.nodeRef && typeof payload.nodeRef === 'string') payload.nodeRef = `${payload.nodeRef}--${family}`;
        return { ...command, payload };
      });
      resultsByBreakpoint[breakpoint] = result;
      combinedCommands.push(...(result.plan.commands as Array<Record<string, unknown>>));
    }
    let queued: { sessionId: string; commandId: string; status: string } | undefined;
    if (!payload.dryRun && session) {
      const command = this.pluginBridgeService.queueExecutePluginBatch({ sessionId: session.sessionId, fileKey: (payload.fileKey as string | undefined) ?? session.fileKey, commands: combinedCommands as any, actorId: `intent.${intent}.breakpoints` });
      queued = { sessionId: session.sessionId, commandId: command.commandId, status: command.status };
    }
    return {
      phases: [...VISUAL_INTENT_PHASES],
      artifacts: { visualSource: 'rendered_ui_snapshot', breakpointCount: breakpoints.length, breakpoints },
      result: { breakpoints, resultsByBreakpoint, queued, notes: ['Intent used breakpoint-aware orchestration across multiple rendered/code-backed planning runs.', 'Variant node refs were materialized per breakpoint family before aggregate queueing.', 'Multi-breakpoint mapping persistence remains deferred until reverse-sync variant bindings are finalized.'] }
    };
  }

  private async snapshotVisualChain(payload: Record<string, unknown>): Promise<{ codeComponentCount: number; renderedNodeCount: number; tokenBoundNodeCount: number; rendered: UiModelDocument; }> {
    const project = payload.project as string | undefined;
    const rootDir = payload.rootDir as string | undefined;
    const render = this.requireRender(payload, 'reconstruct_design_from_code');
    const code = this.codeUiParserService.parseProject({ rootDir, project, componentName: payload.componentName as string | undefined, filePath: payload.filePath as string | undefined, limit: 200 });
    const rendered = await this.renderedToCodeMapperService.map({ project, rootDir, render });
    return {
      codeComponentCount: code.componentCount,
      renderedNodeCount: countNodes(rendered.rendered),
      tokenBoundNodeCount: countTokenBoundNodes(rendered.rendered),
      rendered: rendered.rendered
    };
  }


  private assertCodeToFigmaAcceptance(result: any, intent: z.infer<typeof intentCommandSchema>): void {
    if (!result || !result.acceptance || result.acceptance.passed !== false) return;
    throw new AppError(
      `Intent ${intent} did not pass first-pass visual acceptance and was blocked from being treated as final`,
      409,
      'INTENT_FIRST_PASS_ACCEPTANCE_FAILED',
      { acceptance: result.acceptance, notes: result.notes, needsReview: result.needsReview }
    );
  }

  public async execute(input: z.input<typeof executeIntentSchema>): Promise<IntentExecutionResult> {
    const data = executeIntentSchema.parse(input);
    switch (data.intent) {
      case 'reconstruct_design_from_code': {
        const breakpoints = this.getBreakpointRequests(data.payload as any);
        if (breakpoints.length) {
          const multi = await this.executeCodeToFigmaBreakpointsIntent(data.intent, data.payload as any);
          return { intent: data.intent, phases: multi.phases, artifacts: multi.artifacts, result: multi.result };
        }
        const render = this.requireRender(data.payload, data.intent);
        const visual = await this.snapshotVisualChain(data.payload);
        const result = await this.codeToFigmaPipelineService.run({ ...(data.payload as any), render });
        this.assertCodeToFigmaAcceptance(result, data.intent);
        return {
          intent: data.intent,
          phases: [...VISUAL_INTENT_PHASES],
          artifacts: {
            codeComponentCount: visual.codeComponentCount,
            renderedNodeCount: visual.renderedNodeCount,
            tokenBoundNodeCount: visual.tokenBoundNodeCount,
            visualSource: 'rendered_ui_snapshot'
          },
          result
        };
      }
      case 'sync_block_to_figma': {
        const render = this.requireRender(data.payload, data.intent);
        const uiIds = (await this.resolveUiIdsFromPayload(data.payload as any)) ?? [(data.payload as any).uiId];
        const visual = await this.snapshotVisualChain({ ...(data.payload as any), uiIds, render });
        const result = await this.codeToFigmaPipelineService.run({ ...(data.payload as any), uiIds, render });
        this.assertCodeToFigmaAcceptance(result, data.intent);
        return { intent: data.intent, phases: [...VISUAL_INTENT_PHASES], artifacts: { codeComponentCount: visual.codeComponentCount, renderedNodeCount: visual.renderedNodeCount, tokenBoundNodeCount: visual.tokenBoundNodeCount, visualSource: 'rendered_ui_snapshot' }, result };
      }
      case 'sync_page_to_figma': {
        const breakpoints = this.getBreakpointRequests(data.payload as any);
        if (breakpoints.length) {
          const multi = await this.executeCodeToFigmaBreakpointsIntent(data.intent, data.payload as any);
          return { intent: data.intent, phases: multi.phases, artifacts: multi.artifacts, result: multi.result };
        }
        const render = this.requireRender(data.payload, data.intent);
        const visual = await this.snapshotVisualChain(data.payload);
        const result = await this.codeToFigmaPipelineService.run({ ...(data.payload as any), render });
        this.assertCodeToFigmaAcceptance(result, data.intent);
        return { intent: data.intent, phases: [...VISUAL_INTENT_PHASES], artifacts: { codeComponentCount: visual.codeComponentCount, renderedNodeCount: visual.renderedNodeCount, tokenBoundNodeCount: visual.tokenBoundNodeCount, visualSource: 'rendered_ui_snapshot' }, result };
      }
      case 'sync_block_to_code': {
        const render = this.requireRender(data.payload, data.intent);
        const uiIds = (await this.resolveUiIdsFromPayload(data.payload as any)) ?? [(data.payload as any).uiId];
        const visual = await this.snapshotVisualChain({ ...(data.payload as any), uiIds, render });
        const result = await this.figmaToCodePipelineService.run({ ...(data.payload as any), uiIds, render });
        return { intent: data.intent, phases: [...VISUAL_INTENT_PHASES], artifacts: { codeComponentCount: visual.codeComponentCount, renderedNodeCount: visual.renderedNodeCount, tokenBoundNodeCount: visual.tokenBoundNodeCount, visualSource: 'rendered_ui_snapshot' }, result };
      }
      case 'sync_page_to_code': {
        const render = this.requireRender(data.payload, data.intent);
        const visual = await this.snapshotVisualChain(data.payload);
        const result = await this.figmaToCodePipelineService.run({ ...(data.payload as any), render });
        return { intent: data.intent, phases: [...VISUAL_INTENT_PHASES], artifacts: { codeComponentCount: visual.codeComponentCount, renderedNodeCount: visual.renderedNodeCount, tokenBoundNodeCount: visual.tokenBoundNodeCount, visualSource: 'rendered_ui_snapshot' }, result };
      }
      case 'reconcile_design_and_code': {
        const render = this.requireRender(data.payload, data.intent);
        const project = String((data.payload as any).project || '');
        const fileKey = String((data.payload as any).fileKey || '');
        const code = this.codeUiParserService.parseProject({ rootDir: (data.payload as any).rootDir as string | undefined, project, limit: 200 });
        const figma = await this.figmaUiExtractorService.extract({ fileKey, project, nodeId: (data.payload as any).nodeId });
        const rendered = await this.renderedToCodeMapperService.map({ project, rootDir: (data.payload as any).rootDir as string | undefined, render });
        const result = await this.reconcilePipelineService.run({ ...(data.payload as any), mode: 'reconcile', render });
        return {
          intent: data.intent,
          phases: [...RECONCILE_PHASES],
          artifacts: {
            codeComponentCount: code.componentCount,
            figmaNodeCount: countNodes(figma),
            renderedNodeCount: countNodes(rendered.rendered),
            tokenBoundNodeCount: countTokenBoundNodes(rendered.rendered),
            visualSource: 'rendered_ui_snapshot'
          },
          result
        };
      }
      case 'apply_tokens_to_figma': {
        const render = this.requireRender(data.payload, data.intent);
        const project = String((data.payload as any).project || '');
        const rootDir = (data.payload as any).rootDir as string | undefined;
        const visual = await this.renderedToCodeMapperService.map({ project, rootDir, render });
        const uiIds = (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (Array.isArray((data.payload as any).uiIds) ? (data.payload as any).uiIds.map(String) : undefined);
        const result = this.applyTokensToFigmaFromRendered({ ...(data.payload as any), uiIds }, visual.rendered);
        return {
          intent: data.intent,
          phases: [...APPLY_TOKENS_PHASES],
          artifacts: {
            renderedNodeCount: countNodes(visual.rendered),
            tokenBoundNodeCount: countTokenBoundNodes(visual.rendered),
            visualSource: 'rendered_ui_snapshot'
          },
          result
        };
      }
      case 'rebind_mappings':
        return {
          intent: data.intent,
          phases: ['snapshot_code', 'snapshot_figma', 'normalize', 'diff'],
          result: await this.rebindMappings({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (data.payload as any).uiIds })
        };
      case 'annotate_ui_ids':
        return {
          intent: data.intent,
          phases: ['snapshot_figma', 'normalize', 'batch'],
          result: this.annotateUiIds({ ...(data.payload as any), uiIds: (await this.resolveUiIdsFromPayload(data.payload as any)) ?? (data.payload as any).uiIds })
        };
      default:
        throw new AppError(`Unsupported intent: ${(data as any).intent}`, 400, 'INTENT_NOT_SUPPORTED');
    }
  }

  private applyTokensToFigmaFromRendered(payload: Record<string, unknown>, rendered: UiModelDocument) {
    const project = String(payload.project || '');
    const fileKey = String(payload.fileKey || '');
    const session = this.pluginBridgeService.assertSingleActiveSessionForFile({
      sessionId: payload.sessionId as string | undefined,
      fileKey,
      clientName: payload.clientName as string | undefined
    });
    const requestedUiIds = Array.isArray(payload.uiIds) ? payload.uiIds.map(String) : [];
    const mappings = this.uiMappingService.listUiMappings({ project, fileKey, limit: 100 }).filter((mapping) => !requestedUiIds.length || requestedUiIds.includes(mapping.uiId));
    const renderedMap = toUiMap(rendered);
    const commands: Array<Record<string, unknown>> = [];
    for (const mapping of mappings) {
      const snapshot = renderedMap.get(mapping.uiId) ?? mapping.code.snapshot as unknown as UiNode | undefined;
      if (!snapshot) continue;
      if (snapshot.confidence?.needsReview) {
        commands.push({ type: 'set_plugin_data', payload: { nodeId: mapping.figma.nodeId, key: 'needsReview', value: 'true' } });
        continue;
      }
      const bindings = snapshot.meta && typeof snapshot.meta.tokenBindings === 'object' ? snapshot.meta.tokenBindings as Record<string, any> : {};
      const fill = bindings.fill;
      const typography = bindings.typography;
      const radius = bindings.radius;
      if (fill?.raw) commands.push({ type: 'set_fill', payload: { nodeId: mapping.figma.nodeId, token: fill.token, fills: [{ type: 'SOLID', color: hexToColor(fill.raw) }] } });
      const radiusValue = snapshot.declarativeStyle?.radius ?? snapshot.style?.radius ?? snapshot.computedStyle?.borderRadius;
      if (radiusValue !== undefined) commands.push({ type: 'set_corner_radius', payload: { nodeId: mapping.figma.nodeId, token: radius?.token, cornerRadius: radiusValue } });
      const textStyle = snapshot.declarativeStyle?.text ?? snapshot.style?.text;
      if (textStyle || snapshot.computedStyle?.fontSize) commands.push({ type: 'set_text_style', payload: { nodeId: mapping.figma.nodeId, token: typography?.token, fontFamily: snapshot.computedStyle?.fontFamily ?? textStyle?.fontFamily, fontStyle: textStyle?.fontStyle, fontSize: snapshot.computedStyle?.fontSize ?? textStyle?.fontSize } });
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
    const session = this.pluginBridgeService.assertSingleActiveSessionForFile({
      sessionId: payload.sessionId as string | undefined,
      fileKey,
      clientName: payload.clientName as string | undefined
    });
    const requestedUiIds = Array.isArray(payload.uiIds) ? payload.uiIds.map(String) : [];
    const mappings = this.uiMappingService.listUiMappings({ project, fileKey, limit: 100 }).filter((mapping) => !requestedUiIds.length || requestedUiIds.includes(mapping.uiId));
    const commands = mappings.map((mapping) => ({ type: 'set_plugin_data', payload: { nodeId: mapping.figma.nodeId, uiId: mapping.uiId } }));
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
