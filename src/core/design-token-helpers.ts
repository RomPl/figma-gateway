import type { DesignTokenRecord, DesignTokenService } from './design-token-registry';
import type { UiModelDocument, UiNode } from './ui-model';

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

const getFillValue = (node: UiNode): string | undefined => {
  const fill = node.declarativeStyle?.fill ?? node.style?.fill;
  if (!fill) return undefined;
  return typeof fill === 'string' ? fill : fill.value;
};

const getClassTokens = (node: UiNode): string[] => {
  const className = typeof node.meta?.className === 'string' ? node.meta.className : '';
  return className.split(/\s+/).map((item) => item.trim()).filter(Boolean);
};

const parseNumeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeHex = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith('#')) return trimmed;
  if (trimmed.length === 4) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  return trimmed;
};

const rgbStringToHex = (value: string): string | null => {
  const match = value.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  if (!match) return null;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if ([r, g, b].some((item) => !Number.isFinite(item))) return null;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const normalizeRawValue = (value: string | number | undefined): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return String(value);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const rgbHex = rgbStringToHex(trimmed);
  if (rgbHex) return rgbHex;
  return trimmed.startsWith('#') ? normalizeHex(trimmed) : trimmed;
};

const attachBinding = (node: UiNode, key: string, token: DesignTokenRecord, raw: string | undefined, confidence: number, sources: string[]): void => {
  node.meta = node.meta ?? {};
  const bindings = typeof node.meta.tokenBindings === 'object' && node.meta.tokenBindings ? (node.meta.tokenBindings as Record<string, unknown>) : {};
  bindings[key] = {
    token: token.token,
    raw: raw ?? token.value.raw,
    matchedToken: token.token,
    confidence,
    cssVar: token.value.cssVar ?? token.code.cssVar ?? undefined,
    tailwind: token.value.tailwind ?? token.code.className ?? undefined,
    className: token.code.className ?? token.value.tailwind ?? undefined,
    figmaVariableId: token.figma.variableId,
    figmaStyleId: token.figma.styleId,
    figmaName: token.figma.name,
    mappingSources: sources,
    code: {
      className: token.code.className,
      cssVar: token.code.cssVar,
      stylePath: token.code.stylePath,
      tokenSource: token.code.tokenSource
    },
    figma: {
      variableId: token.figma.variableId,
      styleId: token.figma.styleId,
      name: token.figma.name,
      mode: token.figma.mode
    }
  };
  node.meta.tokenBindings = bindings;
};

const byNumeric = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], numeric: number | undefined): { token: DesignTokenRecord | null; confidence: number; raw?: string; sources: string[] } => {
  if (numeric === undefined) return { token: null, confidence: 0, sources: [] };
  const tokens = service.listDesignTokens({ project, type, limit: 100 });
  const exact = tokens.find((token) => token.value.numeric === numeric || token.value.raw === String(numeric));
  if (exact) return { token: exact, confidence: 1, raw: String(numeric), sources: ['code', 'figma', 'computed'] };
  let best: { token: DesignTokenRecord; delta: number } | null = null;
  for (const token of tokens) {
    if (typeof token.value.numeric !== 'number') continue;
    const delta = Math.abs(token.value.numeric - numeric);
    if (!best || delta < best.delta) best = { token, delta };
  }
  if (!best) return { token: null, confidence: 0, raw: String(numeric), sources: [] };
  const tolerance = type === 'typography' ? 2 : type === 'spacing' || type === 'radius' ? 4 : type === 'breakpoints' ? 48 : 2;
  const confidence = Math.max(0, Number((1 - Math.min(best.delta, tolerance) / tolerance).toFixed(2)));
  return confidence >= 0.55 ? { token: best.token, confidence, raw: String(numeric), sources: ['computed'] } : { token: null, confidence: 0, raw: String(numeric), sources: [] };
};

const byClass = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], classes: string[]): { token: DesignTokenRecord | null; confidence: number; raw?: string; sources: string[] } => {
  for (const item of classes) {
    const token = service.resolveCodeTokenHint({ project, type, className: item });
    if (token) return { token, confidence: 1, raw: item, sources: ['code'] };
  }
  return { token: null, confidence: 0, sources: [] };
};

const byRaw = (service: DesignTokenService, project: string | undefined, type: DesignTokenRecord['type'], raw: string | undefined): { token: DesignTokenRecord | null; confidence: number; raw?: string; sources: string[] } => {
  if (!raw) return { token: null, confidence: 0, sources: [] };
  const normalized = normalizeRawValue(raw);
  if (!normalized) return { token: null, confidence: 0, sources: [] };
  const code = service.resolveCodeTokenHint({ project, type, raw: normalized });
  if (code) return { token: code, confidence: 1, raw: normalized, sources: ['code'] };
  const figma = service.resolveFigmaTokenHint({ project, type, raw: normalized });
  if (figma) return { token: figma, confidence: 1, raw: normalized, sources: ['figma'] };
  const tokens = service.listDesignTokens({ project, type, limit: 100 });
  if (type === 'colors') {
    const best = tokens
      .map((token) => ({ token, score: normalizeRawValue(token.value.raw) === normalized ? 1 : 0 }))
      .sort((a, b) => b.score - a.score)[0];
    if (best?.score === 1) return { token: best.token, confidence: 1, raw: normalized, sources: ['computed'] };
  }
  return { token: null, confidence: 0, raw: normalized, sources: [] };
};

const setSemanticToken = (node: UiNode, key: keyof NonNullable<UiNode['semanticTokens']>, token: DesignTokenRecord): void => {
  node.semanticTokens = node.semanticTokens ?? {};
  node.semanticTokens[key] = token.token as any;
  node.tokens = node.tokens ?? {};
  node.tokens[key] = token.token as any;
};

const attachStyleToken = (node: UiNode, key: 'fill' | 'stroke', token: DesignTokenRecord): void => {
  const sourceStyle = node.declarativeStyle ?? node.style;
  const sourcePaint = sourceStyle?.[key];
  if (!sourcePaint) return;
  if (typeof sourcePaint === 'string') {
    node.declarativeStyle = { ...(node.declarativeStyle ?? node.style ?? {}), [key]: { value: sourcePaint, token: token.token } };
    node.style = node.declarativeStyle;
  } else {
    node.declarativeStyle = { ...(node.declarativeStyle ?? node.style ?? {}), [key]: { ...sourcePaint, token: token.token } };
    node.style = node.declarativeStyle;
  }
};

export const annotateDocumentWithTokens = (
  document: UiModelDocument,
  designTokenService: DesignTokenService | undefined,
  project?: string
): UiModelDocument => {
  if (!designTokenService) return document;
  walk(document.root, (node) => {
    node.semanticTokens = node.semanticTokens ?? node.tokens ?? {};
    node.tokens = node.tokens ?? node.semanticTokens ?? {};
    const classes = getClassTokens(node);

    const fillRaw = getFillValue(node) ?? normalizeRawValue(node.computedStyle?.backgroundColor) ?? normalizeRawValue(node.computedStyle?.color);
    const fillMatch = byClass(designTokenService, project, 'colors', classes).token
      ? byClass(designTokenService, project, 'colors', classes)
      : byRaw(designTokenService, project, 'colors', fillRaw);
    if (fillMatch.token) {
      setSemanticToken(node, 'fill', fillMatch.token);
      attachBinding(node, 'fill', fillMatch.token, fillMatch.raw, fillMatch.confidence, fillMatch.sources);
      attachStyleToken(node, 'fill', fillMatch.token);
    }

    const spacingValue = node.layout?.gap ?? node.spacing ?? parseNumeric(node.computedStyle?.gap) ?? parseNumeric(node.computedStyle?.rowGap) ?? parseNumeric(node.computedStyle?.columnGap);
    const spacingClassMatch = byClass(designTokenService, project, 'spacing', classes);
    const spacingMatch = spacingClassMatch.token ? spacingClassMatch : byNumeric(designTokenService, project, 'spacing', spacingValue);
    if (spacingMatch.token) {
      setSemanticToken(node, 'spacing', spacingMatch.token);
      attachBinding(node, 'spacing', spacingMatch.token, spacingMatch.raw, spacingMatch.confidence, spacingMatch.sources);
    }

    const radiusValue = node.declarativeStyle?.radius ?? node.style?.radius ?? parseNumeric(node.computedStyle?.borderRadius);
    const radiusClassMatch = byClass(designTokenService, project, 'radius', classes);
    const radiusMatch = radiusClassMatch.token ? radiusClassMatch : byNumeric(designTokenService, project, 'radius', radiusValue);
    if (radiusMatch.token) {
      setSemanticToken(node, 'radius', radiusMatch.token);
      attachBinding(node, 'radius', radiusMatch.token, radiusMatch.raw, radiusMatch.confidence, radiusMatch.sources);
    }

    const typographyValue = node.declarativeStyle?.text?.fontSize ?? node.style?.text?.fontSize ?? parseNumeric(node.computedStyle?.fontSize);
    const typographyClassMatch = byClass(designTokenService, project, 'typography', classes);
    const typographyMatch = typographyClassMatch.token ? typographyClassMatch : byNumeric(designTokenService, project, 'typography', typographyValue);
    if (typographyMatch.token) {
      setSemanticToken(node, 'typography', typographyMatch.token);
      attachBinding(node, 'typography', typographyMatch.token, typographyMatch.raw, typographyMatch.confidence, typographyMatch.sources);
    }

    const shadowRaw = normalizeRawValue(typeof node.computedStyle?.boxShadow === 'string' ? node.computedStyle.boxShadow : undefined);
    const shadowClassMatch = byClass(designTokenService, project, 'shadows', classes);
    const shadowMatch = shadowClassMatch.token ? shadowClassMatch : byRaw(designTokenService, project, 'shadows', shadowRaw);
    if (shadowMatch.token) {
      setSemanticToken(node, 'shadow', shadowMatch.token);
      attachBinding(node, 'shadow', shadowMatch.token, shadowMatch.raw, shadowMatch.confidence, shadowMatch.sources);
    }

    const breakpointClassTokens = classes.filter((item) => /^(sm:|md:|lg:|xl:|2xl:)/.test(item));
    const breakpointClassMatch = breakpointClassTokens.length ? byClass(designTokenService, project, 'breakpoints', breakpointClassTokens) : { token: null, confidence: 0, sources: [] as string[] };
    const breakpointValue = parseNumeric(node.responsive?.viewportWidth);
    const breakpointMatch = breakpointClassMatch.token ? breakpointClassMatch : byNumeric(designTokenService, project, 'breakpoints', breakpointValue);
    if (breakpointMatch.token) {
      setSemanticToken(node, 'breakpoint', breakpointMatch.token);
      attachBinding(node, 'breakpoint', breakpointMatch.token, breakpointMatch.raw, breakpointMatch.confidence, breakpointMatch.sources);
    }

    if (Object.keys(node.semanticTokens ?? {}).length === 0) delete node.semanticTokens;
    if (Object.keys(node.tokens ?? {}).length === 0) delete node.tokens;
  });
  return document;
};
