import { Router } from 'express';

import {
  listUiBlocksSchema,
  resolveUiBlockSchema,
  searchUiBlocksSchema,
  uiBlockSchema
} from '../../core/ui-block-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const uiBlocksRouter = Router();

uiBlocksRouter.post(
  '/ui-blocks',
  validateRequest({ body: uiBlockSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiBlockService.upsertUiBlock(req.body);
    sendSuccess(res, data);
  })
);

uiBlocksRouter.get(
  '/ui-blocks',
  validateRequest({ query: listUiBlocksSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiBlockService.listUiBlocks(
      req.query as { project?: string; tag?: string; limit?: string | number }
    );
    sendSuccess(res, data);
  })
);

uiBlocksRouter.get(
  '/ui-blocks/:uiId',
  validateRequest({ params: resolveUiBlockSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiBlockService.getUiBlock(req.params as { uiId: string });
    sendSuccess(res, data);
  })
);

uiBlocksRouter.post(
  '/resolve-ui-block',
  validateRequest({ body: resolveUiBlockSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiBlockService.resolveUiBlock(req.body);
    sendSuccess(res, data);
  })
);

uiBlocksRouter.post(
  '/search/ui-blocks',
  validateRequest({ body: searchUiBlocksSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.uiBlockService.searchUiBlocks(req.body);
    sendSuccess(res, data);
  })
);
