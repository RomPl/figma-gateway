import { Router } from 'express';

import { resolveSelectorSchema } from '../../core/selector-resolver';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const selectorsRouter = Router();

selectorsRouter.post(
  '/selectors/resolve',
  validateRequest({ body: resolveSelectorSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.selectorResolverService.resolve(req.body);
    sendSuccess(res, data);
  })
);
