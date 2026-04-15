import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../../core/audit';
import { buildWriteContextFromBody, createFrameSchema } from '../../../core/figma-write-service';
import type { FigmaWriteService } from '../../../core/figma-write-types';
import { registerWriteTool } from '../helpers';

export const registerFigmaCreateFrameTool = (
  server: McpServer,
  service: FigmaWriteService,
  auditService: AuditService
): void => {
  registerWriteTool(
    server,
    'figma_create_frame',
    {
      title: 'Create Figma Frame',
      description:
        'Create a frame in the currently connected Figma plugin bridge session or inside an explicit target file. Use dryRun=false only when the user explicitly asked to perform the write.',
      inputSchema: createFrameSchema,
      execute: (writeService, input) => {
        if (!input.fileKey || !input.parentNodeId) {
          throw new Error(
            'figma_create_frame via MCP currently requires explicit fileKey and parentNodeId. Use the plugin bridge createFrame API for auto-session execution.'
          );
        }
        return writeService.createFrame(
          {
            operation: 'create-frame',
            input: {
              fileKey: input.fileKey,
              parentNodeId: input.parentNodeId,
              name: input.name,
              width: input.width,
              height: input.height,
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
