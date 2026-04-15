import { createRequire } from 'node:module';
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';

const require = createRequire(import.meta.url);
const { config } = require('../dist/config/env.js');
const { AliasRegistry, createAliasService } = require('../dist/core/alias-registry.js');
const { AuditService } = require('../dist/core/audit.js');
const { createCachedFigmaReadClient, defaultFigmaCacheTtlConfig } = require('../dist/core/cache.js');
const { createMemoryCacheBackend } = require('../dist/core/cache-memory.js');
const { createDesignContextService } = require('../dist/core/design-context.js');
const { FigmaClient } = require('../dist/core/figma-client.js');
const { createFigmaGatewayService } = require('../dist/core/figma-gateway-service.js');
const { createDefaultFigmaWriteAdapter, createFigmaWriteService, parseAllowedWriteOperations } = require('../dist/core/figma-write-service.js');
const { migrateDatabase } = require('../dist/db/migrate.js');
const { seedAliasRegistry } = require('../dist/db/seed.js');
const { createSqliteDatabase } = require('../dist/db/sqlite.js');
const { logger } = require('../dist/utils/logger.js');
const { registerFigmaTools } = require('../dist/mcp/tools/index.js');

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
  { name: config.appName, version: config.appVersion },
  { instructions: 'Use these tools only for read-only inspection of Figma files, aliases, design context, and guarded dry-run writes.' }
);
registerFigmaTools(server, gatewayService, aliasService, designContextService, writeService, auditService);

const transport = new StdioServerTransport();
await server.connect(transport);
