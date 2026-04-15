import type { McpServer } from '@modelcontextprotocol/server';

import { resolveAliasSchema, type AliasService } from '../../core/alias-registry';
import type { AuditService } from '../../core/audit';
import { registerAliasTool } from './helpers';

export const registerFigmaResolveAliasTool = (
  server: McpServer,
  aliasService: AliasService,
  auditService: AuditService
): void => {
  registerAliasTool(
    server,
    'figma_resolve_alias',
    {
      title: 'Resolve Alias',
      description: 'Resolve a human-readable alias to fileKey and nodeId.',
      inputSchema: resolveAliasSchema,
      execute: (service, input) => service.resolveAlias(input)
    },
    aliasService,
    auditService
  );
};
