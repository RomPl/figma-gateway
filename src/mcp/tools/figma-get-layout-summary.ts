import type { McpServer } from '@modelcontextprotocol/server';

import type { AuditService } from '../../core/audit';
import { designContextSchema, type DesignContextService } from '../../core/design-context';
import { registerDesignContextTool } from './helpers';

export const registerFigmaGetLayoutSummaryTool = (
  server: McpServer,
  designContextService: DesignContextService,
  auditService: AuditService
): void => {
  registerDesignContextTool(
    server,
    'figma_get_layout_summary',
    {
      title: 'Get Layout Summary',
      description: 'Return compact layout-focused summary for a Figma node.',
      inputSchema: designContextSchema,
      execute: (service, input) => service.getLayoutSummary(input)
    },
    designContextService,
    auditService
  );
};
