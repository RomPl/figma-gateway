import type { DesignTokenRecord, DesignTokenService } from './design-token-registry';
import type { UiModelDocument, UiNode } from './ui-model';

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

const getFillValue = (node: UiNode): string | undefined => {
  const fill = node.style?.fill;
  if (!fill) return undefined;
  return typeof fill === 'string' ? fill : fill.value;
};

const getClassTokens = (node: UiNode): string[] => {
  const className = typeof node.meta?.className === 'string' ? node.meta.className : '';
  return className.split(/\s+/).map((item) => item.trim()).filter(Boolean);
};

const attachBinding = (node: UiNode, key: string, token: DesignTokenRecord): void => {
  node.meta = node.meta ?? {};
  const bindings = typeof node.meta.tokenBindings === 'object' && node.meta.tokenBindings ? (node.meta.tokenBindings as Record<string, unknown>) : {};
  bindings[key] = {
    token: token.token,
    raw: token.value.raw,
    cssVar: token.value.cssVar ?? token.code.cssVar ?? undefined,
    tailwind: token.value.tailwind ?? token.code.className ?? undefined,
    className: token.code.className ?? token.value.tailwind ?? undefined,
    figmaVariableId: token.figma.variableId,
    figmaStyleId: token.figma.styleId,
    figmaName: token.figma.name
  };
  node.meta.tokenBindings = bindings;
};

const byNumeric = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], numeric: number | undefined): DesignTokenRecord | null => {
  if (numeric === undefined) return null;
  const tokens = service.listDesignTokens({ project, type, limit: 100 });
  return tokens.find((token) => token.value.numeric === numeric || token.value.raw === String(numeric)) ?? null;
};

const byClass = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], classes: string[]): DesignTokenRecord | null => {
  for (const item of classes) {
    const token = service.resolveCodeTokenHint({ project, type, className: item });
    if (token) return token;
  }
  return null;
};

const byRaw = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], raw: string | undefined): DesignTokenRecord | null => {
  if (!raw) return null;
  return service.resolveCodeTokenHint({ project, type, raw }) ?? service.resolveFigmaTokenHint({ project, type, raw }) ?? null;
};

export const annotateDocumentWithTokens = (
  document: UiModelDocument,
  designTokenService: DesignTokenService | undefined,
  project?: string
): UiModelDocument => {
  if (!designTokenService) return document;
  walk(document.root, (node) => {
    node.tokens = node.tokens ?? {};
    const classes = getClassTokens(node);

    const fillToken = byClass(designTokenService, project, 'colors', classes) ?? byRaw(designTokenService, project, 'colors', getFillValue(node));
    if (fillToken) {
      node.tokens!.fill = fillToken.token;
      attachBinding(node, 'fill', fillToken);
      const fill = node.style?.fill;
      if (typeof fill === 'string') node.style = { ...(node.style ?? {}), fill: { value: fill, token: fillToken.token } };
      if (fill && typeof fill === 'object') node.style = { ...(node.style ?? {}), fill: { ...fill, token: fillToken.token } };
    }

    const spacingToken = byClass(designTokenService, project, 'spacing', classes) ?? byNumeric(designTokenService, project, 'spacing', node.layout?.gap ?? node.spacing);
    if (spacingToken) {
      node.tokens!.spacing = spacingToken.token;
      attachBinding(node, 'spacing', spacingToken);
    }

    const radiusToken = byClass(designTokenService, project, 'radius', classes) ?? byNumeric(designTokenService, project, 'radius', node.style?.radius);
    if (radiusToken) {
      node.tokens!.radius = radiusToken.token;
      attachBinding(node, 'radius', radiusToken);
    }

    const typographyToken = byClass(designTokenService, project, 'typography', classes) ?? byNumeric(designTokenService, project, 'typography', node.style?.text?.fontSize);
    if (typographyToken) {
      node.tokens!.typography = typographyToken.token;
      attachBinding(node, 'typography', typographyToken);
    }

    const shadowToken = byClass(designTokenService, project, 'shadows', classes);
    if (shadowToken) {
      node.tokens!.shadow = shadowToken.token;
      attachBinding(node, 'shadow', shadowToken);
    }

    const breakpointMatches = classes.filter((item) => /^(sm:|md:|lg:|xl:|2xl:)/.test(item));
    if (breakpointMatches.length) {
      const token = byClass(designTokenService, project, 'breakpoints', breakpointMatches);
      if (token) {
        node.tokens!.breakpoint = token.token;
        attachBinding(node, 'breakpoint', token);
      }
    }

    if (Object.keys(node.tokens ?? {}).length === 0) delete node.tokens;
  });
  return document;
};
