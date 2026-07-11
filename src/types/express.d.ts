import type { AppConfig } from '../config/env';
import type { AliasRegistry, AliasService } from '../core/alias-registry';
import type { AuditService } from '../core/audit';
import type { FigmaCache } from '../core/cache';
import type { DesignContextService } from '../core/design-context';
import type { CodeUiParserService } from '../core/code-ui-parser';
import type { FigmaUiExtractorService } from '../core/figma-ui-extractor';
import type { RenderedUiExtractorService } from '../core/rendered-ui-extractor';
import type { BrowserRendererService } from '../core/browser-renderer';
import type { RenderedToCodeMapperService } from '../core/rendered-to-code-mapper';
import type { CodeToFigmaPipelineService } from '../core/code-to-figma-pipeline';
import type { FigmaToCodePipelineService } from '../core/figma-to-code-pipeline';
import type { ReconcilePipelineService } from '../core/reconcile-pipeline';
import type { IntentApiService } from '../core/intent-api';
import type { SelectorResolverService } from '../core/selector-resolver';
import type { FigmaReadClient } from '../core/figma-client';
import type { FigmaGatewayService } from '../core/figma-gateway-service';
import type { FigmaWriteOperation, FigmaWriteService } from '../core/figma-write-types';
import type { PluginBridgeService } from '../core/plugin-bridge';
import type { UiBlockRegistry, UiBlockService } from '../core/ui-block-registry';
import type { UiMappingRegistry, UiMappingService } from '../core/ui-mapping-registry';
import type { DesignTokenRegistry, DesignTokenService } from '../core/design-token-registry';
import type { AssetRegistry } from '../core/asset-registry';

declare global {
  namespace Express {
    interface Request {
      id: string;
      metricContext?: {
        correlation_id?: string;
        segment_id?: string;
        activity_window_id?: string;
      };
    }

    interface Locals {
      config: AppConfig;
      auditService: AuditService;
      figmaCache: FigmaCache;
      figmaClient: FigmaReadClient;
      figmaGatewayService: FigmaGatewayService;
      figmaWriteService: FigmaWriteService;
      designContextService: DesignContextService;
      codeUiParserService: CodeUiParserService;
      figmaUiExtractorService: FigmaUiExtractorService;
      renderedUiExtractorService: RenderedUiExtractorService;
      browserRendererService: BrowserRendererService;
      renderedToCodeMapperService: RenderedToCodeMapperService;
      codeToFigmaPipelineService: CodeToFigmaPipelineService;
      figmaToCodePipelineService: FigmaToCodePipelineService;
      reconcilePipelineService: ReconcilePipelineService;
      intentApiService: IntentApiService;
      selectorResolverService: SelectorResolverService;
      aliasRegistry: AliasRegistry;
      aliasService: AliasService;
      pluginBridgeService: PluginBridgeService;
      uiBlockRegistry: UiBlockRegistry;
      uiBlockService: UiBlockService;
      uiMappingRegistry: UiMappingRegistry;
      uiMappingService: UiMappingService;
      designTokenRegistry: DesignTokenRegistry;
      designTokenService: DesignTokenService;
      assetRegistry: AssetRegistry;
      assetRegistryService: ReturnType<typeof import('../core/asset-registry').createAssetRegistryService>;
      writeRuntime: {
        enabled: boolean;
        allowedOperations: FigmaWriteOperation[];
      };
    }
  }
}

export {};
