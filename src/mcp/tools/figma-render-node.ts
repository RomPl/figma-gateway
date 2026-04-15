import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { renderSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaRenderNodeTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_render_node',
    {
      title: 'Render Figma Nodes',
      description: 'Return image URLs for one or more Figma nodes.',
      inputSchema: renderSchema,
      execute: (gatewayService, input) => gatewayService.renderNodes(input)
    },
    service,
    auditService
  );
};
