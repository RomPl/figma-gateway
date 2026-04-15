import { Router } from 'express';

import { figmaToCodePipelineSchema } from '../../core/figma-to-code-pipeline';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const figmaToCodeRouter = Router();

figmaToCodeRouter.post(
  '/figma-to-code/sync',
  validateRequest({ body: figmaToCodePipelineSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaToCodePipelineService.run(req.body);
    sendSuccess(res, data, req.body.apply ? 200 : 200);
  })
);
