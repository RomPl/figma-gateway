import { z } from 'zod';

import { AppError } from './errors';
import type { DesignTokenService } from './design-token-registry';
import { annotateDocumentWithTokens } from './design-token-helpers';
import type { FigmaReadClient } from './figma-client';
import type { FigmaFileResponse, FigmaNode } from '../types/figma';
import { uiModelDocumentSchema, type UiEdgeInsets, type UiKind, type UiModelDocument, type UiNode, type UiPaint } from './ui-model';

export const extractFigmaUiSchema = z.object({
  fileKey: z.string().trim().min(1),
  project: z.string().trim().min(1).max(128).optional(),
  nodeId: z.string().trim().min(1).optional()
});

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

const colorToHex = (color: Record<string, unknown> | null | undefined): string | undefined => {
  if (!color) return undefined;
  const r = asNumber(color.r);
  const g = asNumber(color.g);
  const b = asNumber(color.b);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  const toHex = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const paintFromFigma = (value: unknown): UiPaint | string | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const first = value.find((item) => isObject(item) && asString(item.type) !== 'IMAGE') as Record<string, unknown> | undefined;
  if (!first) return undefined;
  const color = colorToHex(isObject(first.color) ? first.color : undefined);
  const opacity = asNumber(first.opacity);
  if (!color && opacity === undefined) return undefined;
  return opacity !== undefined ? { value: color, opacity } : color;
};

const extractPadding = (node: FigmaNode): UiEdgeInsets | undefined => {
  const top = asNumber((node as Record<string, unknown>).paddingTop);
  const right = asNumber((node as Record<string, unknown>).paddingRight);
  const bottom = asNumber((node as Record<string, unknown>).paddingBottom);
  const left = asNumber((node as Record<string, unknown>).paddingLeft);
  if ([top, right, bottom, left].every((item) => item === undefined)) return undefined;
  return { top: top ?? 0, right: right ?? 0, bottom: bottom ?? 0, left: left ?? 0 };
};

const inferKind = (node: FigmaNode): UiKind => {
  const type = String(node.type || '').toUpperCase();
  const name = String(node.name || '');
  if (type === 'CANVAS') return 'page';
  if (type === 'SECTION') return 'section';
  if (type === 'FRAME' || type === 'COMPONENT_SET' || type === 'COMPONENT') return 'frame';
  if (type === 'GROUP') return 'group';
  if (type === 'TEXT') return 'text';
  if (type === 'INSTANCE') return 'component_instance';
  if (type === 'VECTOR' || /icon/i.test(name)) return 'icon';
  if ((node as Record<string, unknown>).fills && Array.isArray((node as Record<string, unknown>).fills)) {
    const hasImageFill = ((node as Record<string, unknown>).fills as unknown[]).some((fill) => isObject(fill) && fill.type === 'IMAGE');
    if (hasImageFill) return 'image';
  }
  if (/button|cta/i.test(name)) return 'button';
  if (/input|field/i.test(name)) return 'input';
  if (/card/i.test(name)) return 'card';
  if (/list/i.test(name)) return 'list';
  return 'group';
};

const inferRole = (node: FigmaNode): UiNode['role'] => {
  const name = String(node.name || '');
  const type = String(node.type || '').toUpperCase();
  if (type === 'TEXT' && /headline|title|hero/i.test(name)) return 'headline';
  if (/button|cta/i.test(name)) return 'button-primary';
  if (/input|field/i.test(name)) return 'input-field';
  if (/icon/i.test(name)) return 'icon-leading';
  return undefined;
};

const extractTextStyle = (node: FigmaNode): UiNode['style'] => {
  if (String(node.type || '').toUpperCase() !== 'TEXT') return undefined;
  const fontName = isObject((node as Record<string, unknown>).fontName) ? ((node as Record<string, unknown>).fontName as Record<string, unknown>) : undefined;
  const fontSize = asNumber((node as Record<string, unknown>).fontSize);
  const lineHeight = isObject((node as Record<string, unknown>).lineHeight)
    ? asNumber((((node as Record<string, unknown>).lineHeight as Record<string, unknown>).value))
    : undefined;
  const letterSpacing = isObject((node as Record<string, unknown>).letterSpacing)
    ? asNumber((((node as Record<string, unknown>).letterSpacing as Record<string, unknown>).value))
    : undefined;
  const textAlignHorizontal = asString((node as Record<string, unknown>).textAlignHorizontal);
  const text = {
    fontFamily: asString(fontName?.family),
    fontStyle: asString(fontName?.style),
    fontSize,
    lineHeight,
    letterSpacing,
    textAlign: textAlignHorizontal ? (textAlignHorizontal.toLowerCase() as 'left' | 'center' | 'right' | 'justify') : undefined
  };
  if (Object.values(text).every((item) => item === undefined)) return undefined;
  return { text };
};

const extractLayout = (node: FigmaNode): UiNode['layout'] => {
  const record = node as Record<string, unknown>;
  const layoutMode = asString(record.layoutMode);
  const itemSpacing = asNumber(record.itemSpacing);
  const primary = asString(record.primaryAxisAlignItems);
  const cross = asString(record.counterAxisAlignItems);
  const padding = extractPadding(node);
  if (!layoutMode && itemSpacing === undefined && !padding && !primary && !cross) return undefined;
  return {
    type: layoutMode === 'VERTICAL' ? 'vertical' : layoutMode === 'HORIZONTAL' ? 'horizontal' : 'none',
    gap: itemSpacing,
    padding,
    alignment: {
      primary: primary ? (primary.toLowerCase() as 'start' | 'center' | 'end' | 'space-between') : undefined,
      cross: cross ? (cross.toLowerCase() as 'start' | 'center' | 'end' | 'stretch') : undefined
    }
  };
};

const findNodeById = (root: FigmaNode, nodeId: string): FigmaNode | null => {
  if (root.id === nodeId) return root;
  if (!Array.isArray(root.children)) return null;
  for (const child of root.children) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
};

const normalizeUiId = (node: FigmaNode): string => {
  const record = node as Record<string, unknown>;
  return asString(record.uiId) ?? asString(record.pluginUiId) ?? `${String(node.type || 'node').toLowerCase()}.${node.id.replace(/[:]/g, '_')}`;
};

const buildUiNode = (fileKey: string, node: FigmaNode): UiNode => {
  const kind = inferKind(node);
  const layout = extractLayout(node);
  const style = {
    ...(paintFromFigma((node as Record<string, unknown>).fills) !== undefined ? { fill: paintFromFigma((node as Record<string, unknown>).fills) } : {}),
    ...(paintFromFigma((node as Record<string, unknown>).strokes) !== undefined ? { stroke: paintFromFigma((node as Record<string, unknown>).strokes) } : {}),
    ...(asNumber((node as Record<string, unknown>).cornerRadius) !== undefined ? { radius: asNumber((node as Record<string, unknown>).cornerRadius) } : {}),
    ...(asNumber((node as Record<string, unknown>).opacity) !== undefined ? { opacity: asNumber((node as Record<string, unknown>).opacity) } : {}),
    ...(extractTextStyle(node) ?? {})
  };
  const size = isObject((node as Record<string, unknown>).absoluteBoundingBox)
    ? {
        width: asNumber((((node as Record<string, unknown>).absoluteBoundingBox as Record<string, unknown>).width)),
        height: asNumber((((node as Record<string, unknown>).absoluteBoundingBox as Record<string, unknown>).height))
      }
    : undefined;
  const position = isObject((node as Record<string, unknown>).absoluteBoundingBox)
    ? {
        x: asNumber((((node as Record<string, unknown>).absoluteBoundingBox as Record<string, unknown>).x)),
        y: asNumber((((node as Record<string, unknown>).absoluteBoundingBox as Record<string, unknown>).y))
      }
    : undefined;
  const constraints = isObject((node as Record<string, unknown>).constraints) ? ((node as Record<string, unknown>).constraints as Record<string, unknown>) : undefined;

  return {
    kind,
    uiId: normalizeUiId(node),
    name: node.name,
    role: inferRole(node),
    visible: typeof node.visible === 'boolean' ? node.visible : true,
    text: kind === 'text' && typeof (node as Record<string, unknown>).characters === 'string' ? ((node as Record<string, unknown>).characters as string) : undefined,
    source: {
      fileKey,
      nodeId: node.id
    },
    size: size && (size.width !== undefined || size.height !== undefined) ? size : undefined,
    position: position && (position.x !== undefined || position.y !== undefined) ? position : undefined,
    spacing: asNumber((node as Record<string, unknown>).itemSpacing),
    padding: extractPadding(node),
    layout,
    style: Object.keys(style).length ? style : undefined,
    meta: {
      figmaType: node.type,
      nodeName: node.name,
      constraints,
      layoutSizingHorizontal: asString((node as Record<string, unknown>).layoutSizingHorizontal),
      layoutSizingVertical: asString((node as Record<string, unknown>).layoutSizingVertical)
    },
    children: Array.isArray(node.children) ? node.children.map((child) => buildUiNode(fileKey, child)) : []
  };
};

export class FigmaUiExtractorService {
  constructor(private readonly figmaClient: FigmaReadClient, private readonly designTokenService?: DesignTokenService) {}

  public async extract(input: z.input<typeof extractFigmaUiSchema>): Promise<UiModelDocument> {
    const data = extractFigmaUiSchema.parse(input);
    const file = await this.figmaClient.getFile(data.fileKey);
    const rootNode = this.resolveRootNode(file, data.nodeId);
    return annotateDocumentWithTokens(uiModelDocumentSchema.parse({
      version: 'ui-model.v1',
      root: buildUiNode(data.fileKey, rootNode)
    }), this.designTokenService, data.project);
  }

  private resolveRootNode(file: FigmaFileResponse, nodeId?: string): FigmaNode {
    if (!nodeId) return file.document;
    const found = findNodeById(file.document, nodeId);
    if (!found) {
      throw new AppError(`Figma node not found for UI extract: ${nodeId}`, 404, 'NODE_NOT_FOUND');
    }
    return found;
  }
}

export const createFigmaUiExtractorService = (figmaClient: FigmaReadClient, designTokenService?: DesignTokenService): FigmaUiExtractorService =>
  new FigmaUiExtractorService(figmaClient, designTokenService);
