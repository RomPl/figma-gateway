import { Router } from 'express';

import {
  aliasSchema,
  listAliasesSchema,
  resolveAliasSchema,
  searchAliasesSchema
} from '../../core/alias-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const aliasesRouter = Router();

aliasesRouter.post(
  '/aliases',
  validateRequest({ body: aliasSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.aliasService.upsertAlias(req.body);
    sendSuccess(res, data);
  })
);

aliasesRouter.get(
  '/aliases',
  validateRequest({ query: listAliasesSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.aliasService.listAliases(
      req.query as { project?: string; tag?: string; limit?: string | number }
    );
    sendSuccess(res, data);
  })
);

aliasesRouter.get(
  '/aliases/:alias',
  validateRequest({ params: resolveAliasSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.aliasService.getAlias(req.params as { alias: string });
    sendSuccess(res, data);
  })
);

aliasesRouter.post(
  '/resolve-alias',
  validateRequest({ body: resolveAliasSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.aliasService.resolveAlias(req.body);
    sendSuccess(res, data);
  })
);

aliasesRouter.post(
  '/search/aliases',
  validateRequest({ body: searchAliasesSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.aliasService.searchAliases(req.body);
    sendSuccess(res, data);
  })
);
