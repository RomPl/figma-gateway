import { Router } from 'express';

import { aliasesRouter } from './aliases';
import { designContextRouter } from './design-context';
import { filesRouter } from './files';
import { searchRouter } from './search';
import { pluginBridgeRouter } from './plugin-bridge';
import { systemRouter } from './system';
import { writeRouter } from './write/index';
import { uiBlocksRouter } from './ui-blocks';
import { codeUiRouter } from './code-ui';
import { figmaUiRouter } from './figma-ui';
import { uiMappingsRouter } from './ui-mappings';
import { codeToFigmaRouter } from './code-to-figma';
import { designTokensRouter } from './design-tokens';
import { figmaToCodeRouter } from './figma-to-code';
import { reconcileRouter } from './reconcile';
import { intentsRouter } from './intents';
import { selectorsRouter } from './selectors';

export const createApiRouter = (): Router => {
  const router = Router();

  router.use(systemRouter);
  router.use('/api', filesRouter);
  router.use('/api', aliasesRouter);
  router.use('/api', designContextRouter);
  router.use('/api/search', searchRouter);
  router.use('/api/write', writeRouter);
  router.use('/api', pluginBridgeRouter);
  router.use('/api', uiBlocksRouter);
  router.use('/api', codeUiRouter);
  router.use('/api', figmaUiRouter);
  router.use('/api', uiMappingsRouter);
  router.use('/api', codeToFigmaRouter);
  router.use('/api', designTokensRouter);
  router.use('/api', figmaToCodeRouter);
  router.use('/api', reconcileRouter);
  router.use('/api', intentsRouter);
  router.use('/api', selectorsRouter);

  return router;
};
