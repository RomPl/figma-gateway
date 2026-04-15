import { Router } from 'express';

import { reconcilePipelineSchema } from '../../core/reconcile-pipeline';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const reconcileRouter = Router();

reconcileRouter.post(
  '/sync/reconcile',
  validateRequest({ body: reconcilePipelineSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.reconcilePipelineService.run(req.body);
    sendSuccess(res, data);
  })
);
