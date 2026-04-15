import { Router } from 'express';

import { searchSchema } from '../../core/figma-gateway-service';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const searchRouter = Router();

searchRouter.post(
  '/by-name',
  validateRequest({ body: searchSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.searchByName(req.body);
    sendSuccess(res, data);
  })
);

searchRouter.post(
  '/by-text',
  validateRequest({ body: searchSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.searchByText(req.body);
    sendSuccess(res, data);
  })
);
