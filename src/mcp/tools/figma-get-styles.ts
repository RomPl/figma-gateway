import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { fileKeyParamsSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaGetStylesTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_get_styles',
    {
      title: 'Get Figma Styles',
      description: 'Return published styles for a Figma file.',
      inputSchema: fileKeyParamsSchema,
      execute: (gatewayService, input) => gatewayService.getStyles(input)
    },
    service,
    auditService
  );
};
