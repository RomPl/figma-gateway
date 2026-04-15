import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { searchSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaSearchByNameTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_search_by_name',
    {
      title: 'Search Figma By Name',
      description: 'Case-insensitive substring search against node names in a Figma file.',
      inputSchema: searchSchema,
      execute: (gatewayService, input) => gatewayService.searchByName(input)
    },
    service,
    auditService
  );
};
