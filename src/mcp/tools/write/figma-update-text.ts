import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../../core/audit';
import { buildWriteContextFromBody, updateTextSchema } from '../../../core/figma-write-service';
import type { FigmaWriteService } from '../../../core/figma-write-types';
import { registerWriteTool } from '../helpers';

export const registerFigmaUpdateTextTool = (
  server: McpServer,
  service: FigmaWriteService,
  auditService: AuditService
): void => {
  registerWriteTool(
    server,
    'figma_update_text',
    {
      title: 'Update Figma Text',
      description:
        'Update text in the currently connected Figma plugin bridge session or inside an explicit target file. Use dryRun=false only when the user explicitly asked to perform the write.',
      inputSchema: updateTextSchema,
      execute: (writeService, input) => {
        if (!input.fileKey) {
          throw new Error(
            'figma_update_text via MCP currently requires explicit fileKey. Use the plugin bridge updateText API for auto-session execution.'
          );
        }
        return writeService.updateText(
          {
            operation: 'update-text',
            input: {
              fileKey: input.fileKey,
              nodeId: input.nodeId,
              text: input.text
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
