import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../../core/audit';
import { buildWriteContextFromBody, duplicateBlockSchema } from '../../../core/figma-write-service';
import type { FigmaWriteService } from '../../../core/figma-write-types';
import { registerWriteTool } from '../helpers';

export const registerFigmaDuplicateBlockTool = (
  server: McpServer,
  service: FigmaWriteService,
  auditService: AuditService
): void => {
  registerWriteTool(
    server,
    'figma_duplicate_block',
    {
      title: 'Duplicate Figma Block',
      description:
        'Duplicate a node in the currently connected Figma plugin bridge session or inside an explicit target file. Use dryRun=false only when the user explicitly asked to perform the write.',
      inputSchema: duplicateBlockSchema,
      execute: (writeService, input) => {
        if (!input.fileKey) {
          throw new Error(
            'figma_duplicate_block via MCP currently requires explicit fileKey. Use the plugin bridge duplicateBlock API for auto-session execution.'
          );
        }
        return writeService.duplicateBlock(
          {
            operation: 'duplicate-block',
            input: {
              fileKey: input.fileKey,
              nodeId: input.nodeId,
              targetParentNodeId: input.targetParentNodeId,
              name: input.name,
              x: input.x,
              y: input.y
            }
          },
          buildWriteContextFromBody(input, {
            type: 'mcp-client',
            id: 'mcp-client'
          })
        );
      }
    },
    service,
    auditService
  );
};
