import { Router } from 'express';

import { listVariantGroupsSchema, searchVariantGroupsSchema, VariantGroupRegistry } from '../../core/variant-group-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const variantGroupsRouter = Router();

variantGroupsRouter.get(
  '/variant-groups',
  validateRequest({ query: listVariantGroupsSchema }),
  asyncHandler(async (req, res) => {
    const registry = new VariantGroupRegistry(req.app.locals.uiMappingService);
    sendSuccess(res, registry.list(req.query as Record<string, string | number | undefined>));
  })
);

variantGroupsRouter.post(
  '/search/variant-groups',
  validateRequest({ body: searchVariantGroupsSchema }),
  asyncHandler(async (req, res) => {
    const registry = new VariantGroupRegistry(req.app.locals.uiMappingService);
    sendSuccess(res, registry.search(req.body));
  })
);
