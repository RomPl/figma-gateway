import { Router } from 'express';
import { z } from 'zod';

import { reconcilePipelineSchema } from '../../core/reconcile-pipeline';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const reconcileRouter = Router();

const reconcileBreakpointsSchema = reconcilePipelineSchema.extend({
  breakpoints: z.array(z.enum(['mobile', 'tablet', 'desktop'])).min(1).max(3)
});



reconcileRouter.post(
  '/sync/reconcile-breakpoints',
  validateRequest({ body: reconcileBreakpointsSchema }),
  asyncHandler(async (req, res) => {
    const data = reconcileBreakpointsSchema.parse(req.body);
    const resultsByBreakpoint: Record<string, unknown> = {};
    for (const breakpoint of data.breakpoints) {
      resultsByBreakpoint[breakpoint] = await req.app.locals.reconcilePipelineService.run({
        ...data,
        render: { ...data.render, breakpoint, breakpointName: breakpoint }
      });
    }
    sendSuccess(res, {
      breakpoints: data.breakpoints,
      resultsByBreakpoint,
      notes: [
        'Breakpoint-aware reconcile reuses the stable single-breakpoint reconcile pipeline per breakpoint.',
        'This keeps diff priorities and conflict classification consistent across breakpoint families.',
        'Variant-group reverse-sync bindings remain deferred; this route is diagnostic/planning-first.'
      ]
    });
  })
);

reconcileRouter.post(
  '/sync/reconcile',
  validateRequest({ body: reconcilePipelineSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.reconcilePipelineService.run(req.body);
    sendSuccess(res, data);
  })
);
