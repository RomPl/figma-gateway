import type { McpServer } from '@modelcontextprotocol/server';
import type { ZodRawShape, ZodObject } from 'zod';

import type { AliasService } from '../../core/alias-registry';
import { auditMcpToolExecution, type AuditService } from '../../core/audit';
import type { DesignContextService } from '../../core/design-context';
import { AppError } from '../../core/errors';
import type { FigmaGatewayService } from '../../core/figma-gateway-service';
import type { FigmaWriteService } from '../../core/figma-write-types';

export type McpToolRegistrar = (
  server: McpServer,
  service: FigmaGatewayService,
  auditService: AuditService
) => void;
export type AliasMcpToolRegistrar = (
  server: McpServer,
  service: AliasService,
  auditService: AuditService
) => void;
export type DesignContextMcpToolRegistrar = (
  server: McpServer,
  service: DesignContextService,
  auditService: AuditService
) => void;
export type WriteMcpToolRegistrar = (
  server: McpServer,
  service: FigmaWriteService,
  auditService: AuditService
) => void;

export const createToolResult = (data: unknown) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(data, null, 2)
    }
  ]
});

export const createToolErrorResult = (error: unknown) => {
  const appError =
    error instanceof AppError ? error : new AppError('Internal server error', 500, 'INTERNAL_ERROR');

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            code: appError.code,
            message: appError.message
          },
          null,
          2
        )
      }
    ]
  };
};

export const registerGatewayTool = <TSchema extends ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TSchema;
    execute: (service: FigmaGatewayService, input: TSchema['_output']) => Promise<unknown>;
  },
  service: FigmaGatewayService,
  auditService: AuditService
): void => {
  const callback = async (input: TSchema['_output']) => {
    try {
      const data = await auditMcpToolExecution(auditService, name, input, () =>
        config.execute(service, input)
      );
      return createToolResult(data);
    } catch (error) {
      return createToolErrorResult(error);
    }
  };

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema
    },
    callback as any
  );
};

export const registerAliasTool = <TSchema extends ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TSchema;
    execute: (service: AliasService, input: TSchema['_output']) => Promise<unknown> | unknown;
  },
  service: AliasService,
  auditService: AuditService
): void => {
  const callback = async (input: TSchema['_output']) => {
    try {
      const data = await auditMcpToolExecution(auditService, name, input, () =>
        Promise.resolve(config.execute(service, input))
      );
      return createToolResult(data);
    } catch (error) {
      return createToolErrorResult(error);
    }
  };

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema
    },
    callback as any
  );
};

export const registerDesignContextTool = <TSchema extends ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TSchema;
    execute: (service: DesignContextService, input: TSchema['_output']) => Promise<unknown> | unknown;
  },
  service: DesignContextService,
  auditService: AuditService
): void => {
  const callback = async (input: TSchema['_output']) => {
    try {
      const data = await auditMcpToolExecution(auditService, name, input, () =>
        Promise.resolve(config.execute(service, input))
      );
      return createToolResult(data);
    } catch (error) {
      return createToolErrorResult(error);
    }
  };

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema
    },
    callback as any
  );
};

export const registerWriteTool = <TSchema extends ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: TSchema;
    execute: (service: FigmaWriteService, input: TSchema['_output']) => Promise<unknown> | unknown;
  },
  service: FigmaWriteService,
  auditService: AuditService
): void => {
  const callback = async (input: TSchema['_output']) => {
    try {
      const data = await auditMcpToolExecution(auditService, name, input, () =>
        Promise.resolve(config.execute(service, input))
      );
      return createToolResult(data);
    } catch (error) {
      return createToolErrorResult(error);
    }
  };

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema
    },
    callback as any
  );
};
