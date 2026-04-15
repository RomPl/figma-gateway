import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';

import { config } from '../config/env';
import { AliasRegistry, createAliasService } from '../core/alias-registry';
import { AuditService } from '../core/audit';
import { createCachedFigmaReadClient, defaultFigmaCacheTtlConfig } from '../core/cache';
import { createMemoryCacheBackend } from '../core/cache-memory';
import { createDesignContextService } from '../core/design-context';
import { FigmaClient } from '../core/figma-client';
import { createFigmaGatewayService } from '../core/figma-gateway-service';
import {
  createDefaultFigmaWriteAdapter,
  createFigmaWriteService,
  parseAllowedWriteOperations
} from '../core/figma-write-service';
import { migrateDatabase } from '../db/migrate';
import { seedAliasRegistry } from '../db/seed';
import { createSqliteDatabase } from '../db/sqlite';
import { logger } from '../utils/logger';
import { registerFigmaTools } from './tools';

export const createMcpServer = () => {
  const db = createSqliteDatabase(config.sqliteDbPath);
  migrateDatabase(db);
  if (config.aliasRegistrySeedOnStartup) {
    seedAliasRegistry(db);
  }
  const auditService = new AuditService(db);

  const { client: figmaClient } = createCachedFigmaReadClient(new FigmaClient(), {
    backend: createMemoryCacheBackend(),
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
  const gatewayService = createFigmaGatewayService(figmaClient);
  const designContextService = createDesignContextService(figmaClient);
  const aliasRegistry = new AliasRegistry(db);
  const aliasService = createAliasService(aliasRegistry, gatewayService);
  const writeService = createFigmaWriteService({
    aliasRegistry,
    adapter: createDefaultFigmaWriteAdapter(),
    enabled: config.enableWriteActions,
    allowedOperations: parseAllowedWriteOperations(config.writeAllowedOperations.join(','))
  });
  const server = new McpServer(
    {
      name: config.appName,
      version: config.appVersion
    },
    {
      instructions:
        'Use these tools only for read-only inspection of Figma files, nodes, styles, components, renders, and simple search.'
    }
  );

  registerFigmaTools(
    server,
    gatewayService,
    aliasService,
    designContextService,
    writeService,
    auditService
  );

  return server;
};

export const startMcpServer = async (): Promise<void> => {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('MCP server started on stdio');
};

if (require.main === module) {
  startMcpServer().catch((error) => {
    logger.fatal({ err: error }, 'Failed to start MCP server');
    process.exit(1);
  });
}
