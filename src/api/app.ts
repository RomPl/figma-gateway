import express from 'express';

import { config } from '../config/env';
import { AliasRegistry, createAliasService } from '../core/alias-registry';
import { AuditService, createAuditMiddleware } from '../core/audit';
import { createCachedFigmaReadClient, defaultFigmaCacheTtlConfig, type CacheBackend } from '../core/cache';
import { createMemoryCacheBackend } from '../core/cache-memory';
import { createDesignContextService } from '../core/design-context';
import { FigmaClient, type FigmaReadClient } from '../core/figma-client';
import { createFigmaGatewayService } from '../core/figma-gateway-service';
import {
  createDefaultFigmaWriteAdapter,
  createFigmaWriteService,
  parseAllowedWriteOperations
} from '../core/figma-write-service';
import type { FigmaWriteAdapter, FigmaWriteService } from '../core/figma-write-types';
import { migrateDatabase } from '../db/migrate';
import { seedAliasRegistry } from '../db/seed';
import { createSqliteDatabase, type SqliteDatabase } from '../db/sqlite';
import { errorHandler, notFoundHandler } from '../core/middleware';
import { logger } from '../utils/logger';
import { createAuthMiddleware } from './middleware/auth';
import { createCorsMiddleware } from './middleware/cors';
import { requestIdMiddleware } from './middleware/request-id';
import { createRateLimitMiddleware } from './middleware/rate-limit';
import { createRequestLoggingMiddleware, securityHeadersMiddleware } from './middleware/security';
import { createApiRouter } from './routes/index';
import { PluginBridgeService } from '../core/plugin-bridge';

export type ApiDependencies = {
  db?: SqliteDatabase;
  auditService?: AuditService;
  cacheBackend?: CacheBackend;
  figmaClient?: FigmaReadClient;
  figmaWriteAdapter?: FigmaWriteAdapter;
  figmaWriteService?: FigmaWriteService;
  enableWriteActions?: boolean;
  writeAllowedOperations?: string[];
  apiBearerToken?: string;
  corsAllowedOrigins?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
};

export const createApp = (dependencies: ApiDependencies = {}) => {
  const app = express();
  const authToken = dependencies.apiBearerToken ?? config.apiBearerToken;
  const corsAllowedOrigins = dependencies.corsAllowedOrigins ?? config.corsAllowedOrigins;
  const rateLimitWindowMs = dependencies.rateLimitWindowMs ?? config.rateLimitWindowMs;
  const rateLimitMaxRequests = dependencies.rateLimitMaxRequests ?? config.rateLimitMaxRequests;
  const enableWriteActions = dependencies.enableWriteActions ?? config.enableWriteActions;
  const writeAllowedOperations = dependencies.writeAllowedOperations ?? config.writeAllowedOperations;
  const db = dependencies.db ?? createSqliteDatabase(config.sqliteDbPath);
  const auditService = dependencies.auditService ?? new AuditService(db);
  const cacheBackend = dependencies.cacheBackend ?? createMemoryCacheBackend();
  const uncachedFigmaClient = dependencies.figmaClient ?? new FigmaClient();
  const { client: figmaClient, cache: figmaCache } = createCachedFigmaReadClient(uncachedFigmaClient, {
    backend: cacheBackend,
    ttlConfig: {
      ...defaultFigmaCacheTtlConfig,
      files: config.cacheTtlFilesMs,
      nodes: config.cacheTtlNodesMs,
      styles: config.cacheTtlStylesMs,
      components: config.cacheTtlComponentsMs,
      'component-sets': config.cacheTtlComponentSetsMs,
      variables: config.cacheTtlVariablesMs,
      'render-links': config.cacheTtlRenderLinksMs
    }
  });

  app.disable('x-powered-by');
  app.locals.config = config;
  app.locals.auditService = auditService;
  app.locals.figmaCache = figmaCache;
  app.locals.figmaClient = figmaClient;
  app.locals.figmaGatewayService = createFigmaGatewayService(app.locals.figmaClient);
  app.locals.designContextService = createDesignContextService(app.locals.figmaClient);
  migrateDatabase(db);
  if (config.aliasRegistrySeedOnStartup && !dependencies.db) {
    seedAliasRegistry(db);
  }
  app.locals.aliasRegistry = new AliasRegistry(db);
  app.locals.aliasService = createAliasService(app.locals.aliasRegistry, app.locals.figmaGatewayService);
  app.locals.pluginBridgeService = new PluginBridgeService();
  app.locals.figmaWriteService =
    dependencies.figmaWriteService ??
    createFigmaWriteService({
      aliasRegistry: app.locals.aliasRegistry,
      adapter: dependencies.figmaWriteAdapter ?? createDefaultFigmaWriteAdapter(),
      enabled: enableWriteActions,
      allowedOperations: parseAllowedWriteOperations(writeAllowedOperations.join(','))
    });

  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(createCorsMiddleware(corsAllowedOrigins));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(createAuditMiddleware(auditService));
  app.use(createRequestLoggingMiddleware(logger));
  app.use('/api', createAuthMiddleware(authToken), createRateLimitMiddleware(rateLimitWindowMs, rateLimitMaxRequests));

  app.use(createApiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
