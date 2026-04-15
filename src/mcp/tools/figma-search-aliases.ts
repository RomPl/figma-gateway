import type { McpServer } from '@modelcontextprotocol/server';

import { searchAliasesSchema, type AliasService } from '../../core/alias-registry';
import type { AuditService } from '../../core/audit';
import { registerAliasTool } from './helpers';

export const registerFigmaSearchAliasesTool = (
  server: McpServer,
  aliasService: AliasService,
  auditService: AuditService
): void => {
  registerAliasTool(
    server,
    'figma_search_aliases',
    {
      title: 'Search Aliases',
      description: 'Search alias registry by query, project and tags.',
      inputSchema: searchAliasesSchema,
      execute: (service, input) => service.searchAliases(input)
    },
    aliasService,
    auditService
  );
};
