import { Router } from 'express';

import { designContextSchema } from '../../core/design-context';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const designContextRouter = Router();

designContextRouter.post(
  '/design-context',
  validateRequest({ body: designContextSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.designContextService.getDesignContext(req.body);
    sendSuccess(res, data);
  })
);

designContextRouter.post(
  '/layout-summary',
  validateRequest({ body: designContextSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.designContextService.getLayoutSummary(req.body);
    sendSuccess(res, data);
  })
);
