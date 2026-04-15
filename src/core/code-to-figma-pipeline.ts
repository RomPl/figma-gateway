import { createHash } from 'node:crypto';
import { z } from 'zod';

import { AppError } from './errors';
import type { CodeUiParserService } from './code-ui-parser';
import type { FigmaCommandStep } from './figma-write-types';
import type { PluginBridgeService } from './plugin-bridge';
import type { UiModelDocument, UiNode } from './ui-model';
import type { UiMappingService } from './ui-mapping-registry';

export const codeToFigmaPipelineSchema = z.object({
  project: z.string().trim().min(1).max(128),
  fileKey: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  componentName: z.string().trim().min(1).optional(),
  filePath: z.string().trim().min(1).optional(),
  rootDir: z.string().trim().min(1).optional(),
  parentNodeId: z.string().trim().min(1).optional(),
  uiIds: z.array(z.string().trim().min(1)).max(200).optional(),
  dryRun: z.coerce.boolean().default(false)
});

export type PlannerActionType =
  | 'create_section'
  | 'create_frame'
  | 'create_text'
  | 'set_auto_layout'
  | 'set_fill'
  | 'set_text_style'
  | 'move_node';

export type PlannerAction = {
  id: string;
  type: PlannerActionType;
  uiId: string;
  payload: Record<string, unknown>;
};

export type CodeToFigmaExecutionPlan = {
  componentName: string;
  filePath: string;
  model: UiModelDocument;
  actions: PlannerAction[];
  commands: FigmaCommandStep[];
};

export type CodeToFigmaPipelineResult = {
  componentName: string;
  filePath: string;
  model: UiModelDocument;
  plan: CodeToFigmaExecutionPlan;
  queued?: {
    sessionId: string;
    commandId: string;
    status: string;
  };
  mappingCount: number;
  notes: string[];
};

const makeHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const getTokenBinding = (node: UiNode, key: string): Record<string, unknown> | undefined => {
  const bindings = node.meta && typeof node.meta.tokenBindings === 'object' ? node.meta.tokenBindings as Record<string, unknown> : undefined;
  return bindings && typeof bindings[key] === 'object' ? bindings[key] as Record<string, unknown> : undefined;
};

const findNodeByUiId = (node: UiNode, uiId: string): UiNode | null => {
  if (node.uiId === uiId) return node;
  for (const child of node.children) {
    const found = findNodeByUiId(child, uiId);
    if (found) return found;
  }
  return null;
};

const inferContainerCommand = (node: UiNode, isRoot: boolean): PlannerActionType => {
  if (node.kind === 'section' || isRoot) return 'create_section';
  return 'create_frame';
};

const lowerFill = (fill: UiNode['style'] extends infer T ? any : never, tokenBinding?: Record<string, unknown>): unknown[] | undefined => {
  if (!fill && !tokenBinding) return undefined;
  const raw = typeof fill === 'string' ? fill : fill?.value ?? (typeof tokenBinding?.raw === 'string' ? tokenBinding.raw : undefined);
  if (!raw || typeof raw !== 'string') return undefined;
  const hex = raw.startsWith('#') ? raw.slice(1) : null;
  if (!hex || (hex.length !== 6 && hex.length !== 3)) return undefined;
  const normalized = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return [{ type: 'SOLID', color: { r, g, b }, opacity: typeof fill === 'object' && fill.opacity !== undefined ? fill.opacity : 1 }];
};

const planNode = (
  node: UiNode,
  parentRef: string | undefined,
  actions: PlannerAction[],
  commands: FigmaCommandStep[],
  isRoot = false
): void => {
  const ref = node.uiId;
  if (node.kind === 'text') {
    actions.push({ id: `${ref}:create_text`, type: 'create_text', uiId: node.uiId, payload: { ref, parentRef, uiId: node.uiId, name: node.name ?? node.uiId, text: node.text ?? '' } });
    commands.push({ type: 'create_text', payload: { ref, parentRef, uiId: node.uiId, name: node.name ?? node.uiId, text: node.text ?? '' } });
    if (node.style?.fill) {
      actions.push({ id: `${ref}:fill`, type: 'set_fill', uiId: node.uiId, payload: { nodeRef: ref } });
      commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: lowerFill(node.style.fill, getTokenBinding(node, 'fill')), token: node.tokens?.fill, figmaVariableId: getTokenBinding(node, 'fill')?.figmaVariableId, figmaStyleId: getTokenBinding(node, 'fill')?.figmaStyleId } });
    }
    if (node.style?.text) {
      actions.push({ id: `${ref}:text_style`, type: 'set_text_style', uiId: node.uiId, payload: { nodeRef: ref } });
      commands.push({
        type: 'set_text_style',
        payload: {
          nodeRef: ref,
          fontFamily: node.style.text.fontFamily,
          fontStyle: node.style.text.fontStyle,
          fontSize: node.style.text.fontSize,
          textAlignHorizontal:
            node.style.text.textAlign === 'center'
              ? 'CENTER'
              : node.style.text.textAlign === 'right'
                ? 'RIGHT'
                : node.style.text.textAlign === 'justify'
                  ? 'JUSTIFIED'
                  : 'LEFT'
        }
      });
    }
    return;
  }

  const createType = inferContainerCommand(node, isRoot);
  actions.push({
    id: `${ref}:create`,
    type: createType,
    uiId: node.uiId,
    payload: {
      ref,
      parentRef,
      uiId: node.uiId,
      name: node.name ?? node.uiId,
      width: node.size?.width ?? (isRoot ? 1440 : 320),
      height: node.size?.height ?? (isRoot ? 900 : 120)
    }
  });
  commands.push({
    type: createType,
    payload: {
      ref,
      parentRef,
      uiId: node.uiId,
      name: node.name ?? node.uiId,
      width: node.size?.width ?? (isRoot ? 1440 : 320),
      height: node.size?.height ?? (isRoot ? 900 : 120)
    }
  });

  if (node.layout || node.spacing !== undefined) {
    actions.push({ id: `${ref}:auto_layout`, type: 'set_auto_layout', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({
      type: 'set_auto_layout',
      payload: {
        nodeRef: ref,
        layoutMode:
          node.layout?.type === 'vertical'
            ? 'VERTICAL'
            : node.layout?.type === 'horizontal'
              ? 'HORIZONTAL'
              : node.children.length > 0
                ? 'VERTICAL'
                : 'NONE',
        itemSpacing: node.layout?.gap ?? node.spacing,
        primaryAxisAlignItems:
          node.layout?.alignment?.primary === 'center'
            ? 'CENTER'
            : node.layout?.alignment?.primary === 'end'
              ? 'MAX'
              : node.layout?.alignment?.primary === 'space-between'
                ? 'SPACE_BETWEEN'
                : 'MIN',
        counterAxisAlignItems:
          node.layout?.alignment?.cross === 'center'
            ? 'CENTER'
            : node.layout?.alignment?.cross === 'end'
              ? 'MAX'
              : node.layout?.alignment?.cross === 'stretch'
                ? 'STRETCH'
                : 'MIN'
      }
    });
  }

  if (node.padding) {
    commands.push({
      type: 'set_padding',
      payload: {
        nodeRef: ref,
        paddingTop: node.padding.top,
        paddingRight: node.padding.right,
        paddingBottom: node.padding.bottom,
        paddingLeft: node.padding.left
      }
    });
  }

  if (node.style?.fill) {
    actions.push({ id: `${ref}:fill`, type: 'set_fill', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: lowerFill(node.style.fill, getTokenBinding(node, 'fill')), token: node.tokens?.fill, figmaVariableId: getTokenBinding(node, 'fill')?.figmaVariableId, figmaStyleId: getTokenBinding(node, 'fill')?.figmaStyleId } });
  }

  if (node.style?.radius !== undefined) {
    commands.push({ type: 'set_corner_radius', payload: { nodeRef: ref, cornerRadius: node.style.radius } });
  }

  if (node.position && !isRoot) {
    actions.push({ id: `${ref}:move`, type: 'move_node', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'move_node', payload: { nodeRef: ref, x: node.position.x, y: node.position.y } });
  }

  if (node.kind === 'button') {
    const labelUiId = `${node.uiId}.label`;
    commands.push({ type: 'create_text', payload: { ref: labelUiId, parentRef: ref, uiId: labelUiId, name: 'Button Label', text: node.text ?? node.name ?? 'Button' } });
  }

  for (const child of node.children) {
    planNode(child, ref, actions, commands, false);
  }
};

export const buildCodeToFigmaPlan = (model: UiModelDocument, componentName: string, filePath: string): CodeToFigmaExecutionPlan => {
  const actions: PlannerAction[] = [];
  const commands: FigmaCommandStep[] = [];
  planNode(model.root, undefined, actions, commands, true);
  return {
    componentName,
    filePath,
    model,
    actions,
    commands
  };
};

export class CodeToFigmaPipelineService {
  constructor(
    private readonly codeUiParserService: CodeUiParserService,
    private readonly pluginBridgeService: PluginBridgeService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public run(input: z.input<typeof codeToFigmaPipelineSchema>): CodeToFigmaPipelineResult {
    const data = codeToFigmaPipelineSchema.parse(input);
    const parsed = this.codeUiParserService.parseProject({
      rootDir: data.rootDir,
      project: data.project,
      componentName: data.componentName,
      filePath: data.filePath,
      limit: 1
    });
    const component = parsed.components[0];
    if (!component) {
      throw new AppError('No React component was parsed for Code → Figma pipeline', 404, 'CODE_UI_COMPONENT_NOT_FOUND');
    }

    const model = data.uiIds?.length ? { version: 'ui-model.v1' as const, root: findNodeByUiId(component.tree.root, data.uiIds[0]) ?? component.tree.root } : component.tree;
    const plan = buildCodeToFigmaPlan(model, component.componentName, component.filePath);
    const notes: string[] = [
      'Code UI model parsed successfully.',
      'Execution plan translated into Figma plugin batch commands.',
      'Mappings were recorded using stable uiId entries.'
    ];

    let queued: CodeToFigmaPipelineResult['queued'];
    if (!data.dryRun) {
      const session = this.pluginBridgeService.resolveSession({
        sessionId: data.sessionId,
        fileKey: data.fileKey,
        clientName: data.clientName
      });
      const command = this.pluginBridgeService.queueExecutePluginBatch({
        sessionId: session.sessionId,
        fileKey: data.fileKey ?? session.fileKey,
        commands: plan.commands,
        actorId: 'code-to-figma-pipeline'
      });
      queued = {
        sessionId: session.sessionId,
        commandId: command.commandId,
        status: command.status
      };
    }

    const nodes: UiNode[] = [];
    const walk = (node: UiNode) => { nodes.push(node); node.children.forEach(walk); };
    walk(plan.model.root);
    for (const node of nodes) {
      this.uiMappingService.upsertUiMapping({
        uiId: node.uiId,
        project: data.project,
        semanticRole: node.role,
        code: {
          file: node.source?.codePath ?? component.filePath,
          component: node.source?.codeExportName ?? component.componentName,
          selector: node.source?.codeSelector,
          sourceRange: node.source?.lineStart && node.source?.lineEnd ? { lineStart: node.source.lineStart, lineEnd: node.source.lineEnd } : undefined,
          jsxPath: node.source?.jsxPath,
          snapshotHash: makeHash(node),
          snapshot: node as unknown as Record<string, unknown>
        },
        figma: {
          fileKey: data.fileKey ?? 'pending',
          nodeId: `pending:${node.uiId}`,
          snapshotHash: undefined,
          snapshot: {}
        },
        sync: {
          lastDirection: 'code_to_figma',
          lastSyncedAt: new Date().toISOString(),
          lastCodeHash: makeHash(node),
          lastFigmaHash: undefined
        }
      });
    }

    return {
      componentName: component.componentName,
      filePath: component.filePath,
      model: model,
      plan,
      queued,
      mappingCount: nodes.length,
      notes
    };
  }
}
