import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { fileKeyParamsSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaGetComponentsTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_get_components',
    {
      title: 'Get Figma Components',
      description: 'Return published components for a Figma file.',
      inputSchema: fileKeyParamsSchema,
      execute: (gatewayService, input) => gatewayService.getComponents(input)
    },
    service,
    auditService
  );
};
