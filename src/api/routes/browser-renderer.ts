import { Router } from 'express';

import { browserRenderOpenSchema } from '../../core/browser-renderer';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const browserRendererRouter = Router();

browserRendererRouter.post(
  '/rendered-ui/open-page',
  validateRequest({ body: browserRenderOpenSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.browserRendererService.openPage(req.body);
    sendSuccess(res, data);
  })
);
