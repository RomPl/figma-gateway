import { Router } from 'express';

import { executeIntentSchema } from '../../core/intent-api';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const intentsRouter = Router();

intentsRouter.get('/intents', (_req, res) => {
  sendSuccess(res, {
    intents: [
      'reconstruct_design_from_code',
      'sync_block_to_figma',
      'sync_block_to_code',
      'sync_page_to_figma',
      'sync_page_to_code',
      'reconcile_design_and_code',
      'apply_tokens_to_figma',
      'rebind_mappings',
      'annotate_ui_ids'
    ]
  });
});

intentsRouter.post(
  '/intents/execute',
  validateRequest({ body: executeIntentSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.intentApiService.execute(req.body);
    sendSuccess(res, data, 200);
  })
);
