import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { FigmaCommandStep } from './figma-write-types';
import type { UiModelDocument, UiNode } from './ui-model';

export const designSystemExtractSchema = z.object({
  document: z.any().optional(),
  maxItemsPerSection: z.number().int().positive().max(64).default(24),
  title: z.string().trim().min(1).max(160).optional(),
  sourceUrl: z.string().trim().min(1).optional()
});

export type DesignSystemTokenKind = 'color' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'component';
export type DesignSystemEvidence = { uiId: string; nodeName?: string; kind?: string; usage?: string };
export type DesignSystemToken<TValue = unknown> = {
  id: string;
  name: string;
  kind: DesignSystemTokenKind;
  value: TValue;
  count: number;
  confidence: number;
  evidence: DesignSystemEvidence[];
};
export type DesignSystemDocument = {
  version: 'observed-design-system.v1';
  title: string;
  sourceUrl?: string;
  generatedAt: string;
  summary: { colors: number; typography: number; spacing: number; radius: number; shadows: number; components: number };
  colors: Array<DesignSystemToken<{ hex: string; rgb: { r: number; g: number; b: number; a: number }; usage: string[] }>>;
  typography: Array<DesignSystemToken<{ fontFamily: string; fontSize: number; lineHeight?: number; fontWeight?: string; letterSpacing?: number; textAlign?: string; role: string }>>;
  spacing: Array<DesignSystemToken<{ value: number; usage: string[] }>>;
  radius: Array<DesignSystemToken<{ value: number; usage: string[] }>>;
  shadows: Array<DesignSystemToken<{ value: string; usage: string[] }>>;
  components: Array<DesignSystemToken<{ role: string; width?: number; height?: number; fill?: string; color?: string; radius?: number; typographyRef?: string }>>;
};

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));
const hash = (value: unknown): string => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 10);
const slug = (value: string): string => String(value || 'token').trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'token';
const round = (value: number, precision = 3): number => Number(value.toFixed(precision));
const toHex = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0').toUpperCase();

const parseColor = (raw: unknown): { hex: string; rgb: { r: number; g: number; b: number; a: number } } | null => {
  const value = String(raw || '').trim();
  if (!value || value === 'transparent' || value === 'none') return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let body = hex[1];
    if (body.length === 3) body = body.split('').map((c) => c + c).join('');
    const r = parseInt(body.slice(0, 2), 16);
    const g = parseInt(body.slice(2, 4), 16);
    const b = parseInt(body.slice(4, 6), 16);
    const a = body.length >= 8 ? round(parseInt(body.slice(6, 8), 16) / 255, 3) : 1;
    if (a <= 0) return null;
    return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, rgb: { r, g, b, a } };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgb) return null;
  const r = Number(rgb[1]);
  const g = Number(rgb[2]);
  const b = Number(rgb[3]);
  const a = rgb[4] !== undefined ? Number(rgb[4]) : 1;
  if (![r, g, b, a].every(Number.isFinite) || a <= 0) return null;
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, rgb: { r: round(r), g: round(g), b: round(b), a: round(a, 3) } };
};

const paintForHex = (hex: string): unknown[] => {
  const c = parseColor(hex);
  if (!c) return [];
  return [{ type: 'SOLID', color: { r: c.rgb.r / 255, g: c.rgb.g / 255, b: c.rgb.b / 255 }, opacity: c.rgb.a }];
};

const walkNodes = (root: UiNode, fn: (node: UiNode) => void): void => {
  fn(root);
  for (const child of root.children || []) walkNodes(child, fn);
};

const addEvidence = (list: DesignSystemEvidence[], node: UiNode, usage: string, max = 12): void => {
  if (list.length >= max || !node.uiId) return;
  if (list.some((item) => item.uiId === node.uiId && item.usage === usage)) return;
  list.push({ uiId: node.uiId, nodeName: node.name, kind: node.kind, usage });
};

const inferColorName = (hex: string, usage: string[], index: number): string => {
  if (usage.includes('background')) return index === 0 ? 'color.surface.primary' : `color.surface.${index + 1}`;
  if (usage.includes('text')) return index === 0 ? 'color.text.primary' : `color.text.${index + 1}`;
  if (usage.includes('border')) return `color.border.${index + 1}`;
  if (usage.includes('icon')) return `color.icon.${index + 1}`;
  return `color.observed.${slug(hex)}`;
};

const inferTypographyRole = (node: UiNode): string => {
  const tag = String((node.meta as any)?.rendered?.dom?.tag || '').toLowerCase();
  if (/^h[1-6]$/.test(tag)) return tag;
  if (node.kind === 'button' || String(node.role || '').includes('button')) return 'button';
  const size = Number(node.computedStyle?.fontSize || 0);
  if (size >= 44) return 'display';
  if (size >= 30) return 'h1';
  if (size >= 24) return 'h2';
  if (size >= 20) return 'h3';
  if (size <= 12) return 'caption';
  return 'body';
};

const createEvidenceMeta = (token: DesignSystemToken): string => JSON.stringify({ tokenId: token.id, tokenName: token.name, kind: token.kind, evidence: token.evidence, confidence: token.confidence });

export const extractDesignSystemFromUiModel = (model: UiModelDocument, options: { title?: string; sourceUrl?: string; maxItemsPerSection?: number } = {}): DesignSystemDocument => {
  const maxItems = options.maxItemsPerSection ?? 24;
  const colorMap = new Map<string, DesignSystemToken<{ hex: string; rgb: { r: number; g: number; b: number; a: number }; usage: string[] }>>();
  const typographyMap = new Map<string, DesignSystemToken<{ fontFamily: string; fontSize: number; lineHeight?: number; fontWeight?: string; letterSpacing?: number; textAlign?: string; role: string }>>();
  const spacingMap = new Map<number, DesignSystemToken<{ value: number; usage: string[] }>>();
  const radiusMap = new Map<number, DesignSystemToken<{ value: number; usage: string[] }>>();
  const shadowMap = new Map<string, DesignSystemToken<{ value: string; usage: string[] }>>();
  const componentMap = new Map<string, DesignSystemToken<{ role: string; width?: number; height?: number; fill?: string; color?: string; radius?: number; typographyRef?: string }>>();

  const bumpColor = (raw: unknown, usage: string, node: UiNode): void => {
    const parsed = parseColor(raw);
    if (!parsed) return;
    const key = `${parsed.hex}:${parsed.rgb.a}`;
    const existing = colorMap.get(key) ?? { id: `color.${slug(parsed.hex)}.${hash(key)}`, name: '', kind: 'color' as const, value: { ...parsed, usage: [] }, count: 0, confidence: 0, evidence: [] };
    existing.count += 1;
    if (!existing.value.usage.includes(usage)) existing.value.usage.push(usage);
    addEvidence(existing.evidence, node, usage);
    colorMap.set(key, existing);
  };
  const bumpNum = (map: typeof spacingMap, value: unknown, usage: string, prefix: 'spacing' | 'radius', node: UiNode): void => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    const v = round(n, 3);
    if (v === 0) return;
    const existing = map.get(v) ?? { id: `${prefix}.${String(v).replace('.', '_')}`, name: `${prefix}.${v}`, kind: prefix as any, value: { value: v, usage: [] as string[] }, count: 0, confidence: 0, evidence: [] };
    existing.count += 1;
    if (!existing.value.usage.includes(usage)) existing.value.usage.push(usage);
    addEvidence(existing.evidence, node, usage);
    map.set(v, existing);
  };

  walkNodes(model.root, (node) => {
    const s = node.computedStyle ?? {};
    bumpColor(s.color, node.kind === 'icon' ? 'icon' : 'text', node);
    bumpColor(s.backgroundColor, 'background', node);
    if ((s.borderWidth ?? 0) > 0) bumpColor(s.borderColor, 'border', node);
    if (node.icon?.fill) bumpColor(node.icon.fill, 'icon', node);
    if (node.icon?.stroke) bumpColor(node.icon.stroke, 'icon', node);

    const fontFamily = String(s.fontFamily || '').split(',')[0]?.replace(/["']/g, '').trim();
    const fontSize = Number(s.fontSize);
    if (fontFamily && Number.isFinite(fontSize) && fontSize > 0 && (node.kind === 'text' || Boolean(node.text?.trim()) || node.kind === 'button')) {
      const role = inferTypographyRole(node);
      const value = { fontFamily, fontSize: round(fontSize, 3), lineHeight: s.lineHeight ? round(Number(s.lineHeight), 3) : undefined, fontWeight: s.fontWeight, letterSpacing: s.letterSpacing !== undefined ? round(Number(s.letterSpacing), 3) : undefined, textAlign: s.textAlign, role };
      const key = JSON.stringify(value);
      const existing = typographyMap.get(key) ?? { id: `typography.${role}.${hash(key)}`, name: `typography.${role}.${typographyMap.size + 1}`, kind: 'typography' as const, value, count: 0, confidence: 0, evidence: [] };
      existing.count += 1;
      addEvidence(existing.evidence, node, role);
      typographyMap.set(key, existing);
    }

    for (const [key, usage] of [['gap', 'gap'], ['rowGap', 'row-gap'], ['columnGap', 'column-gap'], ['paddingTop', 'padding'], ['paddingRight', 'padding'], ['paddingBottom', 'padding'], ['paddingLeft', 'padding'], ['marginTop', 'margin'], ['marginRight', 'margin'], ['marginBottom', 'margin'], ['marginLeft', 'margin']] as const) bumpNum(spacingMap, s[key], usage, 'spacing', node);
    bumpNum(radiusMap, s.borderRadius, 'border-radius', 'radius', node);
    const shadow = String(s.boxShadow || '').trim();
    if (shadow && shadow !== 'none') {
      const existing = shadowMap.get(shadow) ?? { id: `shadow.${hash(shadow)}`, name: `shadow.observed.${shadowMap.size + 1}`, kind: 'shadow' as const, value: { value: shadow, usage: [] }, count: 0, confidence: 0, evidence: [] };
      existing.count += 1;
      if (!existing.value.usage.includes('box-shadow')) existing.value.usage.push('box-shadow');
      addEvidence(existing.evidence, node, 'box-shadow');
      shadowMap.set(shadow, existing);
    }

    if (['button', 'input', 'card'].includes(node.kind) || /card|button|input/i.test(String(node.name || node.uiId))) {
      const role = node.kind === 'button' ? 'button' : node.kind === 'input' ? 'input' : 'card';
      const fill = parseColor(s.backgroundColor)?.hex;
      const color = parseColor(s.color)?.hex;
      const value = { role, width: node.boundingBox?.width ?? node.size?.width, height: node.boundingBox?.height ?? node.size?.height, fill, color, radius: s.borderRadius };
      const key = JSON.stringify({ role, fill, color, radius: value.radius, h: value.height, font: s.fontSize, weight: s.fontWeight });
      const existing = componentMap.get(key) ?? { id: `component.${role}.${hash(key)}`, name: `component.${role}.${componentMap.size + 1}`, kind: 'component' as const, value, count: 0, confidence: 0, evidence: [] };
      existing.count += 1;
      addEvidence(existing.evidence, node, role);
      componentMap.set(key, existing);
    }
  });

  const finish = <T extends DesignSystemToken>(items: T[], nameFn?: (item: T, index: number) => string): T[] => items
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, maxItems)
    .map((item, index) => ({ ...item, name: item.name || (nameFn ? nameFn(item, index) : item.id), confidence: round(clamp(0.35 + Math.log10(item.count + 1) / 1.5), 3) }));

  const colors = finish(Array.from(colorMap.values()), (item, index) => inferColorName(item.value.hex, item.value.usage, index));
  const typography = finish(Array.from(typographyMap.values()))
    .sort((a, b) => Number(b.value.fontSize) - Number(a.value.fontSize) || b.count - a.count)
    .map((item, index) => ({
      ...item,
      name: item.value.role === 'button' ? `typography.button.${index + 1}` : item.value.role === 'caption' ? `typography.caption.${index + 1}` : index < 9 ? `typography.h${index + 1}` : `typography.body.${index + 1}`,
      value: { ...item.value, role: item.value.role === 'button' || item.value.role === 'caption' ? item.value.role : (index < 9 ? `h${index + 1}` : 'body') }
    }));
  const spacing = finish(Array.from(spacingMap.values()).sort((a, b) => a.value.value - b.value.value));
  const radius = finish(Array.from(radiusMap.values()).sort((a, b) => a.value.value - b.value.value));
  const shadows = finish(Array.from(shadowMap.values()));
  const components = finish(Array.from(componentMap.values()));

  return {
    version: 'observed-design-system.v1',
    title: options.title ?? 'Observed Site Design System',
    sourceUrl: options.sourceUrl,
    generatedAt: new Date().toISOString(),
    summary: { colors: colors.length, typography: typography.length, spacing: spacing.length, radius: radius.length, shadows: shadows.length, components: components.length },
    colors,
    typography,
    spacing,
    radius,
    shadows,
    components
  };
};

const text = (ref: string, parentRef: string, value: string, x: number, y: number, width: number, size = 14, weight = '400'): FigmaCommandStep[] => [
  { type: 'create_text', payload: { ref, parentRef, uiId: ref, name: `Text - ${ref}`, text: value, x, y, width, fontFamily: 'Inter', fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.3), fills: paintForHex('#1A1A1A'), textAutoResize: 'HEIGHT' } },
  { type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'design-system-role', value: 'label' } } }
];

const swatchCommands = (dsRef: string, token: DesignSystemDocument['colors'][number], index: number): FigmaCommandStep[] => {
  const x = 24 + (index % 4) * 220;
  const y = 96 + Math.floor(index / 4) * 104;
  const ref = `${dsRef}/colors/${index + 1}`;
  return [
    { type: 'create_frame', payload: { ref, parentRef: `${dsRef}/colors`, uiId: ref, name: `Color - ${token.name}`, x, y, width: 196, height: 80 } },
    { type: 'set_fill', payload: { nodeRef: ref, fills: paintForHex(token.value.hex) } },
    { type: 'set_stroke', payload: { nodeRef: ref, strokes: paintForHex('#E5E7EB'), strokeWeight: 1 } },
    { type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'design-system-token', value: createEvidenceMeta(token) } } },
    ...text(`${ref}/name`, ref, token.name, 10, 8, 176, 12, '600'),
    ...text(`${ref}/value`, ref, `${token.value.hex} · ${token.value.usage.join(', ')}`, 10, 36, 176, 11, '400')
  ];
};

const typographyCommands = (dsRef: string, token: DesignSystemDocument['typography'][number], index: number): FigmaCommandStep[] => {
  const ref = `${dsRef}/typography/${index + 1}`;
  const y = 96 + index * 78;
  return [
    { type: 'create_frame', payload: { ref, parentRef: `${dsRef}/typography`, uiId: ref, name: `Typography - ${token.name}`, x: 24, y, width: 880, height: 62 } },
    { type: 'set_fill', payload: { nodeRef: ref, fills: [] } },
    { type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'design-system-token', value: createEvidenceMeta(token) } } },
    { type: 'create_text', payload: { ref: `${ref}/sample`, parentRef: ref, uiId: `${ref}/sample`, name: `Sample - ${token.name}`, text: `${token.value.role}: Быстрая навигация по каталогу`, x: 0, y: 0, width: 560, fontFamily: token.value.fontFamily, fontSize: token.value.fontSize, fontWeight: token.value.fontWeight, lineHeight: token.value.lineHeight, letterSpacing: token.value.letterSpacing, fills: paintForHex('#1A1A1A'), textAutoResize: 'HEIGHT' } },
    ...text(`${ref}/meta`, ref, `${token.name} · ${token.value.fontFamily} ${token.value.fontSize}/${token.value.lineHeight ?? 'auto'} · ${token.count} uses`, 600, 4, 260, 11, '400')
  ];
};

const metricCommands = (dsRef: string, section: 'spacing' | 'radius', token: DesignSystemDocument['spacing'][number] | DesignSystemDocument['radius'][number], index: number): FigmaCommandStep[] => {
  const ref = `${dsRef}/${section}/${index + 1}`;
  const x = 24 + (index % 6) * 144;
  const y = 96 + Math.floor(index / 6) * 96;
  const size = Math.max(8, Math.min(72, token.value.value));
  return [
    { type: 'create_frame', payload: { ref, parentRef: `${dsRef}/${section}`, uiId: ref, name: `${section} - ${token.name}`, x, y, width: 120, height: 72 } },
    { type: 'set_fill', payload: { nodeRef: ref, fills: paintForHex('#F8FAFC') } },
    { type: 'set_stroke', payload: { nodeRef: ref, strokes: paintForHex('#E5E7EB'), strokeWeight: 1 } },
    { type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'design-system-token', value: createEvidenceMeta(token) } } },
    { type: 'create_frame', payload: { ref: `${ref}/bar`, parentRef: ref, uiId: `${ref}/bar`, name: 'metric-preview', x: 12, y: 14, width: section === 'spacing' ? size : 46, height: section === 'spacing' ? 16 : 46 } },
    { type: 'set_fill', payload: { nodeRef: `${ref}/bar`, fills: paintForHex(section === 'spacing' ? '#82E600' : '#324567') } },
    ...(section === 'radius' ? [{ type: 'set_corner_radius' as const, payload: { nodeRef: `${ref}/bar`, radius: token.value.value } }] : []),
    ...text(`${ref}/label`, ref, `${token.name}`, 12, 48, 96, 10, '500')
  ];
};

const componentCommands = (dsRef: string, token: DesignSystemDocument['components'][number], index: number): FigmaCommandStep[] => {
  const ref = `${dsRef}/components/${index + 1}`;
  const y = 96 + index * 86;
  const w = Math.max(120, Math.min(260, token.value.width ?? 160));
  const h = Math.max(36, Math.min(72, token.value.height ?? 44));
  return [
    { type: 'create_frame', payload: { ref, parentRef: `${dsRef}/components`, uiId: ref, name: `Component specimen - ${token.name}`, x: 24, y, width: 880, height: 70 } },
    { type: 'set_fill', payload: { nodeRef: ref, fills: [] } },
    { type: 'set_plugin_data', payload: { nodeRef: ref, pluginData: { namespace: 'figma-gateway', key: 'design-system-token', value: createEvidenceMeta(token) } } },
    { type: 'create_frame', payload: { ref: `${ref}/sample`, parentRef: ref, uiId: `${ref}/sample`, name: token.name, x: 0, y: 8, width: w, height: h } },
    { type: 'set_fill', payload: { nodeRef: `${ref}/sample`, fills: paintForHex(token.value.fill ?? '#F8FAFC') } },
    { type: 'set_corner_radius', payload: { nodeRef: `${ref}/sample`, radius: token.value.radius ?? 4 } },
    ...text(`${ref}/sample/text`, `${ref}/sample`, token.value.role === 'button' ? 'Button' : token.value.role, 16, Math.max(8, h / 2 - 9), Math.max(80, w - 32), 14, '500'),
    ...text(`${ref}/meta`, ref, `${token.name} · ${token.count} uses`, 300, 20, 400, 12, '400')
  ];
};

export const buildDesignSystemFigmaCommands = (document: DesignSystemDocument, options: { ref?: string; x?: number; y?: number } = {}): FigmaCommandStep[] => {
  const dsRef = options.ref ?? `design-system/${slug(document.title)}`;
  const width = 980;
  const commands: FigmaCommandStep[] = [
    { type: 'delete_matching_nodes', payload: { query: { uiId: dsRef } } },
    { type: 'create_frame', payload: { ref: dsRef, uiId: dsRef, name: `Site Design System · ${document.title}`, x: options.x ?? 1520, y: options.y ?? 0, width, height: 3200 } },
    { type: 'set_fill', payload: { nodeRef: dsRef, fills: paintForHex('#FFFFFF') } },
    { type: 'set_plugin_data', payload: { nodeRef: dsRef, pluginData: { namespace: 'figma-gateway', key: 'design-system-document', value: JSON.stringify(document) } } },
    ...text(`${dsRef}/title`, dsRef, `Observed Design System · ${document.title}`, 24, 24, 860, 28, '700'),
    ...text(`${dsRef}/summary`, dsRef, `${document.summary.colors} colors · ${document.summary.typography} type styles · ${document.summary.components} component patterns · generated from ${document.sourceUrl ?? 'rendered UI'}`, 24, 62, 860, 12, '400')
  ];
  const sections: Array<{ key: string; title: string; y: number; height: number }> = [
    { key: 'colors', title: '01 Colors', y: 120, height: 760 },
    { key: 'typography', title: '02 Typography', y: 920, height: 780 },
    { key: 'components', title: '03 Components / Buttons / Inputs', y: 1740, height: 560 },
    { key: 'spacing', title: '04 Spacing', y: 2340, height: 300 },
    { key: 'radius', title: '05 Radius', y: 2680, height: 300 }
  ];
  for (const section of sections) {
    const ref = `${dsRef}/${section.key}`;
    commands.push({ type: 'create_frame', payload: { ref, parentRef: dsRef, uiId: ref, name: section.title, x: 24, y: section.y, width: 932, height: section.height } });
    commands.push({ type: 'set_fill', payload: { nodeRef: ref, fills: paintForHex('#FFFFFF') } });
    commands.push({ type: 'set_stroke', payload: { nodeRef: ref, strokes: paintForHex('#E5E7EB'), strokeWeight: 1 } });
    commands.push(...text(`${ref}/heading`, ref, section.title, 24, 24, 860, 20, '700'));
  }
  document.colors.forEach((token, index) => commands.push(...swatchCommands(dsRef, token, index)));
  document.typography.forEach((token, index) => commands.push(...typographyCommands(dsRef, token, index)));
  document.components.forEach((token, index) => commands.push(...componentCommands(dsRef, token, index)));
  document.spacing.forEach((token, index) => commands.push(...metricCommands(dsRef, 'spacing', token, index)));
  document.radius.forEach((token, index) => commands.push(...metricCommands(dsRef, 'radius', token, index)));
  return commands;
};

export const createObservedDesignSystem = (model: UiModelDocument, options: { title?: string; sourceUrl?: string; maxItemsPerSection?: number; ref?: string; x?: number; y?: number } = {}): { document: DesignSystemDocument; commands: FigmaCommandStep[] } => {
  const document = extractDesignSystemFromUiModel(model, options);
  return { document, commands: buildDesignSystemFigmaCommands(document, options) };
};
