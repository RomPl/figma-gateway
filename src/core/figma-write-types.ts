import type { AuditActor } from './audit';
import type { AliasRecord } from './alias-registry';

export const FIGMA_WRITE_OPERATIONS = [
  'create-frame',
  'update-text',
  'create-section',
  'duplicate-block',
  'apply-style-from-alias',
  'execute-plugin-command',
  'execute-plugin-batch'
] as const;

export const FIGMA_LOW_LEVEL_COMMAND_TYPES = [
  'create_frame',
  'create_frame_rich',
  'create_section',
  'create_text',
  'create_text_rich',
  'create_group',
  'move_node',
  'delete_node',
  'rename_node',
  'set_fill',
  'set_stroke',
  'set_corner_radius',
  'set_opacity',
  'set_size',
  'set_position',
  'set_text_content',
  'set_text_style',
  'set_auto_layout',
  'set_padding',
  'set_spacing',
  'set_alignment',
  'set_constraints',
  'set_layout_sizing',
  'set_visibility',
  'set_plugin_data',
  'get_plugin_data',
  'find_nodes',
  'delete_matching_nodes',
  'export_ui_snapshot',
  'export_node_snapshot',
  'export_design_system_snapshot',
  'export_node_as_image',
  'set_effects',
  'set_asset_reference',
  'set_icon_reference',
  'debug_runtime_info'
] as const;

export type FigmaWriteOperation = (typeof FIGMA_WRITE_OPERATIONS)[number];
export type FigmaLowLevelCommandType = (typeof FIGMA_LOW_LEVEL_COMMAND_TYPES)[number];
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
  result?: unknown;
};

export type FigmaWriteRequest<TInput, TOperation extends FigmaWriteOperation = FigmaWriteOperation> = {
  operation: TOperation;
  input: TInput;
};

export type FigmaCommandStep = {
  type: FigmaLowLevelCommandType;
  payload?: Record<string, unknown>;
};

export type FigmaCommandResultStatus = 'ok' | 'error';

export type FigmaCommandError = {
  code: string;
  message: string;
  details?: unknown;
};

export type FigmaCommandResult = {
  commandType: FigmaLowLevelCommandType | string;
  status: FigmaCommandResultStatus;
  nodeId?: string | null;
  data?: unknown;
  error?: FigmaCommandError;
};

export type CreateFrameInput = {
  fileKey?: string;
  parentNodeId?: string;
  uiId?: string;
  name: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export type UpdateTextInput = {
  fileKey?: string;
  nodeId: string;
  text: string;
};

export type CreateSectionInput = {
  fileKey?: string;
  parentNodeId?: string;
  uiId?: string;
  name: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};

export type DuplicateBlockInput = {
  fileKey?: string;
  nodeId: string;
  targetParentNodeId?: string;
  name?: string;
  x?: number;
  y?: number;
};

export type ApplyStyleFromAliasInput = {
  fileKey?: string;
  nodeId: string;
  alias: string;
};

export type ApplyStyleResolvedInput = ApplyStyleFromAliasInput & {
  sourceAlias: AliasRecord;
};

export type ExecutePluginCommandInput = {
  fileKey?: string;
  command: FigmaCommandStep;
};

export type ExecutePluginBatchInput = {
  fileKey?: string;
  commands: FigmaCommandStep[];
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
  executePluginCommand(
    request: FigmaWriteRequest<ExecutePluginCommandInput, 'execute-plugin-command'>,
    context: FigmaWriteContext
  ): Promise<FigmaCommandResult>;
  executePluginBatch(
    request: FigmaWriteRequest<ExecutePluginBatchInput, 'execute-plugin-batch'>,
    context: FigmaWriteContext
  ): Promise<{ results: FigmaCommandResult[] }>;
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
  executePluginCommand(
    request: FigmaWriteRequest<ExecutePluginCommandInput, 'execute-plugin-command'>,
    context: FigmaWriteContext
  ): Promise<FigmaWriteResult>;
  executePluginBatch(
    request: FigmaWriteRequest<ExecutePluginBatchInput, 'execute-plugin-batch'>,
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
