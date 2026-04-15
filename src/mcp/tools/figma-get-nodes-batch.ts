import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { batchNodesSchema, type FigmaGatewayService } from '../../core/figma-gateway-service';
import { registerGatewayTool } from './helpers';

export const registerFigmaGetNodesBatchTool = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  registerGatewayTool(
    server,
    'figma_get_nodes_batch',
    {
      title: 'Get Figma Nodes Batch',
      description: 'Return multiple node payloads from the same Figma file.',
      inputSchema: batchNodesSchema,
      execute: (gatewayService, input) => gatewayService.getNodesBatch(input)
    },
    service,
    auditService
  );
};
