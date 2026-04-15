import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

import { AppError } from './errors';
import type { DesignTokenService } from './design-token-registry';
import { annotateDocumentWithTokens } from './design-token-helpers';
import { uiModelDocumentSchema, type UiEdgeInsets, type UiKind, type UiModelDocument, type UiNode } from './ui-model';

export const parseCodeUiProjectSchema = z.object({
  rootDir: z.string().trim().min(1).optional(),
  project: z.string().trim().min(1).max(128).optional(),
  componentName: z.string().trim().min(1).optional(),
  filePath: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type CodeUiComponentModel = {
  componentName: string;
  filePath: string;
  exportName: string;
  lineStart: number;
  lineEnd: number;
  tree: UiModelDocument;
};

export type CodeUiParseResult = {
  rootDir: string;
  scannedFileCount: number;
  componentCount: number;
  components: CodeUiComponentModel[];
};

type ParserOptions = {
  rootDir: string;
  designTokenService?: DesignTokenService;
};

type TailwindHints = {
  layout?: UiNode['layout'];
  padding?: UiEdgeInsets;
  spacing?: number;
  style?: UiNode['style'];
  visible?: boolean;
};

type ComponentRecord = {
  exportName: string;
  declaration: ts.FunctionLikeDeclaration | ts.FunctionDeclaration;
  sourceFile: ts.SourceFile;
};

const SUPPORTED_EXTENSIONS = new Set(['.tsx', '.jsx']);
const SIZE_SCALE: Record<string, number> = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
  '20': 80,
  '24': 96,
  '32': 128,
  '40': 160,
  '48': 192,
  '56': 224,
  '64': 256
};
const FONT_SIZE_SCALE: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60
};
const DEFAULT_ROOT_DIR = '/home/figma-gateway.vazovski.art';

const asRelativePath = (rootDir: string, filePath: string): string => relative(rootDir, filePath) || filePath;

const collectFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
      files.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
};

const getLineRange = (sourceFile: ts.SourceFile, node: ts.Node): { lineStart: number; lineEnd: number } => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { lineStart: start.line + 1, lineEnd: end.line + 1 };
};

const getJsxAttribute = (attributes: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined =>
  attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);

const getStringLiteralLikeValue = (initializer: ts.JsxAttributeValue | undefined): string | undefined => {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  const expression = initializer.expression;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    return expression.templateSpans.length === 0 ? expression.head.text : undefined;
  }
  return undefined;
};

const parseNumericScale = (token: string): number | undefined => SIZE_SCALE[token];

const parseTailwindPadding = (classNames: string[]): UiEdgeInsets | undefined => {
  const padding: Partial<UiEdgeInsets> = {};
  for (const className of classNames) {
    const all = className.match(/^p-([0-9.]+)$/);
    if (all) {
      const value = parseNumericScale(all[1]);
      if (value !== undefined) {
        padding.top = value; padding.right = value; padding.bottom = value; padding.left = value;
      }
    }
    const axisX = className.match(/^px-([0-9.]+)$/);
    if (axisX) {
      const value = parseNumericScale(axisX[1]);
      if (value !== undefined) {
        padding.right = value; padding.left = value;
      }
    }
    const axisY = className.match(/^py-([0-9.]+)$/);
    if (axisY) {
      const value = parseNumericScale(axisY[1]);
      if (value !== undefined) {
        padding.top = value; padding.bottom = value;
      }
    }
    const edge = className.match(/^p([trbl])-([0-9.]+)$/);
    if (edge) {
      const value = parseNumericScale(edge[2]);
      if (value !== undefined) {
        const key = edge[1] === 't' ? 'top' : edge[1] === 'r' ? 'right' : edge[1] === 'b' ? 'bottom' : 'left';
        padding[key] = value;
      }
    }
  }
  return padding.top !== undefined || padding.right !== undefined || padding.bottom !== undefined || padding.left !== undefined
    ? { top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0 }
    : undefined;
};

const parseTailwindHints = (classNameValue?: string): TailwindHints => {
  if (!classNameValue) return {};
  const classes = classNameValue.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const hints: TailwindHints = {};
  for (const className of classes) {
    if (className === 'flex' && !hints.layout) hints.layout = { type: 'horizontal' };
    if (className === 'flex-col') hints.layout = { ...(hints.layout ?? {}), type: 'vertical' };
    if (className === 'flex-row') hints.layout = { ...(hints.layout ?? {}), type: 'horizontal' };
    const gap = className.match(/^gap-([0-9.]+)$/);
    if (gap) hints.spacing = parseNumericScale(gap[1]);
    const rounded = className.match(/^rounded(?:-([a-z0-9]+))?$/);
    if (rounded) {
      const token = rounded[1] ?? 'md';
      const radius = token === 'sm' ? 2 : token === 'md' ? 6 : token === 'lg' ? 8 : token === 'xl' ? 12 : token === '2xl' ? 16 : token === 'full' ? 9999 : 6;
      hints.style = { ...(hints.style ?? {}), radius };
    }
    const bg = className.match(/^bg-([a-z0-9-]+)$/i);
    if (bg) hints.style = { ...(hints.style ?? {}), fill: bg[1] };
    const txtSize = className.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/);
    if (txtSize) hints.style = { ...(hints.style ?? {}), text: { ...(hints.style?.text ?? {}), fontSize: FONT_SIZE_SCALE[txtSize[1]] } };
    if (className === 'text-center') hints.style = { ...(hints.style ?? {}), text: { ...(hints.style?.text ?? {}), textAlign: 'center' } };
    if (className === 'hidden') hints.visible = false;
  }
  const padding = parseTailwindPadding(classes);
  if (padding) hints.padding = padding;
  return hints;
};

const parseInlineStyleObject = (expression: ts.Expression | undefined): Partial<UiNode> => {
  if (!expression || !ts.isObjectLiteralExpression(expression)) return {};
  const node: Partial<UiNode> = {};
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name.getText();
    const initializer = property.initializer;
    if ((key === 'padding' || key === 'paddingTop' || key === 'paddingRight' || key === 'paddingBottom' || key === 'paddingLeft') && (ts.isNumericLiteral(initializer) || initializer.kind === ts.SyntaxKind.FirstLiteralToken)) {
      const value = Number(initializer.getText());
      node.padding = node.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
      if (key === 'padding') node.padding = { top: value, right: value, bottom: value, left: value };
      if (key === 'paddingTop') node.padding.top = value;
      if (key === 'paddingRight') node.padding.right = value;
      if (key === 'paddingBottom') node.padding.bottom = value;
      if (key === 'paddingLeft') node.padding.left = value;
    }
    if ((key === 'gap' || key === 'rowGap' || key === 'columnGap') && (ts.isNumericLiteral(initializer) || initializer.kind === ts.SyntaxKind.FirstLiteralToken)) {
      node.spacing = Number(initializer.getText());
    }
    if ((key === 'borderRadius') && (ts.isNumericLiteral(initializer) || initializer.kind === ts.SyntaxKind.FirstLiteralToken)) {
      node.style = { ...(node.style ?? {}), radius: Number(initializer.getText()) };
    }
    if (key === 'backgroundColor' && ts.isStringLiteralLike(initializer)) {
      node.style = { ...(node.style ?? {}), fill: initializer.text };
    }
    if (key === 'color' && ts.isStringLiteralLike(initializer)) {
      node.style = { ...(node.style ?? {}), text: { ...(node.style?.text ?? {}), fontFamily: undefined }, fill: initializer.text };
    }
    if (key === 'fontSize' && (ts.isNumericLiteral(initializer) || initializer.kind === ts.SyntaxKind.FirstLiteralToken)) {
      node.style = { ...(node.style ?? {}), text: { ...(node.style?.text ?? {}), fontSize: Number(initializer.getText()) } };
    }
    if (key === 'display' && ts.isStringLiteralLike(initializer) && initializer.text === 'none') {
      node.visible = false;
    }
    if (key === 'flexDirection' && ts.isStringLiteralLike(initializer)) {
      node.layout = { ...(node.layout ?? {}), type: initializer.text === 'column' ? 'vertical' : 'horizontal' };
    }
  }
  return node;
};

const getInlineStyleHints = (attributes: ts.JsxAttributes): Partial<UiNode> => {
  const style = getJsxAttribute(attributes, 'style');
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) return {};
  return parseInlineStyleObject(style.initializer.expression);
};

const inferKind = (tagName: string, classNameValue?: string): UiKind => {
  const lower = tagName.toLowerCase();
  if (lower === 'section') return 'section';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'strong', 'em'].includes(lower)) return 'text';
  if (lower === 'button') return 'button';
  if (lower === 'input') return 'input';
  if (lower === 'img' || lower === 'image') return 'image';
  if (lower === 'svg' || lower === 'icon') return 'icon';
  if (lower === 'ul' || lower === 'ol') return 'list';
  if (classNameValue && /\bcard\b/i.test(classNameValue)) return 'card';
  if (lower === 'main' || lower === 'article' || lower === 'div') return 'frame';
  return 'group';
};

const unwrapJsxExpression = (expression: ts.Expression | undefined): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null => {
  let current = expression;
  while (current && ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  if (current && (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current))) {
    return current;
  }
  return null;
};

const extractTextExpression = (expression: ts.Expression | undefined): string | undefined => {
  if (!expression) return undefined;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text;
  return undefined;
};

const flattenMeaningfulText = (node: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement): string | undefined => {
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const chunks: string[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      const value = child.getText().replace(/\s+/g, ' ').trim();
      if (value) chunks.push(value);
    }
    if (ts.isJsxExpression(child)) {
      const value = extractTextExpression(child.expression);
      if (value) chunks.push(value);
    }
  }
  return chunks.length ? chunks.join(' ') : undefined;
};

const firstChildJsx = (declaration: ts.FunctionLikeDeclaration | ts.FunctionDeclaration): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null => {
  if (declaration.body && ts.isBlock(declaration.body)) {
    for (const statement of declaration.body.statements) {
      if (ts.isReturnStatement(statement)) {
        const jsx = unwrapJsxExpression(statement.expression);
        if (jsx) return jsx;
      }
    }
  }
  if (declaration.body && ts.isExpression(declaration.body)) {
    return unwrapJsxExpression(declaration.body);
  }
  return null;
};

const isLikelyComponentName = (value: string): boolean => /^[A-Z]/.test(value);

const buildComponentRegistry = (filePaths: string[], rootDir: string): Map<string, ComponentRecord> => {
  const registry = new Map<string, ComponentRecord>();
  for (const filePath of filePaths) {
    const sourceText = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && isLikelyComponentName(node.name.text)) {
        registry.set(`${asRelativePath(rootDir, filePath)}#${node.name.text}`, { exportName: node.name.text, declaration: node, sourceFile });
      }
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !isLikelyComponentName(declaration.name.text) || !declaration.initializer) continue;
          if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
            registry.set(`${asRelativePath(rootDir, filePath)}#${declaration.name.text}`, {
              exportName: declaration.name.text,
              declaration: declaration.initializer,
              sourceFile
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  return registry;
};

const buildUiId = (attributes: ts.JsxAttributes, fallback: string): string => {
  const uiIdAttribute = getJsxAttribute(attributes, 'data-ui-id');
  return getStringLiteralLikeValue(uiIdAttribute?.initializer) ?? fallback;
};

const jsxElementName = (node: ts.JsxOpeningLikeElement): string => node.tagName.getText();

const parseJsxNode = (
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
  sourceFile: ts.SourceFile,
  relativePath: string,
  componentName: string,
  registry: Map<string, ComponentRecord>,
  jsxPathSegments: string[],
  fallbackCounter: { value: number }
): UiNode | null => {
  if (ts.isJsxFragment(node)) {
    const children = node.children
      .map((child, index) => parseJsxChild(child, sourceFile, relativePath, componentName, registry, [...jsxPathSegments, `fragment[${index}]`], fallbackCounter))
      .filter((child): child is UiNode => child !== null);
    return {
      kind: 'group',
      uiId: `${componentName}.fragment.${fallbackCounter.value++}`,
      name: 'Fragment',
      visible: true,
      source: { codePath: relativePath, codeExportName: componentName, ...getLineRange(sourceFile, node), jsxPath: jsxPathSegments.join(' > ') },
      children
    };
  }

  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tagName = jsxElementName(opening);
  const className = getStringLiteralLikeValue(getJsxAttribute(opening.attributes, 'className')?.initializer);
  const tailwind = parseTailwindHints(className);
  const inline = getInlineStyleHints(opening.attributes);
  const uiId = buildUiId(opening.attributes, `${componentName}.${tagName.toLowerCase()}.${fallbackCounter.value++}`);
  const source = {
    codePath: relativePath,
    codeExportName: componentName,
    ...getLineRange(sourceFile, node),
    jsxPath: [...jsxPathSegments, tagName].join(' > ')
  };

  if (isLikelyComponentName(tagName)) {
    const localKey = `${relativePath}#${tagName}`;
    const localComponent = registry.get(localKey);
    if (localComponent) {
      const invocationChildren = ts.isJsxElement(node)
        ? node.children
            .map((child, index) => parseJsxChild(child, sourceFile, relativePath, componentName, registry, [...jsxPathSegments, `${tagName}[${index}]`], fallbackCounter))
            .filter((child): child is UiNode => child !== null)
        : [];
      const inner = firstChildJsx(localComponent.declaration);
      const children = inner ? [parseJsxNode(inner, localComponent.sourceFile, relativePath, tagName, registry, [...jsxPathSegments, tagName], fallbackCounter)].filter((child): child is UiNode => child !== null) : [];
      if (children[0] && invocationChildren.length > 0) {
        children[0].children = [...children[0].children, ...invocationChildren];
      }
      return {
        kind: 'component_instance',
        uiId,
        name: tagName,
        visible: tailwind.visible ?? inline.visible ?? true,
        source,
        meta: { wrapper: true },
        children
      };
    }
  }

  const elementChildren = ts.isJsxElement(node)
    ? node.children
        .map((child, index) => parseJsxChild(child, sourceFile, relativePath, componentName, registry, [...jsxPathSegments, `${tagName}[${index}]`], fallbackCounter))
        .filter((child): child is UiNode => child !== null)
    : [];

  const text = flattenMeaningfulText(node);
  const kind = inferKind(tagName, className);
  const parsed: UiNode = {
    kind,
    uiId,
    name: tagName,
    visible: tailwind.visible ?? inline.visible ?? true,
    source,
    children: elementChildren,
    meta: {
      tagName,
      className: className ?? undefined
    }
  };

  if (text && kind === 'text') parsed.text = text;
  if (kind === 'button' && text) parsed.text = text;
  if (kind === 'input') parsed.name = getStringLiteralLikeValue(getJsxAttribute(opening.attributes, 'placeholder')?.initializer) ?? tagName;
  if (tailwind.layout || inline.layout) parsed.layout = { ...(tailwind.layout ?? {}), ...(inline.layout ?? {}) };
  if (tailwind.padding || inline.padding) parsed.padding = inline.padding ?? tailwind.padding;
  if (tailwind.spacing !== undefined || inline.spacing !== undefined) parsed.spacing = inline.spacing ?? tailwind.spacing;
  if (tailwind.style || inline.style) parsed.style = { ...(tailwind.style ?? {}), ...(inline.style ?? {}) };
  const role = getStringLiteralLikeValue(getJsxAttribute(opening.attributes, 'role')?.initializer);
  if (role === 'heading' || /title|headline/i.test(tagName)) parsed.role = 'headline';
  if (kind === 'button') parsed.role = 'button-primary';

  if (kind === 'image') {
    const width = getStringLiteralLikeValue(getJsxAttribute(opening.attributes, 'width')?.initializer);
    const height = getStringLiteralLikeValue(getJsxAttribute(opening.attributes, 'height')?.initializer);
    if (width || height) {
      parsed.size = {
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined
      };
    }
  }

  if (kind === 'text' || (kind === 'frame' && elementChildren.length === 0 && text)) {
    if (text) {
      parsed.kind = 'text';
      parsed.text = text;
    }
  }

  return parsed;
};

const parseJsxChild = (
  child: ts.JsxChild,
  sourceFile: ts.SourceFile,
  relativePath: string,
  componentName: string,
  registry: Map<string, ComponentRecord>,
  jsxPathSegments: string[],
  fallbackCounter: { value: number }
): UiNode | null => {
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
    return parseJsxNode(child, sourceFile, relativePath, componentName, registry, jsxPathSegments, fallbackCounter);
  }
  if (ts.isJsxText(child)) {
    const value = child.getText().replace(/\s+/g, ' ').trim();
    if (!value) return null;
    return {
      kind: 'text',
      uiId: `${componentName}.text.${fallbackCounter.value++}`,
      name: 'Text',
      role: 'body',
      visible: true,
      text: value,
      source: { codePath: relativePath, codeExportName: componentName, ...getLineRange(sourceFile, child), jsxPath: jsxPathSegments.join(' > ') },
      children: []
    };
  }
  if (ts.isJsxExpression(child)) {
    const value = extractTextExpression(child.expression);
    if (!value) return null;
    return {
      kind: 'text',
      uiId: `${componentName}.text.${fallbackCounter.value++}`,
      name: 'Text',
      role: 'body',
      visible: true,
      text: value,
      source: { codePath: relativePath, codeExportName: componentName, ...getLineRange(sourceFile, child), jsxPath: jsxPathSegments.join(' > ') },
      children: []
    };
  }
  return null;
};

const parseComponentFromRecord = (
  record: ComponentRecord,
  rootDir: string,
  registry: Map<string, ComponentRecord>
): CodeUiComponentModel | null => {
  const jsx = firstChildJsx(record.declaration);
  if (!jsx) return null;
  const relativePath = asRelativePath(rootDir, record.sourceFile.fileName);
  const fallbackCounter = { value: 1 };
  const rootNode = parseJsxNode(jsx, record.sourceFile, relativePath, record.exportName, registry, [record.exportName], fallbackCounter);
  if (!rootNode) return null;
  const lines = getLineRange(record.sourceFile, record.declaration);
  return {
    componentName: record.exportName,
    exportName: record.exportName,
    filePath: relativePath,
    lineStart: lines.lineStart,
    lineEnd: lines.lineEnd,
    tree: uiModelDocumentSchema.parse({
      version: 'ui-model.v1',
      root: rootNode
    })
  };
};

export class CodeUiParserService {
  constructor(private readonly options: ParserOptions) {}

  public parseProject(input?: z.input<typeof parseCodeUiProjectSchema>): CodeUiParseResult {
    const data = parseCodeUiProjectSchema.parse(input ?? {});
    const rootDir = resolve(data.rootDir ?? this.options.rootDir ?? DEFAULT_ROOT_DIR);
    let stats;
    try {
      stats = statSync(rootDir);
    } catch {
      throw new AppError(`Code UI root directory not found: ${rootDir}`, 404, 'CODE_UI_ROOT_NOT_FOUND');
    }
    if (!stats.isDirectory()) {
      throw new AppError(`Code UI root path is not a directory: ${rootDir}`, 400, 'CODE_UI_ROOT_INVALID');
    }

    const filePaths = collectFiles(rootDir);
    const registry = buildComponentRegistry(filePaths, rootDir);
    let components = Array.from(registry.values())
      .map((record) => parseComponentFromRecord(record, rootDir, registry))
      .filter((record): record is CodeUiComponentModel => record !== null);

    if (data.filePath) {
      const normalizedFilePath = data.filePath.trim();
      components = components.filter((component) => component.filePath === normalizedFilePath);
    }
    if (data.componentName) {
      const normalizedName = data.componentName.trim();
      components = components.filter((component) => component.componentName === normalizedName);
    }

    components = components.slice(0, data.limit).map((component) => ({
      ...component,
      tree: annotateDocumentWithTokens(component.tree, this.options.designTokenService, data.project)
    }));

    return {
      rootDir,
      scannedFileCount: filePaths.length,
      componentCount: components.length,
      components
    };
  }
}

export const createCodeUiParserService = (rootDir = DEFAULT_ROOT_DIR, designTokenService?: DesignTokenService): CodeUiParserService =>
  new CodeUiParserService({ rootDir, designTokenService });
