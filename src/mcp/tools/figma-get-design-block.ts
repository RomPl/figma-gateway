import type { McpServer } from '@modelcontextprotocol/server';

import { resolveAliasSchema, type AliasService } from '../../core/alias-registry';
import type { AuditService } from '../../core/audit';
import { registerAliasTool } from './helpers';

export const registerFigmaGetDesignBlockTool = (
  server: McpServer,
  aliasService: AliasService,
  auditService: AuditService
): void => {
  registerAliasTool(
    server,
    'figma_get_design_block',
    {
      title: 'Get Design Block',
      description: 'Resolve alias and return the linked Figma node payload.',
      inputSchema: resolveAliasSchema,
      execute: (service, input) => service.getDesignBlock(input)
    },
    aliasService,
    auditService
  );
};
