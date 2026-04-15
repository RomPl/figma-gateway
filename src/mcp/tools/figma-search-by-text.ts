import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { searchSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaSearchByTextTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_search_by_text',
    {
      title: 'Search Figma By Text',
      description: 'Case-insensitive substring search against text node characters in a Figma file.',
      inputSchema: searchSchema,
      execute: (gatewayService, input) => gatewayService.searchByText(input)
    },
    service,
    auditService
  );
};
