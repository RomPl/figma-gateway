import { Router } from 'express';

import { config } from '../../config/env';
import { getGatewayCapabilities } from '../../core/capabilities';
import { sendSuccess } from './helpers';

export const systemRouter = Router();

systemRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: config.appName,
    version: config.appVersion,
    environment: config.nodeEnv,
    endpoints: {
      health: '/health',
      version: '/version',
      capabilities: '/capabilities',
      openapi: '/openapi'
    }
  });
});

systemRouter.get('/health', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: config.appName,
    version: config.appVersion,
    uptime: process.uptime()
  });
});

systemRouter.get('/version', (_req, res) => {
  sendSuccess(res, {
    name: config.appName,
    version: config.appVersion,
    environment: config.nodeEnv
  });
});

systemRouter.get('/capabilities', (_req, res) => {
  sendSuccess(res, {
    name: config.appName,
    version: config.appVersion,
    environment: config.nodeEnv,
    capabilities: getGatewayCapabilities()
  });
});
