import { z } from 'zod';

import type { AliasRegistry } from './alias-registry';
import { AppError } from './errors';
import {
  FIGMA_WRITE_OPERATIONS,
  assertDryRunAwareContext,
  createDryRunResult,
  createExecutedResult,
  type ApplyStyleFromAliasInput,
  type CreateFrameInput,
  type CreateSectionInput,
  type DuplicateBlockInput,
  type FigmaWriteAdapter,
  type FigmaWriteContext,
  type FigmaWriteOperation,
  type FigmaWriteRequest,
  type FigmaWriteService,
  type UpdateTextInput
} from './figma-write-types';

const nonEmptyString = z.string().trim().min(1);

export const writeRequestMetaSchema = z.object({
  dryRun: z.coerce.boolean().default(true),
  reason: z.string().trim().min(1).max(500).optional()
});

export const createFrameSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  parentNodeId: nonEmptyString.optional(),
  name: z.string().trim().min(1).max(200),
  width: z.coerce.number().positive().max(100000),
  height: z.coerce.number().positive().max(100000),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const updateTextSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  nodeId: nonEmptyString,
  text: z.string().min(1).max(10000),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const createSectionSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  parentNodeId: nonEmptyString.optional(),
  name: z.string().trim().min(1).max(200),
  width: z.coerce.number().positive().max(100000).optional(),
  height: z.coerce.number().positive().max(100000).optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const duplicateBlockSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  nodeId: nonEmptyString,
  targetParentNodeId: nonEmptyString.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const applyStyleFromAliasSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  alias: z.string().trim().min(1).max(200),
  nodeId: nonEmptyString,
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const createPageSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(1).optional(),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const createFileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  projectId: nonEmptyString.optional(),
  dryRun: writeRequestMetaSchema.shape.dryRun,
  reason: writeRequestMetaSchema.shape.reason
});

export const pluginCommandStepSchema = z.object({
  type: z.string().trim().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const executePluginCommandSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  command: pluginCommandStepSchema,
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

export const executePluginBatchSchema = z.object({
  fileKey: nonEmptyString.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).optional(),
  commands: z.array(pluginCommandStepSchema).min(1).max(100),
  dryRun: z.coerce.boolean().default(false),
  reason: writeRequestMetaSchema.shape.reason
});

type ServiceOptions = {
  aliasRegistry: AliasRegistry;
  adapter: FigmaWriteAdapter;
  enabled: boolean;
  allowedOperations: FigmaWriteOperation[];
};

const SUPPORTED_OPERATION_SET = new Set<FigmaWriteOperation>(FIGMA_WRITE_OPERATIONS);

const normalizeAllowedOperations = (operations: string[]): FigmaWriteOperation[] => {
  const result = operations
    .map((operation) => operation.trim())
    .filter((operation): operation is FigmaWriteOperation => SUPPORTED_OPERATION_SET.has(operation as FigmaWriteOperation));

  return Array.from(new Set(result));
};

const assertWriteEnabled = (enabled: boolean, context: FigmaWriteContext): void => {
  if (!enabled && !context.dryRun) {
    throw new AppError('Write actions are disabled', 403, 'WRITE_ACTIONS_DISABLED');
  }
};

const assertOperationAllowed = (
  operation: FigmaWriteOperation,
  allowedOperations: FigmaWriteOperation[]
): void => {
  if (!allowedOperations.includes(operation)) {
    throw new AppError(`Write operation is not allowed: ${operation}`, 403, 'WRITE_OPERATION_NOT_ALLOWED');
  }
};

const buildContext = (
  meta: z.infer<typeof writeRequestMetaSchema>,
  actor: FigmaWriteContext['actor']
): FigmaWriteContext => ({
  actor,
  dryRun: meta.dryRun,
  reason: meta.reason
});

const createUnsupportedWriteAdapter = (): FigmaWriteAdapter => {
  const notConfigured = async () => {
    throw new AppError('Live write adapter is not configured', 501, 'WRITE_BACKEND_NOT_CONFIGURED');
  };

  return {
    createFrame: notConfigured,
    updateText: notConfigured,
    createSection: notConfigured,
    duplicateBlock: notConfigured,
    applyStyleFromAlias: notConfigured
  };
};

export const createDefaultFigmaWriteAdapter = createUnsupportedWriteAdapter;

export const parseAllowedWriteOperations = (value: string): FigmaWriteOperation[] =>
  normalizeAllowedOperations(value.split(','));

export const defaultAllowedWriteOperations = [...FIGMA_WRITE_OPERATIONS];

export const createFigmaWriteService = (options: ServiceOptions): FigmaWriteService => {
  const allowedOperations = normalizeAllowedOperations(options.allowedOperations);
  const adapter = options.adapter ?? createUnsupportedWriteAdapter();

  const executeOrDryRun = async <TRequestInput, TAdapterPayload>(
    request: FigmaWriteRequest<TRequestInput, FigmaWriteOperation>,
    context: FigmaWriteContext,
    adapterCall: () => Promise<TAdapterPayload>,
    dryRunPayload: unknown
  ) => {
    assertWriteEnabled(options.enabled, context);
    assertOperationAllowed(request.operation, allowedOperations);

    if (assertDryRunAwareContext(context) === 'dry-run') {
      return createDryRunResult(request.operation, dryRunPayload, [
        'Dry run enabled. No write operation was executed.',
        `Operation ${request.operation} passed validation and allowlist checks.`
      ]);
    }

    const payload = await adapterCall();
    return createExecutedResult(request.operation, payload);
  };

  return {
    async createFrame(
      request: FigmaWriteRequest<CreateFrameInput, 'create-frame'>,
      context: FigmaWriteContext
    ) {
      return executeOrDryRun(
        request,
        context,
        () => adapter.createFrame(request, context),
        request.input
      );
    },
    async updateText(
      request: FigmaWriteRequest<UpdateTextInput, 'update-text'>,
      context: FigmaWriteContext
    ) {
      return executeOrDryRun(
        request,
        context,
        () => adapter.updateText(request, context),
        request.input
      );
    },
    async createSection(
      request: FigmaWriteRequest<CreateSectionInput, 'create-section'>,
      context: FigmaWriteContext
    ) {
      return executeOrDryRun(
        request,
        context,
        () => adapter.createSection(request, context),
        request.input
      );
    },
    async duplicateBlock(
      request: FigmaWriteRequest<DuplicateBlockInput, 'duplicate-block'>,
      context: FigmaWriteContext
    ) {
      return executeOrDryRun(
        request,
        context,
        () => adapter.duplicateBlock(request, context),
        request.input
      );
    },
    async applyStyleFromAlias(
      request: FigmaWriteRequest<ApplyStyleFromAliasInput, 'apply-style-from-alias'>,
      context: FigmaWriteContext
    ) {
      const sourceAlias = options.aliasRegistry.resolve({ alias: request.input.alias });

      return executeOrDryRun(
        request,
        context,
        () =>
          adapter.applyStyleFromAlias(
            {
              operation: request.operation,
              input: {
                ...request.input,
                sourceAlias
              }
            },
            context
          ),
        {
          ...request.input,
          sourceAlias
        }
      );
    }
  };
};

export const buildWriteContextFromBody = <
  TBody extends z.infer<typeof writeRequestMetaSchema>,
  TActor extends FigmaWriteContext['actor']
>(
  body: TBody,
  actor: TActor
): FigmaWriteContext =>
  buildContext(
    {
      dryRun: body.dryRun,
      reason: body.reason
    },
    actor
  );
