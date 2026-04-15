import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { fileKeyParamsSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaGetFileTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_get_file',
    {
      title: 'Get Figma File',
      description: 'Return raw file data for a Figma file key.',
      inputSchema: fileKeyParamsSchema,
      execute: (gatewayService, input) => gatewayService.getFile(input)
    },
    service,
    auditService
  );
};
