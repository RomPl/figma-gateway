import { Router } from 'express';

import {
  listUiMappingsSchema,
  resolveUiMappingSchema,
  searchUiMappingsSchema,
  uiMappingSchema
} from '../../core/ui-mapping-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const uiMappingsRouter = Router();

uiMappingsRouter.post(
  '/ui-mappings',
  validateRequest({ body: uiMappingSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiMappingService.upsertUiMapping(req.body);
    sendSuccess(res, data);
  })
);

uiMappingsRouter.get(
  '/ui-mappings',
  validateRequest({ query: listUiMappingsSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiMappingService.listUiMappings(req.query as Record<string, string | number | undefined>);
    sendSuccess(res, data);
  })
);

uiMappingsRouter.get(
  '/ui-mappings/:uiId',
  validateRequest({ params: resolveUiMappingSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiMappingService.getUiMapping(req.params as { uiId: string });
    sendSuccess(res, data);
  })
);

uiMappingsRouter.post(
  '/resolve-ui-mapping',
  validateRequest({ body: resolveUiMappingSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiMappingService.resolveUiMapping(req.body);
    sendSuccess(res, data);
  })
);

uiMappingsRouter.post(
  '/search/ui-mappings',
  validateRequest({ body: searchUiMappingsSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiMappingService.searchUiMappings(req.body);
    sendSuccess(res, data);
  })
);
