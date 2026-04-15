import { Router } from 'express';

import { parseCodeUiProjectSchema } from '../../core/code-ui-parser';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const codeUiRouter = Router();

codeUiRouter.post(
  '/code-ui/parse',
  validateRequest({ body: parseCodeUiProjectSchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.codeUiParserService.parseProject(req.body);
    sendSuccess(res, data);
  })
);
