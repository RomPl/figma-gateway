import type { McpServer } from '@modelcontextprotocol/server';

import type { AliasService } from '../../core/alias-registry';
import type { AuditService } from '../../core/audit';
import type { DesignContextService } from '../../core/design-context';
import type { FigmaGatewayService } from '../../core/figma-gateway-service';
import type { FigmaWriteService } from '../../core/figma-write-types';
import { registerFigmaGetDesignBlockTool } from './figma-get-design-block';
import { registerFigmaGetDesignContextTool } from './figma-get-design-context';
import { registerFigmaGetComponentsTool } from './figma-get-components';
import { registerFigmaGetFileTool } from './figma-get-file';
import { registerFigmaGetLayoutSummaryTool } from './figma-get-layout-summary';
import { registerFigmaGetNodeTool } from './figma-get-node';
import { registerFigmaGetNodesBatchTool } from './figma-get-nodes-batch';
import { registerFigmaResolveAliasTool } from './figma-resolve-alias';
import { registerFigmaGetStylesTool } from './figma-get-styles';
import { registerFigmaRenderNodeTool } from './figma-render-node';
import { registerFigmaSearchAliasesTool } from './figma-search-aliases';
import { registerFigmaSearchByNameTool } from './figma-search-by-name';
import { registerFigmaSearchByTextTool } from './figma-search-by-text';
import { registerFigmaApplyStyleFromAliasTool } from './write/figma-apply-style-from-alias';
import { registerFigmaCreateFrameTool } from './write/figma-create-frame';
import { registerFigmaDuplicateBlockTool } from './write/figma-duplicate-block';
import { registerFigmaUpdateTextTool } from './write/figma-update-text';

export const registerFigmaTools = (
  server: McpServer,
  service: FigmaGatewayService,
  aliasService: AliasService,
  designContextService: DesignContextService,
  writeService: FigmaWriteService,
  auditService: AuditService
): void => {
  registerFigmaGetFileTool(server, service, auditService);
  registerFigmaGetNodeTool(server, service, auditService);
  registerFigmaGetNodesBatchTool(server, service, auditService);
  registerFigmaGetStylesTool(server, service, auditService);
  registerFigmaGetComponentsTool(server, service, auditService);
  registerFigmaRenderNodeTool(server, service, auditService);
  registerFigmaSearchByNameTool(server, service, auditService);
  registerFigmaSearchByTextTool(server, service, auditService);
  registerFigmaResolveAliasTool(server, aliasService, auditService);
  registerFigmaSearchAliasesTool(server, aliasService, auditService);
  registerFigmaGetDesignBlockTool(server, aliasService, auditService);
  registerFigmaGetDesignContextTool(server, designContextService, auditService);
  registerFigmaGetLayoutSummaryTool(server, designContextService, auditService);
  registerFigmaCreateFrameTool(server, writeService, auditService);
  registerFigmaUpdateTextTool(server, writeService, auditService);
  registerFigmaDuplicateBlockTool(server, writeService, auditService);
  registerFigmaApplyStyleFromAliasTool(server, writeService, auditService);
};
