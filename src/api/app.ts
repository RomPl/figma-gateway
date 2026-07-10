import path from 'node:path';

import express from 'express';

import { config } from '../config/env';
import { AliasRegistry, createAliasService } from '../core/alias-registry';
import { UiBlockRegistry, createUiBlockService } from '../core/ui-block-registry';
import { UiMappingRegistry, createUiMappingService } from '../core/ui-mapping-registry';
import { DesignTokenRegistry, createDesignTokenService } from '../core/design-token-registry';
import { AssetRegistry, createAssetRegistryService } from '../core/asset-registry';
import { AuditService, createAuditMiddleware } from '../core/audit';
import { createCachedFigmaReadClient, defaultFigmaCacheTtlConfig, type CacheBackend } from '../core/cache';
import { createMemoryCacheBackend } from '../core/cache-memory';
import { createDesignContextService } from '../core/design-context';
import { createCodeUiParserService, type CodeUiParserService } from '../core/code-ui-parser';
import { createFigmaUiExtractorService, type FigmaUiExtractorService } from '../core/figma-ui-extractor';
import { createRenderedUiExtractorService, type RenderedUiExtractorService } from '../core/rendered-ui-extractor';
import { createBrowserRendererService, type BrowserRendererService } from '../core/browser-renderer';
import { CodeToFigmaPipelineService } from '../core/code-to-figma-pipeline';
import { RenderedToCodeMapperService } from '../core/rendered-to-code-mapper';
import { FigmaToCodePipelineService } from '../core/figma-to-code-pipeline';
import { ReconcilePipelineService } from '../core/reconcile-pipeline';
import { IntentApiService } from '../core/intent-api';
import { SelectorResolverService } from '../core/selector-resolver';
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
  codeUiParserService?: CodeUiParserService;
  figmaUiExtractorService?: FigmaUiExtractorService;
  renderedUiExtractorService?: RenderedUiExtractorService;
  browserRendererService?: BrowserRendererService;
  renderedToCodeMapperService?: RenderedToCodeMapperService;
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
  app.locals.uiBlockRegistry = new UiBlockRegistry(db);
  app.locals.uiBlockService = createUiBlockService(app.locals.uiBlockRegistry);
  app.locals.uiMappingRegistry = new UiMappingRegistry(db);
  app.locals.uiMappingService = createUiMappingService(app.locals.uiMappingRegistry);
  app.locals.designTokenRegistry = new DesignTokenRegistry(db);
  app.locals.designTokenService = createDesignTokenService(app.locals.designTokenRegistry);
  app.locals.assetRegistry = new AssetRegistry(db);
  app.locals.assetRegistryService = createAssetRegistryService(app.locals.assetRegistry);
  app.locals.pluginBridgeService = new PluginBridgeService({ db });
  app.locals.browserRendererService = dependencies.browserRendererService ?? createBrowserRendererService();
  app.locals.codeUiParserService = dependencies.codeUiParserService ?? createCodeUiParserService(config.codeUiRootDir, app.locals.designTokenService);
  app.locals.figmaUiExtractorService = dependencies.figmaUiExtractorService ?? createFigmaUiExtractorService(app.locals.figmaClient, app.locals.designTokenService);
  app.locals.renderedUiExtractorService = dependencies.renderedUiExtractorService ?? createRenderedUiExtractorService(undefined, app.locals.designTokenService, app.locals.assetRegistryService);
  app.locals.renderedToCodeMapperService = dependencies.renderedToCodeMapperService ?? new RenderedToCodeMapperService(app.locals.renderedUiExtractorService, app.locals.codeUiParserService);
  app.locals.codeToFigmaPipelineService = new CodeToFigmaPipelineService(
    app.locals.codeUiParserService,
    app.locals.renderedToCodeMapperService,
    app.locals.pluginBridgeService,
    app.locals.uiMappingService
  );
  app.locals.figmaToCodePipelineService = new FigmaToCodePipelineService(
    app.locals.figmaUiExtractorService,
    app.locals.renderedToCodeMapperService,
    app.locals.uiMappingService
  );
  app.locals.reconcilePipelineService = new ReconcilePipelineService(
    app.locals.figmaUiExtractorService,
    app.locals.codeUiParserService,
    app.locals.renderedToCodeMapperService,
    app.locals.uiMappingService
  );
  app.locals.selectorResolverService = new SelectorResolverService(
    app.locals.codeUiParserService,
    app.locals.figmaUiExtractorService,
    app.locals.uiMappingService
  );
  app.locals.intentApiService = new IntentApiService(
    app.locals.codeToFigmaPipelineService,
    app.locals.figmaToCodePipelineService,
    app.locals.reconcilePipelineService,
    app.locals.codeUiParserService,
    app.locals.figmaUiExtractorService,
    app.locals.renderedUiExtractorService,
    app.locals.renderedToCodeMapperService,
    app.locals.uiMappingService,
    app.locals.pluginBridgeService,
    app.locals.designTokenService,
    app.locals.selectorResolverService
  );
  app.locals.writeRuntime = {
    enabled: enableWriteActions,
    allowedOperations: parseAllowedWriteOperations(writeAllowedOperations.join(','))
  };
  app.locals.figmaWriteService =
    dependencies.figmaWriteService ??
    createFigmaWriteService({
      aliasRegistry: app.locals.aliasRegistry,
      adapter: dependencies.figmaWriteAdapter ?? createDefaultFigmaWriteAdapter(),
      enabled: enableWriteActions,
      allowedOperations: app.locals.writeRuntime.allowedOperations
    });

  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(createCorsMiddleware(corsAllowedOrigins));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false, limit: '5mb' }));
  app.use(createAuditMiddleware(auditService));
  app.use(createRequestLoggingMiddleware(logger));
  app.use('/openapi', express.static(path.join(config.codeUiRootDir, 'openapi'), {
    fallthrough: false,
    maxAge: '5m',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }));
  app.use('/snapshots', express.static(path.join(config.codeUiRootDir, 'public_html', 'snapshots'), {
    fallthrough: true,
    immutable: true,
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));
  app.use('/api', createAuthMiddleware(authToken), createRateLimitMiddleware(rateLimitWindowMs, rateLimitMaxRequests));

  app.use(createApiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
