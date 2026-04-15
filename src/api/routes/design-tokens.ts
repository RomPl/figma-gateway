import { Router } from 'express';

import {
  designTokenSchema,
  listDesignTokensSchema,
  resolveDesignTokenSchema,
  searchDesignTokensSchema
} from '../../core/design-token-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const designTokensRouter = Router();

designTokensRouter.post(
  '/design-tokens',
  validateRequest({ body: designTokenSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.designTokenService.upsertDesignToken(req.body);
    sendSuccess(res, data);
  })
);

designTokensRouter.get(
  '/design-tokens',
  validateRequest({ query: listDesignTokensSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.designTokenService.listDesignTokens(req.query as Record<string, string | number | undefined>);
    sendSuccess(res, data);
  })
);

designTokensRouter.get(
  '/design-tokens/:token',
  validateRequest({ params: resolveDesignTokenSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.designTokenService.getDesignToken(req.params as { token: string });
    sendSuccess(res, data);
  })
);

designTokensRouter.post(
  '/resolve-design-token',
  validateRequest({ body: resolveDesignTokenSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.designTokenService.resolveDesignToken(req.body);
    sendSuccess(res, data);
  })
);

designTokensRouter.post(
  '/search/design-tokens',
  validateRequest({ body: searchDesignTokensSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.designTokenService.searchDesignTokens(req.body);
    sendSuccess(res, data);
  })
);
