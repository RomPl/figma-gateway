import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

import { AppError } from './errors';
import type { UiNode } from './ui-model';

export const codePatchRequestSchema = z.object({
  rootDir: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
  uiId: z.string().trim().min(1),
  node: z.any(),
  apply: z.coerce.boolean().default(false)
});

export type CodePatchResult = {
  filePath: string;
  uiId: string;
  applied: boolean;
  changed: boolean;
  before: string;
  after: string;
};

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

type OriginalContext = {
  node: JsxNode;
  tagName: string;
  preservedAttributes: string[];
};

const MANAGED_ATTRIBUTES = new Set(['data-ui-id', 'className', 'style']);
const INDENT = '  ';

const getJsxAttribute = (attributes: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined =>
  attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);

const getDataUiId = (node: JsxNode): string | undefined => {
  const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const attr = getJsxAttribute(attrs, 'data-ui-id');
  if (!attr?.initializer) return undefined;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isStringLiteralLike(attr.initializer.expression)) {
    return attr.initializer.expression.text;
  }
  return undefined;
};

const collectUiIdMap = (root: JsxNode): Map<string, OriginalContext> => {
  const map = new Map<string, OriginalContext>();
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const uiId = getDataUiId(node);
      if (uiId) {
        const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        const preservedAttributes = attrs.properties
          .filter((property): property is ts.JsxAttribute => ts.isJsxAttribute(property))
          .filter((property) => !MANAGED_ATTRIBUTES.has(property.name.getText()))
          .map((property) => property.getText());
        map.set(uiId, {
          node,
          tagName: ts.isJsxElement(node) ? node.openingElement.tagName.getText() : node.tagName.getText(),
          preservedAttributes
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return map;
};

const hasUnsafeExpressions = (root: JsxNode): boolean => {
  let unsafe = false;
  const visit = (node: ts.Node): void => {
    if (unsafe) return;
    if (ts.isJsxSpreadAttribute(node)) {
      unsafe = true;
      return;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const expression = node.expression;
      const parent = node.parent;
      const isAttributeInitializer = ts.isJsxAttribute(parent);
      if (!isAttributeInitializer && !ts.isStringLiteralLike(expression) && !ts.isNoSubstitutionTemplateLiteral(expression)) {
        unsafe = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return unsafe;
};

const getTokenBinding = (node: UiNode, key: string): Record<string, unknown> | undefined => {
  const bindings = node.meta && typeof node.meta.tokenBindings === 'object' ? node.meta.tokenBindings as Record<string, unknown> : undefined;
  const binding = bindings && typeof bindings[key] === 'object' ? bindings[key] as Record<string, unknown> : undefined;
  return binding;
};

const pushClassToken = (classes: string[], value: unknown): void => {
  if (typeof value !== 'string' || !value.trim()) return;
  for (const part of value.split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
    if (!classes.includes(part)) classes.push(part);
  }
};

const nearestScaleToken = (value: number): string => {
  const scale: Array<[string, number]> = [
    ['0', 0], ['0.5', 2], ['1', 4], ['1.5', 6], ['2', 8], ['2.5', 10], ['3', 12], ['3.5', 14], ['4', 16], ['5', 20], ['6', 24], ['8', 32], ['10', 40], ['12', 48], ['16', 64]
  ];
  let best = scale[0];
  let diff = Math.abs(value - best[1]);
  for (const item of scale) {
    const currentDiff = Math.abs(value - item[1]);
    if (currentDiff < diff) {
      best = item;
      diff = currentDiff;
    }
  }
  return best[0];
};

const buildManagedClassName = (node: UiNode): string | undefined => {
  const classes: string[] = [];
  const spacingBinding = getTokenBinding(node, 'spacing');
  const radiusBinding = getTokenBinding(node, 'radius');
  const typographyBinding = getTokenBinding(node, 'typography');
  const fillBinding = getTokenBinding(node, 'fill');
  const shadowBinding = getTokenBinding(node, 'shadow');

  if (!node.visible) classes.push('hidden');
  if (node.layout?.type === 'vertical' || node.layout?.type === 'horizontal') {
    classes.push('flex');
    classes.push(node.layout.type === 'vertical' ? 'flex-col' : 'flex-row');
  }
  pushClassToken(classes, spacingBinding?.className ?? spacingBinding?.tailwind);
  if (!spacingBinding) {
    const gap = node.layout?.gap ?? node.spacing;
    if (gap !== undefined) classes.push(`gap-${nearestScaleToken(gap)}`);
  }
  pushClassToken(classes, radiusBinding?.className ?? radiusBinding?.tailwind);
  if (!radiusBinding && node.style?.radius !== undefined) {
    const radius = node.style.radius;
    const rounded = radius >= 16 ? 'rounded-2xl' : radius >= 12 ? 'rounded-xl' : radius >= 8 ? 'rounded-lg' : radius >= 6 ? 'rounded-md' : radius > 0 ? 'rounded-sm' : '';
    if (rounded) classes.push(rounded);
  }
  pushClassToken(classes, typographyBinding?.className ?? typographyBinding?.tailwind);
  if (!typographyBinding) {
    if (node.style?.text?.textAlign === 'center') classes.push('text-center');
    if (node.style?.text?.textAlign === 'right') classes.push('text-right');
    if (node.style?.text?.fontSize) {
      const size = node.style.text.fontSize;
      const token = size >= 48 ? 'text-5xl' : size >= 36 ? 'text-4xl' : size >= 30 ? 'text-3xl' : size >= 24 ? 'text-2xl' : size >= 20 ? 'text-xl' : size >= 18 ? 'text-lg' : size >= 14 ? 'text-sm' : 'text-xs';
      classes.push(token);
    }
  }
  pushClassToken(classes, fillBinding?.className ?? fillBinding?.tailwind);
  pushClassToken(classes, shadowBinding?.className ?? shadowBinding?.tailwind);
  return classes.length ? Array.from(new Set(classes)).join(' ') : undefined;
};

const toStyleEntries = (node: UiNode): string[] => {
  const entries: string[] = [];
  const fillBinding = getTokenBinding(node, 'fill');
  if (node.layout?.type === 'vertical' || node.layout?.type === 'horizontal') {
    entries.push(`display: 'flex'`);
    entries.push(`flexDirection: '${node.layout.type === 'vertical' ? 'column' : 'row'}'`);
  }
  if (node.layout?.gap !== undefined || node.spacing !== undefined) entries.push(`gap: ${node.layout?.gap ?? node.spacing}`);
  if (node.padding) {
    entries.push(`paddingTop: ${node.padding.top}`);
    entries.push(`paddingRight: ${node.padding.right}`);
    entries.push(`paddingBottom: ${node.padding.bottom}`);
    entries.push(`paddingLeft: ${node.padding.left}`);
  }
  if (node.style?.radius !== undefined) entries.push(`borderRadius: ${node.style.radius}`);
  if (node.style?.fill) {
    const fill = typeof node.style.fill === 'string' ? node.style.fill : node.style.fill.value;
    const cssVar = typeof fillBinding?.cssVar === 'string' ? fillBinding.cssVar : undefined;
    if (cssVar) entries.push(`${node.kind === 'text' ? 'color' : 'backgroundColor'}: 'var(${cssVar})'`);
    else if (fill) entries.push(`${node.kind === 'text' ? 'color' : 'backgroundColor'}: '${fill}'`);
  }
  if (node.style?.text?.fontFamily) entries.push(`fontFamily: '${node.style.text.fontFamily}'`);
  if (node.style?.text?.fontSize !== undefined) entries.push(`fontSize: ${node.style.text.fontSize}`);
  if (node.style?.text?.lineHeight !== undefined) entries.push(`lineHeight: ${node.style.text.lineHeight}`);
  if (node.style?.text?.letterSpacing !== undefined) entries.push(`letterSpacing: ${node.style.text.letterSpacing}`);
  if (!node.visible) entries.push(`display: 'none'`);
  return entries;
};

const inferTagName = (node: UiNode, original?: OriginalContext): string => {
  if (original?.tagName) return original.tagName;
  switch (node.kind) {
    case 'section': return 'section';
    case 'text': return node.role === 'headline' ? 'h1' : 'p';
    case 'button': return 'button';
    case 'input': return 'input';
    case 'image': return 'img';
    case 'list': return 'ul';
    default: return 'div';
  }
};

const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderOpening = (node: UiNode, original: OriginalContext | undefined): { tag: string; attrs: string[] } => {
  const tag = inferTagName(node, original);
  const attrs: string[] = [`data-ui-id="${node.uiId}"`];
  const className = buildManagedClassName(node);
  if (className) attrs.push(`className="${className}"`);
  const styleEntries = toStyleEntries(node);
  if (styleEntries.length) attrs.push(`style={{ ${styleEntries.join(', ')} }}`);
  if (node.kind === 'input' && node.name) attrs.push(`placeholder="${node.name}"`);
  if (node.kind === 'image') {
    attrs.push(`alt="${node.name ?? node.uiId}"`);
    if (node.size?.width) attrs.push(`width={${node.size.width}}`);
    if (node.size?.height) attrs.push(`height={${node.size.height}}`);
  }
  if (original) attrs.push(...original.preservedAttributes);
  return { tag, attrs };
};

const renderJsx = (node: UiNode, originalMap: Map<string, OriginalContext>, indentLevel = 0): string => {
  const indent = INDENT.repeat(indentLevel);
  const original = originalMap.get(node.uiId);
  const { tag, attrs } = renderOpening(node, original);
  const open = `${indent}<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
  if (node.kind === 'input' || node.kind === 'image') {
    return `${open} />`;
  }
  const renderedChildren = node.children.map((child) => renderJsx(child, originalMap, indentLevel + 1));
  const textContent = node.text ? escapeText(node.text) : '';
  if (!renderedChildren.length && textContent) {
    return `${open}>${textContent}</${tag}>`;
  }
  if (!renderedChildren.length) {
    return `${open}></${tag}>`;
  }
  const body = [textContent ? `${INDENT.repeat(indentLevel + 1)}${textContent}` : null, ...renderedChildren]
    .filter((value): value is string => Boolean(value))
    .join('\n');
  return `${open}>\n${body}\n${indent}</${tag}>`;
};

const findJsxNodeByUiId = (sourceFile: ts.SourceFile, uiId: string): JsxNode | null => {
  let found: JsxNode | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (getDataUiId(node) === uiId) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

export const patchCodeFile = (input: z.input<typeof codePatchRequestSchema>): CodePatchResult => {
  const data = codePatchRequestSchema.parse(input);
  const absolutePath = resolve(data.rootDir, data.filePath);
  const before = readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, before, ts.ScriptTarget.Latest, true, absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const target = findJsxNodeByUiId(sourceFile, data.uiId);
  if (!target) {
    throw new AppError(`JSX node not found for uiId: ${data.uiId}`, 404, 'JSX_NODE_NOT_FOUND');
  }
  if (hasUnsafeExpressions(target)) {
    throw new AppError(`Unsafe JSX expressions prevent auto-patch for uiId: ${data.uiId}`, 422, 'UNSAFE_CODE_PATCH');
  }
  const originalMap = collectUiIdMap(target);
  const replacement = renderJsx(data.node as UiNode, originalMap, 0);
  const after = `${before.slice(0, target.getStart(sourceFile))}${replacement}${before.slice(target.getEnd())}`;
  if (data.apply && after !== before) {
    writeFileSync(absolutePath, after, 'utf8');
  }
  return {
    filePath: data.filePath,
    uiId: data.uiId,
    applied: data.apply && after !== before,
    changed: after !== before,
    before,
    after
  };
};
