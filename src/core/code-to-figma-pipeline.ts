import { createHash } from 'node:crypto';
import { z } from 'zod';

import { AppError } from './errors';
import type { CodeUiParserService } from './code-ui-parser';
import type { FigmaCommandStep } from './figma-write-types';
import type { PluginBridgeService } from './plugin-bridge';
import type { UiModelDocument, UiNode, UiPaint } from './ui-model';
import { annotateVisualConfidence } from './visual-confidence';
import { segmentVisualBlocks } from './visual-segmentation';
import { visualLogger, summarizeNode } from './visual-debug';
import type { UiMappingService } from './ui-mapping-registry';
import { extractRenderedUiSchema } from './rendered-ui-extractor';
import type { RenderedToCodeMapperService } from './rendered-to-code-mapper';

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
  render: extractRenderedUiSchema.optional(),
  dryRun: z.coerce.boolean().default(false)
});

export type PlannerActionType =
  | 'create_section'
  | 'create_frame'
  | 'create_text'
  | 'set_auto_layout'
  | 'set_fill'
  | 'set_stroke'
  | 'set_radius'
  | 'set_effects'
  | 'set_shadow'
  | 'set_text_style'
  | 'set_alignment'
  | 'set_size'
  | 'set_position'
  | 'set_asset'
  | 'set_icon'
  | 'move_node';

export type PlannerAction = { id: string; type: PlannerActionType; uiId: string; payload: Record<string, unknown> };
export type CodeToFigmaExecutionPlan = { componentName: string; filePath: string; model: UiModelDocument; actions: PlannerAction[]; commands: FigmaCommandStep[] };
export type CodeToFigmaPipelineResult = {
  acceptance: { passed: boolean; issues: string[]; coverage: Record<string, number | boolean> };
  needsReview: Array<{ uiId: string; visual: number; reasons: string[] }>;
  componentName: string;
  filePath: string;
  model: UiModelDocument;
  plan: CodeToFigmaExecutionPlan;
  queued?: { sessionId: string; commandId: string; status: string };
  mappingCount: number;
  notes: string[];
};

const makeHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const getTokenBinding = (node: UiNode, key: string): Record<string, unknown> | undefined => {
  const bindings = node.meta && typeof node.meta.tokenBindings === 'object' ? (node.meta.tokenBindings as Record<string, unknown>) : undefined;
  return bindings && typeof bindings[key] === 'object' ? (bindings[key] as Record<string, unknown>) : undefined;
};
const findNodeByUiId = (node: UiNode, uiId: string): UiNode | null => {
  if (node.uiId === uiId) return node;
  for (const child of node.children) {
    const found = findNodeByUiId(child, uiId);
    if (found) return found;
  }
  return null;
};
const inferContainerCommand = (_node: UiNode, _isRoot: boolean): 'create_frame' => 'create_frame';

const sanitizeFigmaNamePart = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, '.').replace(/[^a-zA-Z0-9._-]+/g, '').replace(/\.+/g, '.').replace(/^\.|\.$/g, '').trim();
  return normalized || undefined;
};


const mapIconPlaceholderText = (label: string | undefined): string => {
  const value = String(label || '').toLowerCase();
  if (value.includes('microphone') || value.includes('mic')) return '🎤';
  if (value.includes('folder')) return '📂';
  if (value.includes('play')) return '▶';
  if (value.includes('cloud') || value.includes('upload')) return '☁️';
  if (value.includes('history') || value.includes('clock')) return '🕘';
  return '◆';
};

const buildFigmaNodeName = (node: UiNode, fallbackTag?: string): string => {
  const dom = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>).dom as Record<string, unknown> | undefined : undefined;
  const tag = sanitizeFigmaNamePart(typeof dom?.tag === 'string' ? dom.tag : fallbackTag ?? node.kind);
  const domId = sanitizeFigmaNamePart(typeof dom?.id === 'string' ? dom.id : undefined);
  const className = sanitizeFigmaNamePart(typeof dom?.className === 'string' ? String(dom.className).split(/\s+/).filter(Boolean).slice(0, 3).join('.') : undefined);
  const combined = [tag, domId, className].filter(Boolean).join('-');
  return combined || node.name || node.uiId;
};


const normalizeColor = (raw: string): { r: number; g: number; b: number; a?: number } | null => {
  const hex = raw.trim().startsWith('#') ? raw.trim().slice(1) : null;
  if (hex && (hex.length === 6 || hex.length === 3)) {
    const normalized = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return {
      r: parseInt(normalized.slice(0, 2), 16) / 255,
      g: parseInt(normalized.slice(2, 4), 16) / 255,
      b: parseInt(normalized.slice(4, 6), 16) / 255,
      a: 1
    };
  }
  const rgb = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  if (!rgb) return null;
  return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255, a: rgb[4] !== undefined ? Number(rgb[4]) : 1 };
};

const lowerPaint = (raw: string | undefined, opacity = 1): unknown[] | undefined => {
  if (!raw) return undefined;
  const color = normalizeColor(raw);
  if (!color) return undefined;
  return [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: Math.max(0, Math.min(1, opacity * (color.a ?? 1))) }];
};

const paintRaw = (paint: UiPaint | string | undefined): string | undefined => (typeof paint === 'string' ? paint : paint?.value);


const lowerGradientPaint = (raw: string | undefined, opacity = 1): unknown[] | undefined => {
  if (!raw) return undefined;
  const match = raw.match(/linear-gradient\(([^,]+),\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,6})[^,]*,\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,6})/i);
  if (!match) return undefined;
  const first = normalizeColor(match[2]);
  const second = normalizeColor(match[3]);
  if (!first || !second) return undefined;
  return [{
    type: 'GRADIENT_LINEAR',
    opacity,
    gradientStops: [
      { position: 0, color: { r: first.r, g: first.g, b: first.b, a: Math.max(0, Math.min(1, opacity * (first.a ?? 1))) } },
      { position: 1, color: { r: second.r, g: second.g, b: second.b, a: Math.max(0, Math.min(1, opacity * (second.a ?? 1))) } }
    ],
    gradientTransform: [[0.7071067812, 0.7071067812, -0.2071067812], [-0.7071067812, 0.7071067812, 0.5]]
  }];
};

const lowerAnyPaint = (raw: string | undefined, opacity = 1): unknown[] | undefined => lowerGradientPaint(raw, opacity) ?? lowerPaint(raw, opacity);

const hasMeaningfulStroke = (node: UiNode, strokeRaw: string | undefined): boolean => Boolean(
  isMeaningfulPaintRaw(strokeRaw) &&
  (node.computedStyle?.borderWidth ?? 0) > 0 &&
  (node.computedStyle?.borderStyle ?? 'none') !== 'none'
);

const hasMeaningfulEffects = (boxShadow: string | undefined): boolean => Boolean(boxShadow && boxShadow !== 'none');

const relativeCoordinate = (value: number | undefined, parentValue: number | undefined): number | undefined => {
  if (value === undefined) return undefined;
  return parentValue === undefined ? value : value - parentValue;
};

const isMeaningfulPaintRaw = (raw: string | undefined): boolean => Boolean(raw && !['transparent', 'rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 0)', 'none'].includes(raw.trim().toLowerCase()));
const resolvedBackgroundPaintRaw = (node: UiNode): string | undefined => { const explicit = paintRaw(node.declarativeStyle?.fill ?? node.style?.fill); if (isMeaningfulPaintRaw(explicit)) return explicit; const bgColor = node.computedStyle?.backgroundColor; if (isMeaningfulPaintRaw(bgColor)) return bgColor; const bgImage = node.computedStyle?.backgroundImage; if (isMeaningfulPaintRaw(bgImage)) return bgImage; return undefined; };
const isWrapperLikeNode = (node: UiNode): boolean => { const dom = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>).dom as Record<string, unknown> | undefined : undefined; const className = String(dom?.className || '').toLowerCase(); const tag = String(dom?.tag || '').toLowerCase(); const explicitBg = paintRaw(node.declarativeStyle?.fill ?? node.style?.fill); const computedBg = node.computedStyle?.backgroundColor; const bgImage = node.computedStyle?.backgroundImage; const transparentBackground = !isMeaningfulPaintRaw(explicitBg) && !isMeaningfulPaintRaw(bgImage) && (!isMeaningfulPaintRaw(computedBg) || ['rgb(255, 255, 255)','rgb(255,255,255)','#ffffff','#fff'].includes(String(computedBg).trim().toLowerCase())); const noBorder = (node.computedStyle?.borderWidth ?? 0) <= 0; const noRadius = (node.computedStyle?.borderRadius ?? 0) <= 0; const noShadow = !hasMeaningfulEffects(node.computedStyle?.boxShadow); const wrapperClass = /(row|col(-|$)|justify-content-|align-items-|text-center|mt-|mb-|form-check|form-switch|container|mx-auto|max-w-screen|justify-center|items-center)/.test(className); return transparentBackground && noBorder && noRadius && noShadow && (tag === 'div' || tag === 'form' || tag === 'section'); };
const shouldForceTransparentFill = (node: UiNode): boolean => { const dom = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>).dom as Record<string, unknown> | undefined : undefined; const className = String(dom?.className || '').toLowerCase(); const transparentBackground = !isMeaningfulPaintRaw(node.computedStyle?.backgroundColor) && !isMeaningfulPaintRaw(node.computedStyle?.backgroundImage); if (isWrapperLikeNode(node)) return true; if (node.kind === 'icon' && transparentBackground) return true; if (node.kind === 'button' && transparentBackground && (node.computedStyle?.borderWidth ?? 0) > 0) return true; if (transparentBackground && /(uploadform|text-center|form-check|form-switch|\bmb-\d+\b|\bmt-\d+\b)/.test(className)) return true; return false; };
const shouldSkipTransparentTextWrapper = (node: UiNode): boolean => {
  if (!String(node.uiId || '').startsWith('__auto__/')) return false;
  if (node.kind === 'text' || node.kind === 'icon' || node.kind === 'button' || node.kind === 'input') return false;
  if (!node.children.length) return false;
  if (!node.children.every((child) => child.kind === 'text')) return false;
  const dom = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>).dom as Record<string, unknown> | undefined : undefined;
  const className = String(dom?.className || '').toLowerCase();
  const display = String(node.computedStyle?.display || '').toLowerCase();
  const isRealLayoutContainer = display === 'flex' || display === 'inline-flex' || display === 'grid';
  const transparentBackground = !isMeaningfulPaintRaw(node.computedStyle?.backgroundColor) && !isMeaningfulPaintRaw(node.computedStyle?.backgroundImage);
  const noDecoration = (node.computedStyle?.borderWidth ?? 0) <= 0 && (node.computedStyle?.borderRadius ?? 0) <= 0 && !hasMeaningfulEffects(node.computedStyle?.boxShadow);
  if (!transparentBackground || !noDecoration) return false;
  if (Boolean(node.asset?.layer) || Boolean(node.icon?.sourceType)) return false;
  if (isRealLayoutContainer) return false;
  if (!/(^|\s)(text-center|max-w-|mx-auto)(\s|$)|text-center|max-w-|mx-auto/.test(className)) return false;
  return true;
};
const firstColorFromGradient = (raw: string | undefined): string | undefined => { if (!raw) return undefined; const match = String(raw).match(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/); return match ? match[1] : undefined; };
const hasRenderablePaint = (raw: string | undefined, opacity = 1): boolean => Boolean(lowerAnyPaint(raw, opacity)?.length);
const shouldCenterWithinParent = (node: UiNode, parentNode: UiNode | undefined): boolean => { const dom = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>).dom as Record<string, unknown> | undefined : undefined; const className = String(dom?.className || '').toLowerCase(); return Boolean(parentNode && (className.includes('mx-auto') || (node.computedStyle?.marginLeftAuto && node.computedStyle?.marginRightAuto) || (((node.computedStyle?.marginLeft ?? 0) > 0) && ((node.computedStyle?.marginRight ?? 0) > 0)))); };
const placeholderReasonsForNode = (node: UiNode): string[] => {
  const guardrails = node.meta && typeof node.meta.guardrails === 'object' ? (node.meta.guardrails as Record<string, unknown>) : undefined;
  const reasons: string[] = [];
  if (Array.isArray(guardrails?.unsupportedRegions)) {
    reasons.push(...guardrails.unsupportedRegions.map((item) => String(item)).filter((item) => item && item !== 'heuristic_node'));
  }
  const bgImage = node.computedStyle?.backgroundImage;
  if (isMeaningfulPaintRaw(bgImage) && !hasRenderablePaint(bgImage, node.computedStyle?.opacity ?? 1) && !String(bgImage).includes('gradient(')) reasons.push('background-image-unsupported');
  if ((node.kind === 'image' || Boolean(node.asset?.layer)) && !node.asset?.sourceUrl && !node.asset?.resolvedAssetPath && node.asset?.layer !== 'decorative-asset') reasons.push('asset-source-missing');
  return Array.from(new Set(reasons.filter(Boolean)));
};
const shouldRenderAsRedPlaceholder = (node: UiNode): boolean => placeholderReasonsForNode(node).length > 0;
const supportsLayoutBoxNode = (node: UiNode): boolean => ['frame','section','card','list','form','button','input'].includes(node.kind);
const supportsCornerRadiusNode = (node: UiNode): boolean => ['frame','section','card','list','form','button','input','image'].includes(node.kind);
const shouldEmitFillReset = (node: UiNode): boolean => shouldForceTransparentFill(node) && supportsLayoutBoxNode(node);
const shouldSuppressDefaultWhiteFill = (node: UiNode): boolean => { const bg = String(node.computedStyle?.backgroundColor || '').trim().toLowerCase(); const explicit = paintRaw(node.declarativeStyle?.fill); const noExplicit = !isMeaningfulPaintRaw(explicit); const plainWhite = ['rgb(255, 255, 255)','rgb(255,255,255)','#ffffff','#fff'].includes(bg); const shellLayout = Boolean(node.children.length > 0 && ((node.computedStyle?.marginLeftAuto && node.computedStyle?.marginRightAuto) || node.computedStyle?.justifyContent === 'center' || node.computedStyle?.alignItems === 'center')); const noDecoration = (node.computedStyle?.borderWidth ?? 0) <= 0 && (node.computedStyle?.borderRadius ?? 0) <= 0 && !hasMeaningfulEffects(node.computedStyle?.boxShadow); return noExplicit && plainWhite && shellLayout && noDecoration; };

const mergeNode = (codeNode: UiNode, renderedNode: UiNode | null): UiNode => {
  const visual = renderedNode ?? null;
  const mergedChildren = codeNode.children.map((child) => mergeNode(child, visual ? findNodeByUiId(visual, child.uiId) : null));
  return {
    ...codeNode,
    name: visual?.name ?? codeNode.name,
    text: visual?.text ?? codeNode.text,
    size: visual?.size ?? codeNode.size,
    position: visual?.position ?? codeNode.position,
    spacing: visual?.spacing ?? codeNode.spacing,
    padding: visual?.padding ?? codeNode.padding,
    layout: visual?.layout ?? codeNode.layout,
    style: codeNode.style ?? visual?.style,
    declarativeStyle: codeNode.declarativeStyle ?? codeNode.style,
    computedStyle: visual?.computedStyle ?? codeNode.computedStyle,
    semanticTokens: visual?.semanticTokens ?? codeNode.semanticTokens ?? codeNode.tokens,
    tokens: visual?.tokens ?? codeNode.tokens,
    boundingBox: visual?.boundingBox ?? codeNode.boundingBox,
    asset: visual?.asset ?? codeNode.asset,
    icon: visual?.icon ?? codeNode.icon,
    state: visual?.state ?? codeNode.state,
    responsive: visual?.responsive ?? codeNode.responsive,
    meta: {
      ...(codeNode.meta ?? {}),
      ...(visual?.meta ?? {}),
      planner: {
        visualSource: visual ? 'rendered-first' : 'code-fallback',
        sourceMapping: 'ast',
        semanticStructure: 'ast',
        fallbackValues: 'ast'
      }
    },
    children: mergedChildren
  };
};

const lowerTextAlign = (value: string | undefined): string | undefined =>
  value === 'center' ? 'CENTER' : value === 'right' ? 'RIGHT' : value === 'justify' ? 'JUSTIFIED' : value ? 'LEFT' : undefined;

const walkNodes = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walkNodes(child, fn));
};

type FirstPassAcceptance = { passed: boolean; issues: string[]; coverage: Record<string, number | boolean> };

const hasMeaningfulBackground = (node: UiNode | undefined): boolean => {
  if (!node) return false;
  const fillRaw = paintRaw(node.declarativeStyle?.fill ?? node.style?.fill) ?? node.computedStyle?.backgroundColor;
  return Boolean(fillRaw && !['transparent', 'rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 0)'].includes(fillRaw));
};

export const auditFirstPassVisualAcceptance = (model: UiModelDocument): FirstPassAcceptance => {
  let nodeCount = 0;
  let containerCount = 0;
  let textCount = 0;
  let buttonCount = 0;
  let inputCount = 0;
  let iconCount = 0;
  let assetCount = 0;
  let backgroundNodeCount = 0;
  let largeContainerCount = 0;

  walkNodes(model.root, (node) => {
    nodeCount += 1;
    if (['page', 'section', 'frame', 'card', 'list', 'form'].includes(node.kind) || (node.children?.length ?? 0) > 0) containerCount += 1;
    if (node.kind === 'text' || Boolean(node.text && node.text.trim())) textCount += 1;
    if (node.kind === 'button') buttonCount += 1;
    if (node.kind === 'input') inputCount += 1;
    if (node.icon?.sourceType || node.kind === 'icon') iconCount += 1;
    if (node.asset?.layer) assetCount += 1;
    if (hasMeaningfulBackground(node)) backgroundNodeCount += 1;
    if ((node.boundingBox?.width ?? 0) >= 240 && (node.boundingBox?.height ?? 0) >= 120 && (['frame', 'section', 'card', 'form'].includes(node.kind) || (node.children?.length ?? 0) > 0)) largeContainerCount += 1;
  });

  const rootHasBackground = hasMeaningfulBackground(model.root);
  const issues: string[] = [];
  if (!rootHasBackground && backgroundNodeCount <= 1) issues.push('missing root or screen-level background coverage');
  if (largeContainerCount < 2) issues.push('insufficient large visual container coverage');
  if (textCount < 2) issues.push('insufficient text coverage for first-pass mock reconstruction');
  if (buttonCount < 1) issues.push('missing primary action/button coverage');
  if (iconCount === 0 && assetCount === 0) issues.push('missing icon or asset coverage');

  return {
    passed: issues.length === 0,
    issues,
    coverage: { rootHasBackground, nodeCount, containerCount, textCount, buttonCount, inputCount, iconCount, assetCount, backgroundNodeCount, largeContainerCount }
  };
};



const mapPrimaryAlign = (value: string | undefined): string =>
  value === 'center' ? 'CENTER' : value === 'end' ? 'MAX' : value === 'space-between' ? 'SPACE_BETWEEN' : 'MIN';

const mapCrossAlign = (value: string | undefined): string =>
  value === 'center' ? 'CENTER' : value === 'end' ? 'MAX' : value === 'stretch' ? 'STRETCH' : 'MIN';

const inferAutoLayoutPayload = (node: UiNode): Record<string, unknown> | null => {
  const display = node.computedStyle?.display;
  const flexDirection = node.computedStyle?.flexDirection;
  const justifyContent = node.computedStyle?.justifyContent;
  const alignItems = node.computedStyle?.alignItems;
  const gap = node.layout?.gap ?? node.spacing ?? node.computedStyle?.gap ?? node.computedStyle?.rowGap ?? node.computedStyle?.columnGap;
  const padding = node.layout?.padding ?? node.padding;
  const childCount = node.children?.length ?? 0;
  const hasAbsoluteChildren = node.children.some((child) => ['absolute', 'fixed', 'sticky'].includes(child.computedStyle?.position ?? ''));
  const nodePosition = node.computedStyle?.position;
  const isRealFlexContainer = display === 'flex' || display === 'inline-flex';
  const isGridContainer = display === 'grid' && childCount >= 2;
  const isButtonLikeContainer = node.kind === 'button' && (Boolean(node.text) || Boolean(node.icon?.sourceType));
  const textStackChildren = node.children.filter((child) => child.kind === 'text');
  const textStackCandidate = !isRealFlexContainer && !isGridContainer && !isButtonLikeContainer && childCount >= 2 && textStackChildren.length === childCount && !hasAbsoluteChildren && !['absolute', 'fixed', 'sticky'].includes(nodePosition ?? '') && ['block', 'inline-block', 'contents', ''].includes(String(display || 'block'));
  const hasNonDefaultAlignment = ['center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].includes(justifyContent ?? '') || ['center', 'flex-end', 'stretch'].includes(alignItems ?? '') || lowerTextAlign(node.computedStyle?.textAlign) === 'CENTER';
  const hasPadding = Boolean(padding && ((padding.top ?? 0) || (padding.right ?? 0) || (padding.bottom ?? 0) || (padding.left ?? 0)));
  const hasGap = gap !== undefined && gap !== null && Number(gap) > 0;
  if (!isRealFlexContainer && !isGridContainer && !isButtonLikeContainer && !textStackCandidate) return null;
  if (['absolute', 'fixed', 'sticky'].includes(nodePosition ?? '')) return null;
  if (hasAbsoluteChildren) return null;
  if (childCount === 0 && !isButtonLikeContainer) return null;
  if (childCount === 1 && !hasNonDefaultAlignment && !hasPadding && !hasGap) return null;
  const layoutMode = textStackCandidate ? 'VERTICAL' : ((isButtonLikeContainer || isGridContainer) ? 'HORIZONTAL' : (flexDirection === 'column' || flexDirection === 'column-reverse' ? 'VERTICAL' : 'HORIZONTAL'));
  return {
    layoutMode,
    itemSpacing: gap ?? (isButtonLikeContainer && node.icon?.sourceType ? 8 : (textStackCandidate ? 16 : gap)),
    primaryAxisAlignItems: mapPrimaryAlign(textStackCandidate ? 'start' : (isButtonLikeContainer ? 'center' : (node.layout?.alignment?.primary ?? (justifyContent === 'center' ? 'center' : justifyContent === 'flex-end' ? 'end' : justifyContent === 'space-between' ? 'space-between' : 'start')))),
    counterAxisAlignItems: mapCrossAlign(textStackCandidate ? (lowerTextAlign(node.computedStyle?.textAlign) === 'CENTER' ? 'center' : 'start') : ((isButtonLikeContainer || isGridContainer) ? 'center' : (node.layout?.alignment?.cross ?? (alignItems === 'center' ? 'center' : alignItems === 'flex-end' ? 'end' : alignItems === 'stretch' ? 'stretch' : 'start')))),
    layoutWrap: (isGridContainer || node.layout?.wrap || node.computedStyle?.flexWrap === 'wrap' || node.computedStyle?.flexWrap === 'wrap-reverse') ? 'WRAP' : 'NO_WRAP',
    strokesIncludedInLayout: (node.computedStyle?.borderWidth ?? 0) > 0,
    padding
  };
};

const planTextNode = (node: UiNode, parentNode: UiNode | undefined, parentRef: string | undefined, actions: PlannerAction[], commands: FigmaCommandStep[]): void => {
  const ref = node.uiId;
  const figmaName = buildFigmaNodeName(node, 'text');
  const x = relativeCoordinate(node.boundingBox?.x ?? node.position?.x, parentNode?.boundingBox?.x ?? parentNode?.position?.x);
  const y = relativeCoordinate(node.boundingBox?.y ?? node.position?.y, parentNode?.boundingBox?.y ?? parentNode?.position?.y);
  const parentUsesAutoLayout = Boolean(parentNode && inferAutoLayoutPayload(parentNode));
  const font = node.computedStyle ?? {};
  const declaredText = node.declarativeStyle?.text ?? node.style?.text;
  const parentPadding = parentNode?.layout?.padding ?? parentNode?.padding;
  const parentWidth = parentNode?.boundingBox?.width ?? parentNode?.size?.width ?? parentNode?.computedStyle?.width;
  const availableParentWidth = parentWidth !== undefined ? Math.max(0, parentWidth - (parentPadding?.left ?? 0) - (parentPadding?.right ?? 0)) : undefined;
  const explicitTextAlign = lowerTextAlign(font.textAlign ?? declaredText?.textAlign);
  const parentTextAlign = lowerTextAlign(parentNode?.computedStyle?.textAlign);
  const parentDisplay = parentNode?.computedStyle?.display;
  const parentCentersFlowChildren = !parentUsesAutoLayout && Boolean(parentNode && (
    parentTextAlign === 'CENTER' ||
    ((parentDisplay === 'flex' || parentDisplay === 'inline-flex') &&
      (parentNode.computedStyle?.flexDirection === 'column' || parentNode.computedStyle?.flexDirection === 'column-reverse') &&
      parentNode.computedStyle?.alignItems === 'center')
  ));
  const shouldUseParentContentWidth = !parentUsesAutoLayout && !['absolute', 'fixed', 'sticky'].includes(node.computedStyle?.position ?? '') && availableParentWidth !== undefined && availableParentWidth > 0 && (
    explicitTextAlign === 'CENTER' ||
    explicitTextAlign === 'RIGHT' ||
    explicitTextAlign === 'JUSTIFIED' ||
    (!explicitTextAlign && parentCentersFlowChildren)
  );
  const plannedTextAlign = explicitTextAlign ?? (parentCentersFlowChildren ? 'CENTER' : parentTextAlign);
  const plannedX = shouldUseParentContentWidth ? (parentPadding?.left ?? 0) : x;
  const plannedY = y;
  const plannedWidth = shouldUseParentContentWidth ? availableParentWidth : (node.boundingBox?.width ?? node.size?.width);
  const plannedHeight = node.boundingBox?.height ?? node.size?.height;
  const plannedTextAutoResize = shouldUseParentContentWidth ? 'HEIGHT' : undefined;
  const transparentText = (() => { const c = node.computedStyle?.color; return c === 'rgba(0, 0, 0, 0)' || c === 'transparent'; })();
  const colorRaw = (transparentText ? undefined : (paintRaw(node.declarativeStyle?.fill ?? node.style?.fill) ?? node.computedStyle?.color)) ?? firstColorFromGradient(node.computedStyle?.backgroundImage);
  const createTextPayload: Record<string, unknown> = {
    ref,
    parentRef,
    uiId: node.uiId,
    name: figmaName,
    text: node.text ?? '',
    x: plannedX,
    y: plannedY,
    width: plannedWidth,
    height: plannedHeight,
    fontFamily: font.fontFamily ?? declaredText?.fontFamily,
    fontStyle: declaredText?.fontStyle,
    fontSize: font.fontSize ?? declaredText?.fontSize,
    lineHeight: font.lineHeight ?? declaredText?.lineHeight,
    letterSpacing: font.letterSpacing ?? declaredText?.letterSpacing,
    fontWeight: font.fontWeight,
    textAlignHorizontal: plannedTextAlign,
    textAutoResize: plannedTextAutoResize
  };
  if (colorRaw && hasRenderablePaint(colorRaw, node.computedStyle?.opacity ?? 1)) {
    createTextPayload.fills = lowerAnyPaint(colorRaw, node.computedStyle?.opacity ?? 1);
  }
  actions.push({ id: `${ref}:create_text`, type: 'create_text', uiId: node.uiId, payload: { ref, parentRef, uiId: node.uiId, name: figmaName, text: node.text ?? '', x: plannedX, y: plannedY } });
  commands.push({ type: 'create_text', payload: createTextPayload });
};

const planContainerNode = (node: UiNode, parentNode: UiNode | undefined, parentRef: string | undefined, actions: PlannerAction[], commands: FigmaCommandStep[], isRoot: boolean): void => {
  const needsReview = Boolean(node.confidence?.needsReview);
  const placeholderReasons = placeholderReasonsForNode(node);
  const renderAsPlaceholder = shouldRenderAsRedPlaceholder(node);
  const ref = node.uiId;
  const createType = inferContainerCommand(node, isRoot);
  const viewportWidth = node.responsive?.viewportWidth;
  const viewportHeight = node.responsive?.viewportHeight;
  const width = isRoot ? Math.max(node.boundingBox?.width ?? node.size?.width ?? node.computedStyle?.width ?? 0, viewportWidth ?? 1440) : (node.boundingBox?.width ?? node.size?.width ?? node.computedStyle?.width ?? 320);
  const height = isRoot ? Math.max(node.boundingBox?.height ?? node.size?.height ?? node.computedStyle?.height ?? 0, viewportHeight ?? 900) : (node.boundingBox?.height ?? node.size?.height ?? node.computedStyle?.height ?? 120);
  let x = isRoot ? (node.boundingBox?.x ?? node.position?.x ?? 0) : relativeCoordinate(node.boundingBox?.x ?? node.position?.x, parentNode?.boundingBox?.x ?? parentNode?.position?.x);
  if (!isRoot && shouldCenterWithinParent(node, parentNode) && parentNode) { const pw = parentNode.boundingBox?.width ?? parentNode.size?.width; if (pw !== undefined && width !== undefined) x = Math.max(0, (pw - width) / 2); }
  const y = isRoot ? (node.boundingBox?.y ?? node.position?.y ?? 0) : relativeCoordinate(node.boundingBox?.y ?? node.position?.y, parentNode?.boundingBox?.y ?? parentNode?.position?.y);
  const parentUsesAutoLayout = Boolean(parentNode && inferAutoLayoutPayload(parentNode));

  const figmaName = buildFigmaNodeName(node);
  actions.push({ id: `${ref}:create`, type: createType, uiId: node.uiId, payload: { ref, parentRef, width, height, x, y, name: figmaName } });
  commands.push({ type: createType, payload: { ref, parentRef, uiId: node.uiId, name: figmaName, width, height, x, y } });

  const autoLayout = inferAutoLayoutPayload(node);
  if (autoLayout) {
    actions.push({ id: `${ref}:auto_layout`, type: 'set_auto_layout', uiId: node.uiId, payload: { nodeRef: ref, source: 'rendered', autoLayout } });
    commands.push({ type: 'set_auto_layout', payload: { nodeRef: ref, ...autoLayout } });
  }

  const padding = (autoLayout?.padding as { top?: number; right?: number; bottom?: number; left?: number } | undefined) ?? node.layout?.padding ?? node.padding;
  if (padding) commands.push({ type: 'set_padding', payload: { nodeRef: ref, paddingTop: padding.top, paddingRight: padding.right, paddingBottom: padding.bottom, paddingLeft: padding.left } });
  const spacing = node.layout?.gap ?? node.spacing ?? node.computedStyle?.gap ?? node.computedStyle?.rowGap ?? node.computedStyle?.columnGap;
  if (spacing !== undefined) commands.push({ type: 'set_spacing', payload: { nodeRef: ref, itemSpacing: spacing } });
  if (autoLayout) {
    actions.push({ id: `${ref}:alignment`, type: 'set_alignment', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_alignment', payload: { nodeRef: ref, alignment: { primaryAxisAlignItems: autoLayout.primaryAxisAlignItems, counterAxisAlignItems: autoLayout.counterAxisAlignItems } } });
  }

  const fillRaw = resolvedBackgroundPaintRaw(node);
  if (shouldEmitFillReset(node) || shouldSuppressDefaultWhiteFill(node)) {
    actions.push({ id: `${ref}:fill_clear`, type: 'set_fill', uiId: node.uiId, payload: { nodeRef: ref, source: 'rendered-transparent' } });
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: [] } });
  }
  if (isMeaningfulPaintRaw(fillRaw) && !shouldEmitFillReset(node) && !shouldSuppressDefaultWhiteFill(node) && !isWrapperLikeNode(node) && hasRenderablePaint(fillRaw, node.computedStyle?.opacity ?? 1)) {
    actions.push({ id: `${ref}:fill`, type: 'set_fill', uiId: node.uiId, payload: { nodeRef: ref, source: 'rendered' } });
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: lowerAnyPaint(fillRaw, node.computedStyle?.opacity ?? 1), token: node.semanticTokens?.fill ?? node.tokens?.fill, figmaVariableId: getTokenBinding(node, 'fill')?.figmaVariableId, figmaStyleId: getTokenBinding(node, 'fill')?.figmaStyleId } });
  }

  const strokeRaw = paintRaw(node.declarativeStyle?.stroke ?? node.style?.stroke) ?? node.computedStyle?.borderColor;
  if (hasMeaningfulStroke(node, strokeRaw)) {
    actions.push({ id: `${ref}:stroke`, type: 'set_stroke', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_stroke', payload: { nodeRef: ref, strokes: lowerPaint(strokeRaw, 1), strokeWeight: node.computedStyle?.borderWidth, strokeStyle: node.computedStyle?.borderStyle, token: node.semanticTokens?.stroke ?? node.tokens?.stroke } });
  }

  const radius = node.declarativeStyle?.radius ?? node.style?.radius ?? node.computedStyle?.borderRadius;
  if (radius !== undefined && supportsCornerRadiusNode(node)) {
    actions.push({ id: `${ref}:radius`, type: 'set_radius', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_corner_radius', payload: { nodeRef: ref, cornerRadius: radius, token: node.semanticTokens?.radius ?? node.tokens?.radius, figmaVariableId: getTokenBinding(node, 'radius')?.figmaVariableId } });
  }
  if (hasMeaningfulEffects(node.computedStyle?.boxShadow)) {
    actions.push({ id: `${ref}:effects`, type: 'set_effects', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_effects', payload: { nodeRef: ref, boxShadow: node.computedStyle?.boxShadow } });
  }

  const deferSizeUntilAfterChildren = Boolean(autoLayout && (node.children.length > 0 || node.kind === 'button' || ((node.computedStyle?.display === 'inline-flex' || node.computedStyle?.display === 'flex') && (Boolean(node.text) || Boolean(node.icon?.sourceType)))));
  if ((width || height) && !deferSizeUntilAfterChildren) {
    actions.push({ id: `${ref}:size`, type: 'set_size', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_size', payload: { nodeRef: ref, width, height } });
  }
  if (renderAsPlaceholder) {
    actions.push({ id: `${ref}:placeholder_fill`, type: 'set_fill', uiId: node.uiId, payload: { nodeRef: ref, source: 'placeholder' } });
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: lowerAnyPaint('rgba(255, 0, 0, 0.22)', 1) } });
    actions.push({ id: `${ref}:placeholder_stroke`, type: 'set_stroke', uiId: node.uiId, payload: { nodeRef: ref, source: 'placeholder' } });
    commands.push({ type: 'set_stroke', payload: { nodeRef: ref, strokes: lowerAnyPaint('rgb(255, 0, 0)', 1), strokeWeight: Math.max(2, node.computedStyle?.borderWidth ?? 2) } });
    commands.push({ type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'render-fallback', value: placeholderReasons.join(', ') || 'unsupported-render-block' } } });
  }
  const isAbsoluteNode = ['absolute', 'fixed', 'sticky'].includes(node.computedStyle?.position ?? '');
  if ((x !== undefined || y !== undefined) && !isRoot && (!parentUsesAutoLayout || isAbsoluteNode)) {
    actions.push({ id: `${ref}:position`, type: 'set_position', uiId: node.uiId, payload: { nodeRef: ref } });
    commands.push({ type: 'set_position', payload: { nodeRef: ref, x, y } });
  }


  const renderedMeta = node.meta && typeof node.meta.rendered === 'object' ? (node.meta.rendered as Record<string, unknown>) : undefined;
  const renderedForm = renderedMeta && typeof renderedMeta.form === 'object' ? (renderedMeta.form as Record<string, unknown>) : undefined;
  const inputType = typeof renderedForm?.inputType === 'string' ? renderedForm.inputType : undefined;
  const placeholder = typeof renderedForm?.placeholder === 'string' ? renderedForm.placeholder : undefined;
  const checked = Boolean(renderedForm?.checked);

  if (node.kind === 'input' && (inputType === 'checkbox' || inputType === 'radio' || node.meta && String(renderedForm?.inputType || '').includes('checkbox') || String(node.computedStyle?.display || '') === 'block' && renderedMeta && ((renderedMeta as any).semantics?.role === 'switch'))) {
    const knobRef = `${ref}.knob`;
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: lowerAnyPaint(checked ? 'rgb(13, 110, 253)' : 'rgb(206, 212, 218)', 1) } });
    commands.push({ type: 'set_corner_radius', payload: { nodeRef: ref, cornerRadius: Math.max(10, (node.boundingBox?.height ?? 24) / 2) } });
    commands.push({ type: 'create_frame', payload: { ref: knobRef, parentRef: ref, uiId: `${node.uiId}.knob`, name: 'div-switch-knob', width: Math.max(14, (node.boundingBox?.height ?? 24) - 4), height: Math.max(14, (node.boundingBox?.height ?? 24) - 4), x: checked ? Math.max(2, (node.boundingBox?.width ?? 44) - ((node.boundingBox?.height ?? 24) - 2)) : 2, y: 2 } });
    commands.push({ type: 'set_fill', payload: { nodeRef: knobRef, fills: lowerAnyPaint('rgb(255, 255, 255)', 1) } });
    commands.push({ type: 'set_corner_radius', payload: { nodeRef: knobRef, cornerRadius: Math.max(7, ((node.boundingBox?.height ?? 24) - 4) / 2) } });
  }

  if (node.kind === 'input' && placeholder && inputType !== 'checkbox' && inputType !== 'radio') {
    const placeholderRef = `${ref}.placeholder`;
    const pad = node.padding ?? node.layout?.padding;
    commands.push({ type: 'create_text', payload: { ref: placeholderRef, parentRef: ref, uiId: `${node.uiId}.placeholder`, name: 'text-input-placeholder', text: placeholder, x: pad?.left ?? 12, y: pad?.top ?? 8 } });
    commands.push({ type: 'set_text_style', payload: { nodeRef: placeholderRef, fontFamily: node.computedStyle?.fontFamily, fontSize: node.computedStyle?.fontSize, lineHeight: node.computedStyle?.lineHeight, fontWeight: node.computedStyle?.fontWeight, textAlignHorizontal: lowerTextAlign(node.computedStyle?.textAlign) } });
    commands.push({ type: 'set_fill', payload: { nodeRef: placeholderRef, fills: lowerAnyPaint('rgba(108, 117, 125, 0.75)', 1) } });
  }

  if (node.asset?.layer) {
    const figmaStrategy = (needsReview || renderAsPlaceholder) ? 'placeholder' : (node.asset.figmaStrategy ?? (node.asset.sourceUrl || node.asset.resolvedAssetPath ? 'image_fill' : 'placeholder'));
    commands.push({ type: 'set_asset_reference', payload: { nodeRef: ref, layer: node.asset.layer, sourceUrl: node.asset.sourceUrl, resolvedAssetPath: node.asset.resolvedAssetPath, alt: node.asset.alt, placeholder: figmaStrategy === 'placeholder', figmaStrategy } });
  }

  if (node.icon?.sourceType) {
    const figmaStrategy = (needsReview || renderAsPlaceholder) ? 'placeholder' : (node.icon.figmaStrategy ?? 'vector_icon');
    actions.push({ id: `${ref}:icon`, type: 'set_icon', uiId: node.uiId, payload: { nodeRef: ref, sourceType: node.icon.sourceType } });
    commands.push({ type: 'set_icon_reference', payload: { nodeRef: ref, sourceType: node.icon.sourceType, textLabel: node.icon.textLabel, svgMarkup: node.icon.svgMarkup, fill: node.icon.fill, stroke: node.icon.stroke, size: node.icon.size, placement: node.icon.placement, spriteRef: node.icon.spriteRef, hash: node.icon.hash, assetId: node.icon.assetId, figmaStrategy } });
  }

  const iconOnlyChildren = node.children.length > 0 && node.children.every((child) => child.kind === 'icon');
  if ((node.kind === 'button' || ((node.kind === 'frame' || node.kind === 'group') && node.text && (node.children.length === 0 || iconOnlyChildren))) && (node.text || node.name)) {
    const labelUiId = `${node.uiId}.label`;
    const font = node.computedStyle ?? {};
    const labelText = node.text ?? node.name ?? 'Label';
    commands.push({
      type: 'create_text',
      payload: {
        ref: labelUiId,
        parentRef: ref,
        uiId: labelUiId,
        name: 'text-button-label',
        text: labelText,
        fontSize: font.fontSize,
        fontFamily: font.fontFamily,
        fontWeight: font.fontWeight,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        textAlignHorizontal: lowerTextAlign(font.textAlign),
        fills: lowerAnyPaint(font.color, 1)
      }
    });
  }
};

const shouldDeferContainerSize = (node: UiNode): boolean => Boolean(inferAutoLayoutPayload(node) && (node.children.length > 0 || node.kind === 'button' || ((node.computedStyle?.display === 'inline-flex' || node.computedStyle?.display === 'flex') && (Boolean(node.text) || Boolean(node.icon?.sourceType)))));

const emitDeferredContainerSize = (node: UiNode, actions: PlannerAction[], commands: FigmaCommandStep[], isRoot = false): void => {
  if (!shouldDeferContainerSize(node)) return;
  const viewportWidth = node.responsive?.viewportWidth;
  const viewportHeight = node.responsive?.viewportHeight;
  const width = isRoot ? Math.max(node.boundingBox?.width ?? node.size?.width ?? node.computedStyle?.width ?? 0, viewportWidth ?? 1440) : (node.boundingBox?.width ?? node.size?.width ?? node.computedStyle?.width ?? 320);
  const height = isRoot ? Math.max(node.boundingBox?.height ?? node.size?.height ?? node.computedStyle?.height ?? 0, viewportHeight ?? 900) : (node.boundingBox?.height ?? node.size?.height ?? node.computedStyle?.height ?? 120);
  if (!(width || height)) return;
  actions.push({ id: `${node.uiId}:size`, type: 'set_size', uiId: node.uiId, payload: { nodeRef: node.uiId, deferred: true } });
  commands.push({ type: 'set_size', payload: { nodeRef: node.uiId, width, height } });
};

const planNode = (node: UiNode, parentNode: UiNode | undefined, parentRef: string | undefined, actions: PlannerAction[], commands: FigmaCommandStep[], isRoot = false): void => {
  if (node.kind === 'text') {
    planTextNode(node, parentNode, parentRef, actions, commands);
    return;
  }
  if (shouldSkipTransparentTextWrapper(node)) {
    for (const child of node.children) planNode(child, parentNode, parentRef, actions, commands, false);
    return;
  }
  planContainerNode(node, parentNode, parentRef, actions, commands, isRoot);
  if (shouldRenderAsRedPlaceholder(node)) return;
  for (const child of node.children) planNode(child, node, node.uiId, actions, commands, false);
  emitDeferredContainerSize(node, actions, commands, isRoot);
};

export const buildCodeToFigmaPlan = (model: UiModelDocument, componentName: string, filePath: string): CodeToFigmaExecutionPlan => {
  const actions: PlannerAction[] = [];
  const commands: FigmaCommandStep[] = [];
  planNode(model.root, undefined, undefined, actions, commands, true);
  return { componentName, filePath, model, actions, commands };
};

export class CodeToFigmaPipelineService {
  constructor(
    private readonly codeUiParserService: CodeUiParserService,
    private readonly renderedToCodeMapperService: RenderedToCodeMapperService,
    private readonly pluginBridgeService: PluginBridgeService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public async run(input: z.input<typeof codeToFigmaPipelineSchema>): Promise<CodeToFigmaPipelineResult> {
    const data = codeToFigmaPipelineSchema.parse(input);
    visualLogger.info({ project: data.project, componentName: data.componentName, filePath: data.filePath, hasRender: Boolean(data.render), uiIds: data.uiIds }, 'code-to-figma run start');
    const parsed = this.codeUiParserService.parseProject({ rootDir: data.rootDir, project: data.project, componentName: data.componentName, filePath: data.filePath, limit: 1 });
    const component = parsed.components[0];
    if (!component) throw new AppError('No React component was parsed for Code → Figma pipeline', 404, 'CODE_UI_COMPONENT_NOT_FOUND');

    const codeRoot = data.uiIds?.length ? findNodeByUiId(component.tree.root, data.uiIds[0]) ?? component.tree.root : component.tree.root;
    let model: UiModelDocument = data.uiIds?.length ? { version: 'ui-model.v1', root: codeRoot } : component.tree;
    let renderedUsed = false;
    if (data.render) {
      const rendered = await this.renderedToCodeMapperService.map({ project: data.project, rootDir: data.rootDir, render: data.render as unknown as Record<string, unknown> });
      const renderedRoot = data.uiIds?.length ? findNodeByUiId(rendered.rendered.root, codeRoot.uiId) ?? rendered.rendered.root : rendered.rendered.root;
      model = segmentVisualBlocks({ version: 'ui-model.v1', root: mergeNode(codeRoot, renderedRoot) });
      renderedUsed = true;
    }

    annotateVisualConfidence(model);
    visualLogger.info({ renderedUsed, root: summarizeNode(model.root) }, 'code-to-figma model ready');
    const plan = buildCodeToFigmaPlan(model, component.componentName, component.filePath);
    const acceptance = auditFirstPassVisualAcceptance(plan.model);
    const needsReview: Array<{ uiId: string; visual: number; reasons: string[] }> = [];
    const collectNeedsReview = (node: UiNode): void => { if (node.confidence?.needsReview) needsReview.push({ uiId: node.uiId, visual: node.confidence.visual, reasons: node.confidence.reasons }); node.children.forEach(collectNeedsReview); };
    collectNeedsReview(plan.model.root);
    if (!acceptance.passed) {
      needsReview.push({ uiId: plan.model.root.uiId, visual: plan.model.root.confidence?.visual ?? 0, reasons: ['first-pass visual acceptance failed', ...acceptance.issues] });
      plan.model.root.meta = { ...(plan.model.root.meta ?? {}), needsReview: true, firstPassAcceptance: acceptance };
    }
    const liveSession = !data.dryRun
      ? this.pluginBridgeService.assertSingleActiveSessionForFile({ sessionId: data.sessionId, fileKey: data.fileKey, clientName: data.clientName })
      : undefined;

    const notes: string[] = [
      renderedUsed ? 'Planner used rendered snapshot as primary visual source.' : 'Planner used code model only; AST values served as visual fallback.',
      'AST remained the source for mapping, semantic structure and fallback values.',
      "Execution plan translated into editable Figma-native commands.",
      ...(needsReview.length ? ["Low-confidence nodes were marked as needs review and complex Figma asset/icon creation was skipped."] : []),
      ...(!acceptance.passed ? [`First-pass visual acceptance failed: ${acceptance.issues.join('; ')}. Result should not be treated as final without refinement.`, ...(data.dryRun ? [] : ['Live Figma batch was blocked because first-pass acceptance did not pass.'])] : ['First-pass visual acceptance passed.'])
    ];

    let queued: CodeToFigmaPipelineResult['queued'];
    if (!data.dryRun && acceptance.passed) {
      const session = liveSession!;
      const command = this.pluginBridgeService.queueExecutePluginBatch({ sessionId: session.sessionId, fileKey: data.fileKey ?? session.fileKey, commands: plan.commands, actorId: 'code-to-figma-pipeline' });
      queued = { sessionId: session.sessionId, commandId: command.commandId, status: command.status };
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
        figma: { fileKey: data.fileKey ?? 'pending', nodeId: `pending:${node.uiId}`, snapshotHash: undefined, snapshot: {} },
        sync: { lastDirection: 'code_to_figma', lastSyncedAt: new Date().toISOString(), lastCodeHash: makeHash(node), lastFigmaHash: undefined }
      });
    }

    visualLogger.info({ componentName: component.componentName, actionCount: plan.actions.length, commandCount: plan.commands.length, mappingCount: nodes.length, needsReviewCount: needsReview.length, acceptance, queued }, 'code-to-figma run done');
    return { componentName: component.componentName, filePath: component.filePath, model, plan, queued, mappingCount: nodes.length, acceptance, needsReview, notes };
  }
}
