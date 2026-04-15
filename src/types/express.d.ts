import type { AppConfig } from '../config/env';
import type { AliasRegistry, AliasService } from '../core/alias-registry';
import type { AuditService } from '../core/audit';
import type { FigmaCache } from '../core/cache';
import type { DesignContextService } from '../core/design-context';
import type { FigmaReadClient } from '../core/figma-client';
import type { FigmaGatewayService } from '../core/figma-gateway-service';
import type { FigmaWriteService } from '../core/figma-write-types';
import type { PluginBridgeService } from '../core/plugin-bridge';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }

    interface Locals {
      config: AppConfig;
      auditService: AuditService;
      figmaCache: FigmaCache;
      figmaClient: FigmaReadClient;
      figmaGatewayService: FigmaGatewayService;
      figmaWriteService: FigmaWriteService;
      designContextService: DesignContextService;
      aliasRegistry: AliasRegistry;
      aliasService: AliasService;
      pluginBridgeService: PluginBridgeService;
    }
  }
}

export {};
