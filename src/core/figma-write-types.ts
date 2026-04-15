import type { AuditActor } from './audit';
import type { AliasRecord } from './alias-registry';

export const FIGMA_WRITE_OPERATIONS = [
  'create-frame',
  'update-text',
  'create-section',
  'duplicate-block',
  'apply-style-from-alias'
] as const;

export type FigmaWriteOperation = (typeof FIGMA_WRITE_OPERATIONS)[number];
export type FigmaWriteMode = 'dry-run' | 'execute';

export type FigmaWriteContext = {
  actor: AuditActor;
  dryRun: boolean;
  reason?: string;
};

export type FigmaWriteResult<TPayload = unknown> = {
  operation: FigmaWriteOperation;
  performed: boolean;
  dryRun: boolean;
  payload?: TPayload;
  notes: string[];
};

export type FigmaWriteRequest<TInput, TOperation extends FigmaWriteOperation = FigmaWriteOperation> = {
  operation: TOperation;
  input: TInput;
};

export type CreateFrameInput = {
  fileKey: string;
  parentNodeId: string;
  name: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export type UpdateTextInput = {
  fileKey: string;
  nodeId: string;
  text: string;
};

export type CreateSectionInput = {
  fileKey: string;
  parentNodeId: string;
  name: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};

export type DuplicateBlockInput = {
  fileKey: string;
  nodeId: string;
  targetParentNodeId?: string;
  name?: string;
  x?: number;
  y?: number;
};

export type ApplyStyleFromAliasInput = {
  fileKey: string;
  nodeId: string;
  alias: string;
};

export type ApplyStyleResolvedInput = ApplyStyleFromAliasInput & {
  sourceAlias: AliasRecord;
};

export type FigmaWriteAdapter = {
  createFrame(
    request: FigmaWriteRequest<CreateFrameInput, 'create-frame'>,
    context: FigmaWriteContext
  ): Promise<unknown>;
  updateText(
    request: FigmaWriteRequest<UpdateTextInput, 'update-text'>,
    context: FigmaWriteContext
  ): Promise<unknown>;
  createSection(
    request: FigmaWriteRequest<CreateSectionInput, 'create-section'>,
    context: FigmaWriteContext
  ): Promise<unknown>;
  duplicateBlock(
    request: FigmaWriteRequest<DuplicateBlockInput, 'duplicate-block'>,
    context: FigmaWriteContext
  ): Promise<unknown>;
  applyStyleFromAlias(
    request: FigmaWriteRequest<ApplyStyleResolvedInput, 'apply-style-from-alias'>,
    context: FigmaWriteContext
  ): Promise<unknown>;
};

export interface FigmaWriteService {
  createFrame(
    request: FigmaWriteRequest<CreateFrameInput, 'create-frame'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
  updateText(
    request: FigmaWriteRequest<UpdateTextInput, 'update-text'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
  createSection(
    request: FigmaWriteRequest<CreateSectionInput, 'create-section'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
  duplicateBlock(
    request: FigmaWriteRequest<DuplicateBlockInput, 'duplicate-block'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
  applyStyleFromAlias(
    request: FigmaWriteRequest<ApplyStyleFromAliasInput, 'apply-style-from-alias'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
}

export const createDryRunResult = <TPayload = unknown>(
  operation: FigmaWriteOperation,
  payload?: TPayload,
  notes: string[] = ['Dry run enabled. No write operation was executed.']
): FigmaWriteResult<TPayload> => ({
  operation,
  performed: false,
  dryRun: true,
  payload,
  notes
});

export const createExecutedResult = <TPayload = unknown>(
  operation: FigmaWriteOperation,
  payload?: TPayload,
  notes: string[] = []
): FigmaWriteResult<TPayload> => ({
  operation,
  performed: true,
  dryRun: false,
  payload,
  notes
});

export const assertDryRunAwareContext = (context: FigmaWriteContext): FigmaWriteMode =>
  context.dryRun ? 'dry-run' : 'execute';
