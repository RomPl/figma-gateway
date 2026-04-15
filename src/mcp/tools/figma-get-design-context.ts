import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { designContextSchema, type DesignContextService } from '../../core/design-context';
import { registerDesignContextTool } from './helpers';

export const registerFigmaGetDesignContextTool = (
  server: McpServer,
  designContextService: DesignContextService,
  auditService: AuditService
): void => {
  registerDesignContextTool(
    server,
    'figma_get_design_context',
    {
      title: 'Get Design Context',
      description: 'Return compact implementation-oriented context for a Figma node.',
      inputSchema: designContextSchema,
      execute: (service, input) => service.getDesignContext(input)
    },
    designContextService,
    auditService
  );
};
