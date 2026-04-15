import { z } from 'zod';

import type { FigmaReadClient } from './figma-client';
import { AppError } from './errors';
import type {
  FigmaComponentSetsResponse,
  FigmaComponentsResponse,
  FigmaFileNode,
  FigmaFileResponse,
  FigmaNode,
  FigmaPublishedComponent,
  FigmaPublishedComponentSet,
  FigmaPublishedStyle,
  FigmaStylesResponse,
  FigmaVariablesResponse
} from '../types/figma';

export const designContextSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1)
});

export type DesignContextNodeSummary = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  childCount: number;
  size?: {
    width?: number;
    height?: number;
  };
  position?: {
    x?: number;
    y?: number;
  };
  layoutMode?: string;
};

export type DesignContextChildBlock = {
  id: string;
  name: string;
  type: string;
  childCount: number;
  textPreview?: string;
};

export type DesignContextLayoutHints = {
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  itemSpacing?: number;
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  alignItems?: string;
  alignSelf?: string;
  clipsContent?: boolean;
  constraints?: unknown;
  sizingHints: string[];
};

export type DesignContextStyleRef = {
  id: string;
  name?: string;
  type?: string;
};

export type DesignContextVariableRef = {
  id: string;
  name?: string;
  collection?: string;
  resolvedType?: string;
};

export type DesignContextComponentRef = {
  id: string;
  name?: string;
  description?: string;
  kind: 'component' | 'componentSet';
};

export type DesignContextResult = {
  summary: DesignContextNodeSummary;
  childBlocks: DesignContextChildBlock[];
  textContent: string[];
  layoutHints: DesignContextLayoutHints;
  styles: DesignContextStyleRef[];
  variables: DesignContextVariableRef[];
  componentsUsed: DesignContextComponentRef[];
  implementationNotes: string[];
};

export type LayoutSummaryResult = {
  summary: DesignContextNodeSummary;
  childBlocks: DesignContextChildBlock[];
  layoutHints: DesignContextLayoutHints;
  implementationNotes: string[];
};

const MAX_CHILD_BLOCKS = 25;
const MAX_TEXT_ITEMS = 20;
const MAX_STYLE_ITEMS = 20;
const MAX_VARIABLE_ITEMS = 20;
const MAX_COMPONENT_ITEMS = 20;

const compactValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const asNode = (value: unknown): FigmaNode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.type !== 'string') {
    return null;
  }

  return candidate as unknown as FigmaNode;
};

const getTreeRootFromFileNode = (fileNode: FigmaFileNode | null): FigmaNode => {
  const root = asNode(fileNode?.document);
  if (!root) {
    throw new AppError('Node not found', 404, 'NODE_NOT_FOUND');
  }

  return root;
};

const getAbsoluteBoundingBox = (node: FigmaNode): Record<string, unknown> | null => {
  const box = node.absoluteBoundingBox;
  return box && typeof box === 'object' ? (box as Record<string, unknown>) : null;
};

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const collectNodes = (rootNode: FigmaNode): FigmaNode[] => {
  const nodes: FigmaNode[] = [];

  const visit = (node: FigmaNode) => {
    nodes.push(node);

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childNode = asNode(child);
        if (childNode) {
          visit(childNode);
        }
      }
    }
  };

  visit(rootNode);

  return nodes;
};

const collectTextContent = (nodes: FigmaNode[]): string[] => {
  const items: string[] = [];

  for (const node of nodes) {
    if (typeof node.characters === 'string') {
      const value = node.characters.trim();
      if (value) {
        items.push(value);
      }
    }

    if (items.length >= MAX_TEXT_ITEMS) {
      break;
    }
  }

  return items;
};

const getTextPreview = (node: FigmaNode): string | undefined => {
  if (typeof node.characters === 'string' && node.characters.trim()) {
    return node.characters.trim().slice(0, 80);
  }

  if (!Array.isArray(node.children)) {
    return undefined;
  }

  for (const child of node.children) {
    const childNode = asNode(child);
    if (!childNode) {
      continue;
    }

    const preview = getTextPreview(childNode);
    if (preview) {
      return preview;
    }
  }

  return undefined;
};

const buildNodeSummary = (node: FigmaNode): DesignContextNodeSummary => {
  const box = getAbsoluteBoundingBox(node);

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: typeof node.visible === 'boolean' ? node.visible : undefined,
    childCount: Array.isArray(node.children) ? node.children.length : 0,
    size: box
      ? {
          width: numberOrUndefined(box.width),
          height: numberOrUndefined(box.height)
        }
      : undefined,
    position: box
      ? {
          x: numberOrUndefined(box.x),
          y: numberOrUndefined(box.y)
        }
      : undefined,
    layoutMode: typeof node.layoutMode === 'string' ? node.layoutMode : undefined
  };
};

const buildChildBlocks = (node: FigmaNode): DesignContextChildBlock[] => {
  if (!Array.isArray(node.children)) {
    return [];
  }

  return node.children
    .map((child) => asNode(child))
    .filter((child): child is FigmaNode => Boolean(child))
    .slice(0, MAX_CHILD_BLOCKS)
    .map((child) => ({
      id: child.id,
      name: child.name,
      type: child.type,
      childCount: Array.isArray(child.children) ? child.children.length : 0,
      textPreview: getTextPreview(child)
    }));
};

const buildLayoutHints = (node: FigmaNode): DesignContextLayoutHints => {
  const hints: string[] = [];

  if (typeof node.layoutMode === 'string' && node.layoutMode !== 'NONE') {
    hints.push(`Uses auto-layout (${node.layoutMode.toLowerCase()}).`);
  }

  if (typeof node.itemSpacing === 'number') {
    hints.push(`Children are spaced by ${node.itemSpacing}px.`);
  }

  const box = getAbsoluteBoundingBox(node);
  if (box?.width && box?.height) {
    hints.push(`Frame size is ${box.width}x${box.height}.`);
  }

  if (node.clipsContent === true) {
    hints.push('Content is clipped by the frame.');
  }

  return {
    layoutMode: typeof node.layoutMode === 'string' ? node.layoutMode : undefined,
    primaryAxisSizingMode:
      typeof node.primaryAxisSizingMode === 'string' ? node.primaryAxisSizingMode : undefined,
    counterAxisSizingMode:
      typeof node.counterAxisSizingMode === 'string' ? node.counterAxisSizingMode : undefined,
    itemSpacing: numberOrUndefined(node.itemSpacing),
    padding: {
      top: numberOrUndefined(node.paddingTop),
      right: numberOrUndefined(node.paddingRight),
      bottom: numberOrUndefined(node.paddingBottom),
      left: numberOrUndefined(node.paddingLeft)
    },
    alignItems: typeof node.counterAxisAlignItems === 'string' ? node.counterAxisAlignItems : undefined,
    alignSelf: typeof node.layoutAlign === 'string' ? node.layoutAlign : undefined,
    clipsContent: typeof node.clipsContent === 'boolean' ? node.clipsContent : undefined,
    constraints: node.constraints,
    sizingHints: hints
  };
};

const collectStyleIds = (nodes: FigmaNode): string[] => {
  const styleIds = new Set<string>();

  const visit = (node: FigmaNode) => {
    if (node.styles && typeof node.styles === 'object') {
      for (const value of Object.values(node.styles as Record<string, unknown>)) {
        if (typeof value === 'string') {
          styleIds.add(value);
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childNode = asNode(child);
        if (childNode) {
          visit(childNode);
        }
      }
    }
  };

  visit(nodes);

  return Array.from(styleIds);
};

const resolveStyles = (
  styleIds: string[],
  fileResponse: FigmaFileResponse,
  stylesResponse: FigmaStylesResponse
): DesignContextStyleRef[] => {
  const publishedStyles = new Map<string, FigmaPublishedStyle>();

  for (const [id, style] of Object.entries(fileResponse.styles ?? {})) {
    publishedStyles.set(id, style);
  }

  for (const style of stylesResponse.meta.styles) {
    publishedStyles.set(style.node_id, style);
    publishedStyles.set(style.key, style);
  }

  return styleIds.slice(0, MAX_STYLE_ITEMS).map((id) => {
    const style = publishedStyles.get(id);
    return {
      id,
      name: style?.name,
      type: style?.style_type
    };
  });
};

const collectVariableIds = (rootNode: FigmaNode): string[] => {
  const ids = new Set<string>();

  const visitValue = (value: unknown) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visitValue(item);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue.id === 'string') {
      ids.add(objectValue.id);
    }

    for (const nestedValue of Object.values(objectValue)) {
      visitValue(nestedValue);
    }
  };

  const visit = (node: FigmaNode) => {
    visitValue(node.boundVariables);

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childNode = asNode(child);
        if (childNode) {
          visit(childNode);
        }
      }
    }
  };

  visit(rootNode);

  return Array.from(ids);
};

const resolveVariables = (
  variableIds: string[],
  variablesResponse: FigmaVariablesResponse | null
): DesignContextVariableRef[] => {
  if (!variablesResponse) {
    return [];
  }

  return variableIds.slice(0, MAX_VARIABLE_ITEMS).map((id) => {
    const variable = variablesResponse.meta.variables[id];
    const collection = variable ? variablesResponse.meta.variableCollections[variable.variableCollectionId] : undefined;

    return {
      id,
      name: variable?.name,
      collection: collection?.name,
      resolvedType: variable?.resolvedType
    };
  });
};

const collectComponentIds = (rootNode: FigmaNode): { componentIds: string[]; componentSetIds: string[] } => {
  const componentIds = new Set<string>();
  const componentSetIds = new Set<string>();

  const visit = (node: FigmaNode) => {
    if (typeof node.componentId === 'string') {
      componentIds.add(node.componentId);
    }

    if (typeof node.componentSetId === 'string') {
      componentSetIds.add(node.componentSetId);
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childNode = asNode(child);
        if (childNode) {
          visit(childNode);
        }
      }
    }
  };

  visit(rootNode);

  return {
    componentIds: Array.from(componentIds),
    componentSetIds: Array.from(componentSetIds)
  };
};

const resolveComponents = (
  componentIds: string[],
  componentSetIds: string[],
  fileResponse: FigmaFileResponse,
  componentsResponse: FigmaComponentsResponse,
  componentSetsResponse: FigmaComponentSetsResponse
): DesignContextComponentRef[] => {
  const components = new Map<string, FigmaPublishedComponent>();
  const componentSets = new Map<string, FigmaPublishedComponentSet>();

  for (const [id, component] of Object.entries(fileResponse.components ?? {})) {
    components.set(id, component);
  }

  for (const [id, componentSet] of Object.entries(fileResponse.componentSets ?? {})) {
    componentSets.set(id, componentSet);
  }

  for (const component of componentsResponse.meta.components) {
    components.set(component.node_id, component);
    components.set(component.key, component);
  }

  for (const componentSet of componentSetsResponse.meta.component_sets) {
    componentSets.set(componentSet.node_id, componentSet);
    componentSets.set(componentSet.key, componentSet);
  }

  const resolved: DesignContextComponentRef[] = [];

  for (const id of componentIds.slice(0, MAX_COMPONENT_ITEMS)) {
    const component = components.get(id);
    resolved.push({
      id,
      name: component?.name,
      description: component?.description,
      kind: 'component'
    });
  }

  for (const id of componentSetIds.slice(0, MAX_COMPONENT_ITEMS - resolved.length)) {
    const componentSet = componentSets.get(id);
    resolved.push({
      id,
      name: componentSet?.name,
      description: componentSet?.description,
      kind: 'componentSet'
    });
  }

  return resolved;
};

const buildImplementationNotes = (context: {
  rootNode: FigmaNode;
  textContent: string[];
  layoutHints: DesignContextLayoutHints;
  styles: DesignContextStyleRef[];
  variables: DesignContextVariableRef[];
  componentsUsed: DesignContextComponentRef[];
}): string[] => {
  const notes: string[] = [];

  if (context.layoutHints.layoutMode && context.layoutHints.layoutMode !== 'NONE') {
    notes.push('Keep auto-layout semantics in code instead of absolute positioning.');
  }

  if (context.textContent.length > 0) {
    notes.push('Extract visible copy into structured content props or constants.');
  }

  if (context.styles.length > 0) {
    notes.push('Map referenced style IDs to design-system tokens or reusable CSS variables.');
  }

  if (context.variables.length > 0) {
    notes.push('Prefer variables/tokens over hardcoded color and spacing values.');
  }

  if (context.componentsUsed.length > 0) {
    notes.push('Preserve component boundaries for repeated UI patterns.');
  }

  if (Array.isArray(context.rootNode.children) && context.rootNode.children.length > 8) {
    notes.push('This frame is dense; split implementation into smaller subcomponents.');
  }

  return notes;
};

const safeGetVariables = async (
  figmaClient: FigmaReadClient,
  fileKey: string
): Promise<FigmaVariablesResponse | null> => {
  try {
    return await figmaClient.getVariables(fileKey);
  } catch (error) {
    if (error instanceof AppError && (error.code === 'FIGMA_FORBIDDEN' || error.code === 'FIGMA_NOT_FOUND')) {
      return null;
    }

    return null;
  }
};

export const createDesignContextService = (figmaClient: FigmaReadClient) => {
  const getDesignContext = async (
    input: z.infer<typeof designContextSchema>
  ): Promise<DesignContextResult> => {
    const { fileKey, nodeId } = designContextSchema.parse(input);

    const [fileResponse, fileNode, stylesResponse, componentsResponse, componentSetsResponse, variablesResponse] =
      await Promise.all([
        figmaClient.getFile(fileKey),
        figmaClient.getNode(fileKey, nodeId),
        figmaClient.getStyles(fileKey),
        figmaClient.getComponents(fileKey),
        figmaClient.getComponentSets(fileKey),
        safeGetVariables(figmaClient, fileKey)
      ]);

    const rootNode = getTreeRootFromFileNode(fileNode);
    const allNodes = collectNodes(rootNode);
    const textContent = collectTextContent(allNodes);
    const layoutHints = buildLayoutHints(rootNode);
    const styles = resolveStyles(collectStyleIds(rootNode), fileResponse, stylesResponse);
    const variables = resolveVariables(collectVariableIds(rootNode), variablesResponse);
    const { componentIds, componentSetIds } = collectComponentIds(rootNode);
    const componentsUsed = resolveComponents(
      componentIds,
      componentSetIds,
      fileResponse,
      componentsResponse,
      componentSetsResponse
    );

    const result: DesignContextResult = {
      summary: buildNodeSummary(rootNode),
      childBlocks: buildChildBlocks(rootNode),
      textContent,
      layoutHints,
      styles,
      variables,
      componentsUsed,
      implementationNotes: buildImplementationNotes({
        rootNode,
        textContent,
        layoutHints,
        styles,
        variables,
        componentsUsed
      })
    };

    return compactValue(result);
  };

  const getLayoutSummary = async (
    input: z.infer<typeof designContextSchema>
  ): Promise<LayoutSummaryResult> => {
    const context = await getDesignContext(input);

    return compactValue({
      summary: context.summary,
      childBlocks: context.childBlocks,
      layoutHints: context.layoutHints,
      implementationNotes: context.implementationNotes
    });
  };

  return {
    getDesignContext,
    getLayoutSummary
  };
};

export type DesignContextService = ReturnType<typeof createDesignContextService>;
