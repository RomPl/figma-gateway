import { Router } from 'express';

import { listAssetRegistrySchema, resolveAssetRegistrySchema } from '../../core/asset-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const assetsRouter = Router();

assetsRouter.get(
  '/assets',
  validateRequest({ query: listAssetRegistrySchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.assetRegistryService.listAssets(req.query);
    sendSuccess(res, data);
  })
);

assetsRouter.get(
  '/assets/:assetId',
  validateRequest({ params: resolveAssetRegistrySchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.assetRegistryService.resolveAsset({ assetId: String(req.params.assetId) });
    sendSuccess(res, data);
  })
);
