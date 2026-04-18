import { Router } from 'express';

import { extractRenderedUiSchema, extractRenderedUiBreakpointsSchema, diagnoseRenderedUiSchema } from '../../core/rendered-ui-extractor';
import { buildCodeToFigmaPlan, auditFirstPassVisualAcceptance } from '../../core/code-to-figma-pipeline';
import { segmentVisualBlocks } from '../../core/visual-segmentation';
import { attachBreakpointVariantSet } from '../../core/breakpoint-variant-set';
import { materializeBreakpointVariantNodeRefs } from '../../core/breakpoint-variant-materializer';
import { buildVariantGroupPreview } from '../../core/variant-group-preview';
import { z } from 'zod';

import { mapRenderedToCodeSchema } from '../../core/rendered-to-code-mapper';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';
import { AppError } from '../../core/errors';
import type { UiNode } from '../../core/ui-model';

export const renderedUiRouter = Router();

const stableUiIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;


const collectUiIdsDeepFirst = (node: UiNode): string[] => {
  const seen = new Set<string>();
  const items: Array<{ uiId: string; depth: number }> = [];
  const walk = (current: UiNode, depth: number): void => {
    if (current.uiId && !seen.has(current.uiId)) {
      seen.add(current.uiId);
      items.push({ uiId: current.uiId, depth });
    }
    for (const child of current.children) walk(child, depth + 1);
  };
  walk(node, 0);
  return items.sort((a, b) => b.depth - a.depth).map((item) => item.uiId);
};


const diagnoseRenderedUiBreakpointsSchema = extractRenderedUiBreakpointsSchema.extend({
  rootUiId: z.string().trim().min(1).optional(),
  project: z.string().trim().min(1).max(128).optional()
});

const importBreakpointsToFigmaRenderedUiSchema = extractRenderedUiBreakpointsSchema.extend({
  rootDir: z.string().trim().min(1).optional(),
  fileKey: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  componentName: z.string().trim().min(1).default('rendered-ui-import'),
  filePath: z.string().trim().min(1).default('[rendered-ui]'),
  dryRun: z.coerce.boolean().default(true)
});


const collectVariantCleanupUiIds = (node: UiNode): string[] => collectUiIdsDeepFirst(node);


const buildFallbackDiagnosticsFromDocument = (document: any, data: any, breakpoint: string): Record<string, unknown> => {
  const root = document.root;
  const bbox = root?.boundingBox;
  const computedStyle = root?.computedStyle ?? {};
  return {
    targetMode: data.target.mode,
    resolvedUrl: data.target.mode === 'existing_url' ? data.target.url : `breakpoint:${breakpoint}`,
    finalUrl: data.target.mode === 'existing_url' ? data.target.url : `breakpoint:${breakpoint}`,
    title: root?.name ?? root?.uiId ?? `breakpoint:${breakpoint}`,
    pageAudit: {},
    domUiIdCount: collectUiIdsDeepFirst(root).length,
    rootRequestedUiId: data.rootUiId,
    rootResolvedByUiId: Boolean(data.rootUiId && root?.uiId === data.rootUiId),
    rootSelectionMode: (root?.meta as any)?.renderSurface?.shellSelectionMode ?? 'extract-fallback',
    fallbackUsed: true,
    rootSummary: {
      uiId: root?.uiId,
      tag: root?.name ?? root?.kind,
      text: root?.text,
      childCount: root?.children?.length ?? 0,
      boundingBox: bbox,
      computedStyle,
      shellSelectionMode: (root?.meta as any)?.renderSurface?.shellSelectionMode,
      contentSelectionMode: (root?.meta as any)?.renderSurface?.contentSelectionMode,
      shellPreserved: (root?.meta as any)?.renderSurface?.shellPreserved,
      shellRootTag: (root?.meta as any)?.renderSurface?.shellRootTag
    },
    childUiIds: (root?.children ?? []).map((child: any) => child.uiId),
    childSummaries: (root?.children ?? []).map((child: any) => ({
      uiId: child.uiId,
      tag: child.name ?? child.kind,
      textPreview: typeof child.text === 'string' ? child.text.slice(0, 120) : undefined,
      boundingBox: child.boundingBox,
      display: child.computedStyle?.display,
      layoutDirection: child.computedStyle?.flexDirection,
      score: ((child.boundingBox?.width ?? 0) * (child.boundingBox?.height ?? 0)) + ((child.children?.length ?? 0) * 1000),
      selectionReasons: ['extract_fallback_summary'],
      area: (child.boundingBox?.width ?? 0) * (child.boundingBox?.height ?? 0)
    })),
    computedStyleKeys: Object.keys(computedStyle).filter((key) => computedStyle[key])
  };
};

const importToFigmaRenderedUiSchema = extractRenderedUiSchema.extend({
  rootDir: z.string().trim().min(1).optional(),
  fileKey: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  componentName: z.string().trim().min(1).default('rendered-ui-import'),
  filePath: z.string().trim().min(1).default('[rendered-ui]'),
  dryRun: z.coerce.boolean().default(false)
});


renderedUiRouter.post(
  '/rendered-ui/extract',
  validateRequest({ body: extractRenderedUiSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.renderedUiExtractorService.extract(req.body);
    sendSuccess(res, data);
  })
);


renderedUiRouter.post(
  '/rendered-ui/extract-breakpoints',
  validateRequest({ body: extractRenderedUiBreakpointsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.renderedUiExtractorService.extractBreakpoints(req.body);
    sendSuccess(res, data);
  })
);


renderedUiRouter.post(
  '/rendered-ui/diagnose',
  validateRequest({ body: diagnoseRenderedUiSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.renderedUiExtractorService.diagnose(req.body);
    sendSuccess(res, data);
  })
);



renderedUiRouter.post(
  '/rendered-ui/diagnose-breakpoints',
  validateRequest({ body: diagnoseRenderedUiBreakpointsSchema }),
  asyncHandler(async (req, res) => {
    const data = diagnoseRenderedUiBreakpointsSchema.parse(req.body);
    const diagnosticsByBreakpoint: Record<string, unknown> = {};
    for (const breakpoint of data.breakpoints) {
      try {
        diagnosticsByBreakpoint[breakpoint] = await req.app.locals.renderedUiExtractorService.diagnose({
          ...data,
          breakpoint,
          breakpointName: breakpoint
        });
      } catch (error) {
        const document = await req.app.locals.renderedUiExtractorService.extract({
          ...data,
          breakpoint,
          breakpointName: breakpoint
        });
        diagnosticsByBreakpoint[breakpoint] = buildFallbackDiagnosticsFromDocument(document, data, breakpoint);
      }
    }
    sendSuccess(res, {
      activeBreakpoint: data.breakpoints[0],
      diagnosticsByBreakpoint,
      notes: [
        'Breakpoint-aware diagnostics reuse the stable single-breakpoint diagnose flow per breakpoint.',
        'This route is intended for surface/root/computed-style comparison across desktop/tablet/mobile.',
        'It prepares future breakpoint-aware beauty and reconcile decisions without forcing immediate writes.'
      ]
    });
  })
);

renderedUiRouter.post(
  '/rendered-ui/import-to-figma',
  validateRequest({ body: importToFigmaRenderedUiSchema }),
  asyncHandler(async (req, res) => {
    if (!req.app.locals.writeRuntime.allowedOperations.includes('execute-plugin-batch')) {
      throw new AppError('Write operation is not allowed: execute-plugin-batch', 403, 'WRITE_OPERATION_NOT_ALLOWED');
    }
    const data = importToFigmaRenderedUiSchema.parse(req.body);
    const liveSession = !data.dryRun
      ? req.app.locals.pluginBridgeService.assertSingleActiveSessionForFile({ sessionId: data.sessionId, fileKey: data.fileKey, clientName: data.clientName })
      : undefined;
    const mapped = data.project
      ? await req.app.locals.renderedToCodeMapperService.map({ project: data.project, rootDir: data.rootDir, render: data })
      : null;
    const model = attachBreakpointVariantSet(segmentVisualBlocks(mapped?.rendered ?? await req.app.locals.renderedUiExtractorService.extract(data)));
    const plan = buildCodeToFigmaPlan(model, data.componentName, data.filePath);
    if (!data.dryRun) {
      const cleanupUiIds = collectUiIdsDeepFirst(plan.model.root);
      const cleanupCommands = cleanupUiIds.map((uiId) => ({ type: 'delete_matching_nodes' as const, payload: { query: { uiId } } }));
      plan.commands = [...cleanupCommands, ...plan.commands];
    }
    const acceptance = auditFirstPassVisualAcceptance(plan.model);
    const notes = acceptance.passed
      ? ['Rendered-first import acceptance passed.', mapped ? 'Rendered snapshot was enriched with code ownership before Figma planning.' : 'Rendered snapshot was used without code-side ownership enrichment.']
      : [`Rendered-first import acceptance failed: ${acceptance.issues.join('; ')}. Live Figma batch was blocked.`, mapped ? 'Rendered snapshot was enriched with code ownership before Figma planning.' : 'Rendered snapshot was used without code-side ownership enrichment.'];
    let queued: { sessionId: string; commandId: string; status: string } | undefined;
    if (!data.dryRun && acceptance.passed) {
      const session = liveSession!;
      const command = req.app.locals.pluginBridgeService.queueExecutePluginBatch({
        sessionId: session.sessionId,
        fileKey: data.fileKey ?? session.fileKey,
        commands: plan.commands,
        actorId: 'rendered-ui-import-to-figma'
      });
      queued = { sessionId: session.sessionId, commandId: command.commandId, status: command.status };
    }
    const nodes: any[] = [];
    const walk = (node: any): void => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(plan.model.root);
    const mappedNodes = nodes.filter((node) => typeof node.uiId === 'string' && stableUiIdPattern.test(node.uiId));
    for (const node of mappedNodes) {
      req.app.locals.uiMappingService.upsertUiMapping({
        uiId: node.uiId,
        project: data.project ?? 'rendered-import',
        semanticRole: node.role,
        code: {
          file: node.source?.codePath ?? data.filePath,
          component: node.source?.codeExportName ?? data.componentName,
          selector: node.source?.codeSelector,
          sourceRange: node.source?.lineStart && node.source?.lineEnd ? { lineStart: node.source.lineStart, lineEnd: node.source.lineEnd } : undefined,
          jsxPath: node.source?.jsxPath,
          snapshotHash: JSON.stringify(node).length.toString(),
          snapshot: node
        },
        figma: { fileKey: data.fileKey ?? 'pending', nodeId: `pending:${node.uiId}`, snapshotHash: undefined, snapshot: {} },
        sync: { lastDirection: 'code_to_figma', lastSyncedAt: new Date().toISOString() }
      });
    }
    sendSuccess(res, {
      acceptance,
      notes,
      queued,
      model: plan.model,
      plan,
      mappingCount: mappedNodes.length,
      visualSource: 'rendered-first',
      sourceMapping: mapped ? 'code-backed' : 'rendered-only',
      breakpointVariantSet: (plan.model.root.meta as any)?.breakpointVariantSet
    });
  })
);


renderedUiRouter.post(
  '/rendered-ui/import-breakpoints-to-figma',
  validateRequest({ body: importBreakpointsToFigmaRenderedUiSchema }),
  asyncHandler(async (req, res) => {
    if (!req.body.dryRun && !req.app.locals.writeRuntime.allowedOperations.includes('execute-plugin-batch')) {
      throw new AppError('Write operation is not allowed: execute-plugin-batch', 403, 'WRITE_OPERATION_NOT_ALLOWED');
    }
    const data = importBreakpointsToFigmaRenderedUiSchema.parse(req.body);
    const liveSession = !data.dryRun
      ? req.app.locals.pluginBridgeService.assertSingleActiveSessionForFile({ sessionId: data.sessionId, fileKey: data.fileKey, clientName: data.clientName })
      : undefined;
    const extracted = await req.app.locals.renderedUiExtractorService.extractBreakpoints(data);
    const plansByBreakpoint: Record<string, unknown> = {};
    const modelsByBreakpoint: Record<string, unknown> = {};
    const queuedCommandSteps: any[] = [];
    for (const breakpoint of data.breakpoints) {
      const snapshot = extracted.snapshots[breakpoint];
      const segmented = attachBreakpointVariantSet(segmentVisualBlocks(snapshot), data.breakpoints as any);
      const family = ((segmented.root.meta as any)?.planningContext?.breakpointFamily ?? breakpoint) as 'desktop' | 'tablet' | 'mobile';
      const variantModel = materializeBreakpointVariantNodeRefs(segmented, family);
      const plan = buildCodeToFigmaPlan(variantModel, `${data.componentName}`, data.filePath);
      const cleanupCommands = collectVariantCleanupUiIds(plan.model.root).map((uiId) => ({ type: 'delete_matching_nodes' as const, payload: { query: { uiId } } }));
      plan.commands = [...cleanupCommands, ...plan.commands];
      plansByBreakpoint[breakpoint] = plan;
      modelsByBreakpoint[breakpoint] = plan.model;
      queuedCommandSteps.push(...plan.commands);
    }
    const variantGroup = buildVariantGroupPreview(modelsByBreakpoint as any);
    let queued: { sessionId: string; commandId: string; status: string } | undefined;
    if (!data.dryRun) {
      const session = liveSession!;
      const command = req.app.locals.pluginBridgeService.queueExecutePluginBatch({
        sessionId: session.sessionId,
        fileKey: data.fileKey ?? session.fileKey,
        commands: queuedCommandSteps,
        actorId: 'rendered-ui-import-breakpoints-to-figma'
      });
      queued = { sessionId: session.sessionId, commandId: command.commandId, status: command.status };
    }
    sendSuccess(res, {
      activeBreakpoint: extracted.activeBreakpoint,
      snapshots: extracted.snapshots,
      modelsByBreakpoint,
      plansByBreakpoint,
      variantGroup,
      queued,
      notes: [
        'Multi-breakpoint rendered-first planning produced separate variant node refs per breakpoint family.',
        'Variant node refs are namespaced to avoid cross-breakpoint cleanup collisions.',
        'Mapping persistence is intentionally deferred for this route until multi-breakpoint reverse-sync bindings are finalized.'
      ]
    });
  })
);

renderedUiRouter.post(
  '/rendered-ui/map-to-code',
  validateRequest({ body: mapRenderedToCodeSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.renderedToCodeMapperService.map(req.body);
    sendSuccess(res, data);
  })
);
