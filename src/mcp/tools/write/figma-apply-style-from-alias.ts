import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../../core/audit';
import { applyStyleFromAliasSchema, buildWriteContextFromBody } from '../../../core/figma-write-service';
import type { FigmaWriteService } from '../../../core/figma-write-types';
import { registerWriteTool } from '../helpers';

export const registerFigmaApplyStyleFromAliasTool = (
  server: McpServer,
  service: FigmaWriteService,
  auditService: AuditService
): void => {
  registerWriteTool(
    server,
    'figma_apply_style_from_alias',
    {
      title: 'Apply Figma Style From Alias',
      description:
        'Apply an alias-mapped style in an explicit target file. Use dryRun=false only when the user explicitly asked to perform the write. For auto-session execution, use the plugin bridge API.',
      inputSchema: applyStyleFromAliasSchema,
      execute: (writeService, input) => {
        if (!input.fileKey) {
          throw new Error(
            'figma_apply_style_from_alias via MCP currently requires explicit fileKey. Use the plugin bridge applyStyleFromAlias API for auto-session execution.'
          );
        }
        return writeService.applyStyleFromAlias(
          {
            operation: 'apply-style-from-alias',
            input: {
              fileKey: input.fileKey,
              alias: input.alias,
              nodeId: input.nodeId
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
