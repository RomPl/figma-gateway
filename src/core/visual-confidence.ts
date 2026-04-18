import type { UiModelDocument, UiNode } from './ui-model';
import { classifyNodeGuardrails } from './visual-guardrails';

export type UiVisualConfidence = {
  ast: number;
  rendered: number;
  figma: number;
  token: number;
  visual: number;
  needsReview: boolean;
  reasons: string[];
};

const clamp = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const average = (values: number[]): number => values.length ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

const tokenConfidenceFromBindings = (node: UiNode): number => {
  const bindings = node.meta && typeof node.meta.tokenBindings === 'object' ? node.meta.tokenBindings as Record<string, unknown> : undefined;
  if (!bindings) return 0;
  const values = Object.values(bindings)
    .map((binding) => (binding && typeof binding === 'object' && typeof (binding as Record<string, unknown>).confidence === 'number') ? (binding as Record<string, unknown>).confidence as number : undefined)
    .filter((value): value is number => typeof value === 'number');
  return values.length ? average(values) : 0;
};

const astConfidence = (node: UiNode): { value: number; reasons: string[] } => {
  const reasons: string[] = [];
  const metaMapping = node.meta && typeof node.meta.codeMapping === 'object' ? node.meta.codeMapping as Record<string, unknown> : undefined;
  if (typeof metaMapping?.confidence === 'number') {
    reasons.push('code mapping confidence');
    return { value: clamp(metaMapping.confidence as number), reasons };
  }
  let value = 0.2;
  if (node.source?.codePath) { value += 0.35; reasons.push('codePath'); }
  if (node.source?.jsxPath) { value += 0.25; reasons.push('jsxPath'); }
  if (node.source?.lineStart && node.source?.lineEnd) { value += 0.2; reasons.push('sourceRange'); }
  if (node.uiId) { value += 0.1; reasons.push('uiId'); }
  return { value: clamp(value), reasons };
};

const renderedConfidence = (node: UiNode): { value: number; reasons: string[] } => {
  const reasons: string[] = [];
  let value = 0.2;
  if (node.boundingBox?.width && node.boundingBox?.height) { value += 0.25; reasons.push('boundingBox'); }
  if (node.computedStyle && Object.keys(node.computedStyle).length > 0) { value += 0.25; reasons.push('computedStyle'); }
  if (node.state?.visible ?? node.visible) { value += 0.15; reasons.push('visible'); }
  if (node.responsive?.breakpointName) { value += 0.1; reasons.push('breakpoint'); }
  if (node.asset || node.icon) { value += 0.1; reasons.push('asset/icon'); }
  return { value: clamp(value), reasons };
};

const figmaConfidence = (node: UiNode): { value: number; reasons: string[] } => {
  const reasons: string[] = [];
  let value = 0.15;
  if (node.source?.fileKey && node.source?.nodeId) { value += 0.55; reasons.push('figmaNodeRef'); }
  if (node.declarativeStyle && Object.keys(node.declarativeStyle).length > 0) { value += 0.15; reasons.push('declarativeStyle'); }
  if (node.kind) { value += 0.1; reasons.push('kind'); }
  return { value: clamp(value), reasons };
};

export const calculateNodeVisualConfidence = (node: UiNode): UiVisualConfidence => {
  const ast = astConfidence(node);
  const rendered = renderedConfidence(node);
  const figma = figmaConfidence(node);
  const token = tokenConfidenceFromBindings(node);
  const guardrails = classifyNodeGuardrails(node.meta);
  const visualBase = clamp((ast.value * 0.35) + (rendered.value * 0.35) + (figma.value * 0.15) + (token * 0.15));
  const visual = clamp(Math.max(0, visualBase - (guardrails.needsReview ? 0.2 : 0)));
  const needsReview = visual < 0.65 || ast.value < 0.75 || rendered.value < 0.45 || guardrails.needsReview;
  const reasons = [
    ...ast.reasons.map((item) => `ast:${item}`),
    ...rendered.reasons.map((item) => `rendered:${item}`),
    ...figma.reasons.map((item) => `figma:${item}`)
  ];
  if (token) reasons.push(`token:${token}`);
  if (guardrails.reasons.length) reasons.push(...guardrails.reasons);
  if (needsReview) reasons.push('low visual confidence');
  return { ast: ast.value, rendered: rendered.value, figma: figma.value, token, visual, needsReview, reasons };
};

export const annotateVisualConfidence = <T extends UiModelDocument>(document: T): T => {
  const walk = (node: UiNode): void => {
    const confidence = calculateNodeVisualConfidence(node) as any;
    node.confidence = confidence;
    node.meta = { ...(node.meta ?? {}), needsReview: confidence.needsReview, visualConfidence: confidence };
    node.children.forEach(walk);
  };
  walk(document.root);
  return document;
};
