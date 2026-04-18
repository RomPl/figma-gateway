import { Router } from 'express';
import { z } from 'zod';

import { codeToFigmaPipelineSchema } from '../../core/code-to-figma-pipeline';
import { materializeBreakpointVariantNodeRefs } from '../../core/breakpoint-variant-materializer';
import { AppError } from '../../core/errors';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const codeToFigmaRouter = Router();

const buildBreakpointsSchema = codeToFigmaPipelineSchema.extend({
  breakpoints: z.array(z.enum(['mobile', 'tablet', 'desktop'])).min(1).max(3)
}).superRefine((value, ctx) => {
  if (!value.render) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'render payload is required for multi-breakpoint build', path: ['render'] });
});



codeToFigmaRouter.post(
  '/code-to-figma/build-breakpoints',
  validateRequest({ body: buildBreakpointsSchema }),
  asyncHandler(async (req, res) => {
    const runtime = req.app.locals.writeRuntime;
    if (!req.body.dryRun) {
      if (!runtime.enabled) throw new AppError('Write actions are disabled', 403, 'WRITE_ACTIONS_DISABLED');
      if (!runtime.allowedOperations.includes('execute-plugin-batch')) throw new AppError('Write operation is not allowed: execute-plugin-batch', 403, 'WRITE_OPERATION_NOT_ALLOWED');
    }
    const data = buildBreakpointsSchema.parse(req.body);
    const render = data.render!;
    const liveSession = !data.dryRun
      ? req.app.locals.pluginBridgeService.assertSingleActiveSessionForFile({ sessionId: data.sessionId, fileKey: data.fileKey, clientName: data.clientName })
      : undefined;
    const resultsByBreakpoint: Record<string, unknown> = {};
    const combinedCommands: any[] = [];
    for (const breakpoint of data.breakpoints) {
      const result = await req.app.locals.codeToFigmaPipelineService.run({
        ...data,
        dryRun: true,
        render: { ...render, breakpoint, breakpointName: breakpoint }
      });
      const family = (((result.plan.model.root.meta as any)?.planningContext?.breakpointFamily) ?? breakpoint) as 'desktop' | 'tablet' | 'mobile';
      const variantModel = materializeBreakpointVariantNodeRefs(result.plan.model, family);
      result.plan.model = variantModel;
      result.model = variantModel;
      result.plan.commands = result.plan.commands.map((command: any) => {
        const payload = command?.payload && typeof command.payload === 'object' ? { ...command.payload } : command?.payload;
        if (payload?.nodeRef && typeof payload.nodeRef === 'string') payload.nodeRef = `${payload.nodeRef}--${family}`;
        return { ...command, payload };
      });
      resultsByBreakpoint[breakpoint] = result;
      combinedCommands.push(...result.plan.commands);
    }
    let queued: { sessionId: string; commandId: string; status: string } | undefined;
    if (!data.dryRun) {
      const session = liveSession!;
      const command = req.app.locals.pluginBridgeService.queueExecutePluginBatch({
        sessionId: session.sessionId,
        fileKey: data.fileKey ?? session.fileKey,
        commands: combinedCommands,
        actorId: 'code-to-figma-build-breakpoints'
      });
      queued = { sessionId: session.sessionId, commandId: command.commandId, status: command.status };
    }
    sendSuccess(res, {
      breakpoints: data.breakpoints,
      resultsByBreakpoint,
      queued,
      notes: [
        'Code-backed multi-breakpoint build reuses the stable single-breakpoint pipeline per breakpoint.',
        'Variant node refs are materialized per breakpoint family before batch queueing.',
        'Mapping persistence remains single-breakpoint-only until multi-breakpoint reverse-sync bindings are finalized.'
      ]
    }, data.dryRun ? 200 : 202);
  })
);

codeToFigmaRouter.post(
  '/code-to-figma/build',
  validateRequest({ body: codeToFigmaPipelineSchema }),
  asyncHandler(async (req, res) => {
    const runtime = req.app.locals.writeRuntime;
    if (!req.body.dryRun) {
      if (!runtime.enabled) {
        throw new AppError('Write actions are disabled', 403, 'WRITE_ACTIONS_DISABLED');
      }
      if (!runtime.allowedOperations.includes('execute-plugin-batch')) {
        throw new AppError('Write operation is not allowed: execute-plugin-batch', 403, 'WRITE_OPERATION_NOT_ALLOWED');
      }
    }
    const data = await req.app.locals.codeToFigmaPipelineService.run(req.body);
    sendSuccess(res, data, req.body.dryRun ? 200 : 202);
  })
);
