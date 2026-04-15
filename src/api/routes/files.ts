import { Router } from 'express';

import {
  batchNodesSchema,
  fileKeyParamsSchema,
  fileNodeParamsSchema,
  renderSchema
} from '../../core/figma-gateway-service';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const filesRouter = Router();

filesRouter.get(
  '/files/:fileKey',
  validateRequest({ params: fileKeyParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getFile(req.params as { fileKey: string });
    sendSuccess(res, data);
  })
);

filesRouter.get(
  '/files/:fileKey/nodes/:nodeId',
  validateRequest({ params: fileNodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getNode(
      req.params as { fileKey: string; nodeId: string }
    );
    sendSuccess(res, data);
  })
);

filesRouter.post(
  '/nodes/batch',
  validateRequest({ body: batchNodesSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getNodesBatch(req.body);
    sendSuccess(res, data);
  })
);

filesRouter.get(
  '/files/:fileKey/styles',
  validateRequest({ params: fileKeyParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getStyles(req.params as { fileKey: string });
    sendSuccess(res, data);
  })
);

filesRouter.get(
  '/files/:fileKey/components',
  validateRequest({ params: fileKeyParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getComponents(
      req.params as { fileKey: string }
    );
    sendSuccess(res, data);
  })
);

filesRouter.get(
  '/files/:fileKey/component-sets',
  validateRequest({ params: fileKeyParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.getComponentSets(
      req.params as { fileKey: string }
    );
    sendSuccess(res, data);
  })
);

filesRouter.post(
  '/render',
  validateRequest({ body: renderSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaGatewayService.renderNodes(req.body);
    sendSuccess(res, data);
  })
);
