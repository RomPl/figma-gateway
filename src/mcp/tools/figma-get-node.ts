import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { fileNodeParamsSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaGetNodeTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_get_node',
    {
      title: 'Get Figma Node',
      description: 'Return a single node from a Figma file.',
      inputSchema: fileNodeParamsSchema,
      execute: (gatewayService, input) => gatewayService.getNode(input)
    },
    service,
    auditService
  );
};
