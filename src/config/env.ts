import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_NAME: z.string().min(1).default('figma-gateway'),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  FIGMA_TOKEN: z.string().trim().min(1).optional(),
  FIGMA_API_BASE_URL: z.string().url().default('https://api.figma.com'),
  FIGMA_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(10000),
  FIGMA_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  CACHE_TTL_FILES_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_NODES_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_STYLES_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_COMPONENTS_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_COMPONENT_SETS_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_VARIABLES_MS: z.coerce.number().int().min(1000).max(86400000).default(300000),
  CACHE_TTL_RENDER_LINKS_MS: z.coerce.number().int().min(1000).max(86400000).default(60000),
  ENABLE_WRITE_ACTIONS: z.coerce.boolean().default(false),
  WRITE_ALLOWED_OPERATIONS: z
    .string()
    .default('create-frame,update-text,create-section,duplicate-block,apply-style-from-alias'),
  API_BEARER_TOKEN: z.string().trim().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60),
  SQLITE_DB_PATH: z.string().trim().min(1).default('/home/figma-gateway.vazovski.art/data/figma-gateway.sqlite'),
  ALIAS_REGISTRY_SEED_ON_STARTUP: z.coerce.boolean().default(false),
  CODE_UI_ROOT_DIR: z.string().trim().min(1).default('/home/figma-gateway.vazovski.art'),
  GATEWAY_PUBLIC_BASE_URL: z.string().url().default('https://figma-gateway.vazovski.art')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${details}`);
}

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  appName: string;
  appVersion: string;
  figmaToken?: string;
  figmaApiBaseUrl: string;
  figmaTimeoutMs: number;
  figmaMaxRetries: number;
  cacheTtlFilesMs: number;
  cacheTtlNodesMs: number;
  cacheTtlStylesMs: number;
  cacheTtlComponentsMs: number;
  cacheTtlComponentSetsMs: number;
  cacheTtlVariablesMs: number;
  cacheTtlRenderLinksMs: number;
  enableWriteActions: boolean;
  writeAllowedOperations: string[];
  apiBearerToken?: string;
  corsAllowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sqliteDbPath: string;
  aliasRegistrySeedOnStartup: boolean;
  codeUiRootDir: string;
  gatewayPublicBaseUrl: string;
};

export const config: AppConfig = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  host: parsedEnv.data.HOST,
  port: parsedEnv.data.PORT,
  logLevel: parsedEnv.data.LOG_LEVEL,
  appName: parsedEnv.data.APP_NAME,
  appVersion: parsedEnv.data.APP_VERSION,
  figmaToken: parsedEnv.data.FIGMA_TOKEN,
  figmaApiBaseUrl: parsedEnv.data.FIGMA_API_BASE_URL,
  figmaTimeoutMs: parsedEnv.data.FIGMA_TIMEOUT_MS,
  figmaMaxRetries: parsedEnv.data.FIGMA_MAX_RETRIES,
  cacheTtlFilesMs: parsedEnv.data.CACHE_TTL_FILES_MS,
  cacheTtlNodesMs: parsedEnv.data.CACHE_TTL_NODES_MS,
  cacheTtlStylesMs: parsedEnv.data.CACHE_TTL_STYLES_MS,
  cacheTtlComponentsMs: parsedEnv.data.CACHE_TTL_COMPONENTS_MS,
  cacheTtlComponentSetsMs: parsedEnv.data.CACHE_TTL_COMPONENT_SETS_MS,
  cacheTtlVariablesMs: parsedEnv.data.CACHE_TTL_VARIABLES_MS,
  cacheTtlRenderLinksMs: parsedEnv.data.CACHE_TTL_RENDER_LINKS_MS,
  enableWriteActions: parsedEnv.data.ENABLE_WRITE_ACTIONS,
  writeAllowedOperations: parsedEnv.data.WRITE_ALLOWED_OPERATIONS.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  apiBearerToken: parsedEnv.data.API_BEARER_TOKEN,
  corsAllowedOrigins: parsedEnv.data.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  rateLimitWindowMs: parsedEnv.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: parsedEnv.data.RATE_LIMIT_MAX_REQUESTS,
  sqliteDbPath: parsedEnv.data.SQLITE_DB_PATH,
  aliasRegistrySeedOnStartup: parsedEnv.data.ALIAS_REGISTRY_SEED_ON_STARTUP,
  codeUiRootDir: parsedEnv.data.CODE_UI_ROOT_DIR,
  gatewayPublicBaseUrl: parsedEnv.data.GATEWAY_PUBLIC_BASE_URL
};
