import { Router } from 'express';

import { aliasesRouter } from './aliases';
import { designContextRouter } from './design-context';
import { filesRouter } from './files';
import { searchRouter } from './search';
import { pluginBridgeRouter } from './plugin-bridge';
import { systemRouter } from './system';
import { writeRouter } from './write/index';

export const createApiRouter = (): Router => {
  const router = Router();

  router.use(systemRouter);
  router.use('/api', filesRouter);
  router.use('/api', aliasesRouter);
  router.use('/api', designContextRouter);
  router.use('/api/search', searchRouter);
  router.use('/api/write', writeRouter);
  router.use('/api', pluginBridgeRouter);

  return router;
};
