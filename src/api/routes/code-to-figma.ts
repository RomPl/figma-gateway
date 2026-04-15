import { Router } from 'express';

import { codeToFigmaPipelineSchema } from '../../core/code-to-figma-pipeline';
import { AppError } from '../../core/errors';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const codeToFigmaRouter = Router();

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
    const data = req.app.locals.codeToFigmaPipelineService.run(req.body);
    sendSuccess(res, data, req.body.dryRun ? 200 : 202);
  })
);
