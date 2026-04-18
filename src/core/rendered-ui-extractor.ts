import { z } from 'zod';

import type { DesignTokenService } from './design-token-registry';
import { annotateDocumentWithTokens } from './design-token-helpers';
import { browserRenderOpenSchema, BrowserRendererService } from './browser-renderer';
import { createRenderProfileResolver, renderProfileHintsSchema, type RenderProfile } from './render-profile-resolver';
import { attachPlanningContext } from './planning-context';
import { uiModelDocumentSchema, type UiKind, type UiModelDocument, type UiNode } from './ui-model';
import { inferAssetHash, inferAssetId, inferFigmaAssetStrategy, type AssetRegistryRecord } from './asset-registry';
import { classifyNodeGuardrails } from './visual-guardrails';
import { annotateVisualConfidence } from './visual-confidence';
import { visualLogger, summarizeNode } from './visual-debug';

export const RENDERED_UI_CONTRACT_VERSION = 'rendered-ui-contract.v1';

export const renderedBreakpointPresetSchema = z.enum(['mobile', 'tablet', 'desktop']);
export type RenderedBreakpointPreset = z.infer<typeof renderedBreakpointPresetSchema>;
export const RENDERED_BREAKPOINT_PRESETS: Record<RenderedBreakpointPreset, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 }
};

export const RENDERED_UI_MVP_COMPUTED_STYLE_PROPERTIES = [
  'color','backgroundColor','backgroundImage','borderColor','borderWidth','borderStyle','borderRadius','boxShadow','opacity','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','display','flexDirection','flexWrap','alignItems','alignContent','justifyContent','justifyItems','justifySelf','gap','rowGap','columnGap','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','marginLeftAuto','marginRightAuto','width','height','position','overflowX','overflowY'
] as const;

export const RENDERED_UI_MVP_SYNC_RELEVANT_FIELDS = [
  'text','visibility.visible','clientRect.width','clientRect.height','computedStyle.color','computedStyle.backgroundColor','computedStyle.backgroundImage','computedStyle.borderColor','computedStyle.borderWidth','computedStyle.borderStyle','computedStyle.borderRadius','computedStyle.boxShadow','computedStyle.opacity','computedStyle.fontFamily','computedStyle.fontSize','computedStyle.fontWeight','computedStyle.lineHeight','computedStyle.letterSpacing','computedStyle.textAlign','computedStyle.display','computedStyle.flexDirection','computedStyle.alignItems','computedStyle.alignContent','computedStyle.justifyContent','computedStyle.justifyItems','computedStyle.justifySelf','computedStyle.gap','computedStyle.rowGap','computedStyle.columnGap','computedStyle.paddingTop','computedStyle.paddingRight','computedStyle.paddingBottom','computedStyle.paddingLeft','computedStyle.marginTop','computedStyle.marginRight','computedStyle.marginBottom','computedStyle.marginLeft','computedStyle.position','computedStyle.overflowX','computedStyle.overflowY','asset.sourceUrl','asset.renderedSize.width','asset.renderedSize.height','icon.fill','icon.stroke','icon.size.width','icon.size.height','icon.placement'
] as const;

export const extractRenderedUiSchema = browserRenderOpenSchema.extend({
  project: z.string().trim().min(1).max(128).optional(),
  rootUiId: z.string().trim().min(1).optional(),
  breakpoint: renderedBreakpointPresetSchema.optional(),
  breakpointName: z.string().trim().min(1).max(128).optional(),
  profile: renderProfileHintsSchema.optional()
});

export const extractRenderedUiBreakpointsSchema = browserRenderOpenSchema.extend({
  project: z.string().trim().min(1).max(128).optional(),
  rootUiId: z.string().trim().min(1).optional(),
  breakpoints: z.array(renderedBreakpointPresetSchema).min(1).max(3).default(['desktop']),
  profile: renderProfileHintsSchema.optional()
});

export const diagnoseRenderedUiSchema = browserRenderOpenSchema.extend({
  project: z.string().trim().min(1).max(128).optional(),
  rootUiId: z.string().trim().min(1).optional(),
  breakpoint: renderedBreakpointPresetSchema.optional(),
  breakpointName: z.string().trim().min(1).max(128).optional(),
  profile: renderProfileHintsSchema.optional()
});

export type RenderedUiDiagnostics = {
  targetMode: string;
  resolvedUrl: string;
  finalUrl: string;
  title: string;
  pageAudit: Record<string, unknown>;
  domUiIdCount: number;
  rootRequestedUiId?: string;
  rootResolvedByUiId: boolean;
  rootSelectionMode?: string;
  fallbackUsed?: boolean;
  rootSummary?: Record<string, unknown>;
  childUiIds: string[];
  childSummaries?: Array<Record<string, unknown>>;
  computedStyleKeys: string[];
};

const computedStyleSubsetSchema = z.object({
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  borderStyle: z.string().optional(),
  borderRadius: z.number().optional(),
  boxShadow: z.string().optional(),
  opacity: z.number().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.string().optional(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  textAlign: z.string().optional(),
  display: z.string().optional(),
  flexDirection: z.string().optional(),
  flexWrap: z.string().optional(),
  alignItems: z.string().optional(),
  alignContent: z.string().optional(),
  justifyContent: z.string().optional(),
  justifyItems: z.string().optional(),
  justifySelf: z.string().optional(),
  gap: z.number().optional(),
  rowGap: z.number().optional(),
  columnGap: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  marginTop: z.number().optional(),
  marginRight: z.number().optional(),
  marginBottom: z.number().optional(),
  marginLeft: z.number().optional(),
  marginLeftAuto: z.boolean().optional(),
  marginRightAuto: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  position: z.string().optional(),
  overflowX: z.string().optional(),
  overflowY: z.string().optional()
}).partial();

const assetLayerSchema = z.object({
  layer: z.enum(['image', 'svg-icon', 'background-image', 'decorative-asset']).optional(),
  sourceUrl: z.string().optional(),
  resolvedAssetPath: z.string().optional(),
  naturalSize: z.object({ width: z.number().optional(), height: z.number().optional() }).partial().optional(),
  renderedSize: z.object({ width: z.number().optional(), height: z.number().optional() }).partial().optional(),
  objectFit: z.string().optional(),
  alt: z.string().optional(),
  role: z.enum(['content', 'decorative']).optional()
}).partial();

const iconLayerSchema = z.object({
  sourceType: z.enum(['inline-svg', 'component', 'sprite', 'font-icon']).optional(),
  textLabel: z.string().optional(),
  svgMarkup: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  size: z.object({ width: z.number().optional(), height: z.number().optional() }).partial().optional(),
  placement: z.enum(['standalone', 'leading', 'trailing', 'decorative']).optional(),
  spriteRef: z.string().optional()
}).partial();

const mediaSchema = z.object({
  kind: z.enum(['img', 'picture', 'video', 'background-image', 'svg', 'icon-font']).optional(),
  sourceUrl: z.string().optional(),
  alt: z.string().optional(),
  poster: z.string().optional(),
  sources: z.array(z.string()).optional(),
  inlineSvg: z.boolean().optional(),
  svgSpriteUse: z.string().optional(),
  iconRole: z.enum(['standalone', 'leading', 'trailing', 'decorative']).optional(),
  contentRole: z.enum(['content', 'decorative']).optional()
}).partial();

const semanticsSchema = z.object({
  role: z.string().optional(),
  ariaLabel: z.string().optional(),
  headingLevel: z.number().int().min(1).max(6).optional(),
  clickTarget: z.boolean().optional(),
  hidden: z.boolean().optional()
}).partial();

const renderSurfaceSchema = z.object({
  surfaceMode: z.string().optional(),
  shellSelectionMode: z.string().optional(),
  contentSelectionMode: z.string().optional(),
  shellPreserved: z.boolean().optional(),
  shellRootTag: z.string().optional(),
  contentRootTag: z.string().optional()
}).partial();

export const renderedNodeSnapshotSchema: z.ZodType<any> = z.lazy(() => z.object({
  uiId: z.string().trim().min(1),
  tag: z.string().trim().min(1),
  domId: z.string().optional(),
  className: z.string().optional(),
  text: z.string().optional(),
  placeholder: z.string().optional(),
  inputType: z.string().optional(),
  checked: z.boolean().optional(),
  treePath: z.string().trim().min(1),
  clientRect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  computedStyle: computedStyleSubsetSchema.default({}),
  visibility: z.object({ visible: z.boolean(), display: z.string().optional(), visibility: z.string().optional(), opacity: z.number().optional() }),
  media: mediaSchema.default({}),
  asset: assetLayerSchema.default({}),
  icon: iconLayerSchema.default({}),
  semantics: semanticsSchema.default({}),
  renderSurface: renderSurfaceSchema.default({}),
  guardrails: z.object({ privateDataRedacted: z.boolean().optional(), runtimeBaseline: z.enum(['trusted','untrusted']).optional(), dynamicStatefulBlock: z.boolean().optional(), unsupportedRegions: z.array(z.string()).optional() }).partial().default({}),
  breakpoint: z.object({ viewportWidth: z.number(), viewportHeight: z.number(), name: z.string().optional() }),
  syncRelevantFields: z.array(z.string()).default([]),
  children: z.array(renderedNodeSnapshotSchema).default([])
}));

export type RenderedNodeSnapshot = z.infer<typeof renderedNodeSnapshotSchema>;
export type RenderedUiRuntime = { capture(input: z.infer<typeof extractRenderedUiSchema>): Promise<RenderedNodeSnapshot>; };

export const normalizeRenderedExtractInput = (input: z.infer<typeof extractRenderedUiSchema>): z.infer<typeof extractRenderedUiSchema> => {
  const preset = input.breakpoint;
  if (!preset) {
    return { ...input, breakpointName: input.breakpointName ?? undefined };
  }
  const presetViewport = RENDERED_BREAKPOINT_PRESETS[preset];
  return {
    ...input,
    viewport: presetViewport,
    breakpointName: input.breakpointName ?? preset
  };
};

export type RenderedBreakpointSnapshotResult = {
  activeBreakpoint: RenderedBreakpointPreset;
  snapshots: Record<RenderedBreakpointPreset, UiModelDocument>;
};

const normalizeText = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
};


const normalizeCssClassName = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.split(/\s+/).map((item) => item.trim()).filter(Boolean).slice(0, 3).join('.');
  return normalized || undefined;
};

const buildRenderedNodeName = (snapshot: RenderedNodeSnapshot): string => {
  const tag = snapshot.tag.toLowerCase();
  const domId = snapshot.domId?.trim();
  const className = normalizeCssClassName(snapshot.className);
  return [tag, domId || undefined, className || undefined].filter(Boolean).join('-');
};

const inferKind = (snapshot: RenderedNodeSnapshot): UiKind => {
  const tag = snapshot.tag.toLowerCase();
  const role = snapshot.semantics.role?.toLowerCase();
  const mediaKind = snapshot.media.kind;
  const className = String(snapshot.className || '');
  const hasTextOnly = Boolean(snapshot.text && snapshot.text.trim() && (!snapshot.children || snapshot.children.length === 0));
  const hasDecoratedContainerStyle = Boolean(
    (snapshot.computedStyle.backgroundColor && !['rgba(0, 0, 0, 0)', 'transparent'].includes(snapshot.computedStyle.backgroundColor)) ||
    (snapshot.computedStyle.backgroundImage && snapshot.computedStyle.backgroundImage !== 'none') ||
    (snapshot.computedStyle.borderWidth && snapshot.computedStyle.borderWidth > 0) ||
    (snapshot.computedStyle.borderRadius && snapshot.computedStyle.borderRadius > 0) ||
    (snapshot.computedStyle.boxShadow && snapshot.computedStyle.boxShadow !== 'none')
  );
  if (tag === 'body' || tag === 'main' || tag === 'article' || tag === 'div' || tag === 'form') return 'frame';
  if (/^h[1-6]$/.test(tag) || ['p', 'strong', 'em', 'small'].includes(tag)) return 'text';
  if (['span','label'].includes(tag) && hasDecoratedContainerStyle) return 'frame';
  if (['span','label'].includes(tag)) return 'text';
  if (tag === 'section') return 'section';
  if (tag === 'button' || role === 'button' || (tag === 'a' && /(^|\s)btn(\s|$)/.test(className))) return 'button';
  if (tag === 'input' || tag === 'textarea' || role === 'textbox' || role === 'switch' || role === 'checkbox') return 'input';
  if (tag === 'ul' || tag === 'ol' || role === 'list') return 'list';
  if (snapshot.asset.layer === 'image' || snapshot.asset.layer === 'background-image' || mediaKind === 'img' || mediaKind === 'picture' || mediaKind === 'video' || ['img', 'picture', 'video'].includes(tag)) return 'image';
  if (snapshot.icon.sourceType || snapshot.asset.layer === 'svg-icon' || mediaKind === 'svg' || mediaKind === 'icon-font' || tag === 'svg') return 'icon';
  if (hasTextOnly && !hasDecoratedContainerStyle) return tag === 'a' ? 'button' : 'text';
  if (tag === 'main' || tag === 'article' || tag === 'div' || tag === 'form' || tag === 'a') return 'frame';
  return 'group';
};

const inferRole = (snapshot: RenderedNodeSnapshot): UiNode['role'] => {
  const tag = snapshot.tag.toLowerCase();
  const placement = snapshot.icon.placement ?? snapshot.media.iconRole;
  if (tag === 'h1') return 'headline';
  if (/^h[2-6]$/.test(tag)) return 'subheadline';
  if (snapshot.semantics.role === 'button') return 'button-primary';
  if (snapshot.semantics.role === 'textbox') return 'input-field';
  if (placement === 'leading') return 'icon-leading';
  if (placement === 'trailing') return 'icon-trailing';
  return undefined;
};

const buildUiNode = (snapshot: RenderedNodeSnapshot, sourceUrl: string): UiNode => {
  const kind = inferKind(snapshot);
  const styleSubset = snapshot.computedStyle;
  const guardrails = snapshot.guardrails ?? {};
  const fill = styleSubset.backgroundColor && styleSubset.backgroundColor !== 'rgba(0, 0, 0, 0)' && styleSubset.backgroundColor !== 'transparent' ? styleSubset.backgroundColor : undefined;
  const stroke = styleSubset.borderColor && styleSubset.borderWidth && styleSubset.borderWidth > 0 ? { value: styleSubset.borderColor } : undefined;
  const hasPadding = styleSubset.paddingTop !== undefined || styleSubset.paddingRight !== undefined || styleSubset.paddingBottom !== undefined || styleSubset.paddingLeft !== undefined;
  const normalizedSnapshotText = normalizeText(snapshot.text);
  const iconOnlyChildren = Boolean(snapshot.children?.length) && snapshot.children.every((child: RenderedNodeSnapshot) => Boolean(child.icon?.sourceType) || child.tag === 'svg' || child.asset?.layer === 'svg-icon');
  return {
    kind,
    uiId: snapshot.uiId,
    name: buildRenderedNodeName(snapshot),
    role: inferRole(snapshot),
    visible: snapshot.visibility.visible,
    text: kind === 'text' || kind === 'button' || ((kind === 'frame' || kind === 'group') && snapshot.semantics.clickTarget && normalizedSnapshotText && normalizedSnapshotText.length <= 120) || ((kind === 'frame' || kind === 'group') && normalizedSnapshotText && iconOnlyChildren && normalizedSnapshotText.length <= 120) || ((kind === 'frame') && normalizedSnapshotText && (!snapshot.children || snapshot.children.length === 0) && normalizedSnapshotText.length <= 120) ? normalizedSnapshotText : undefined,
    source: { codeSelector: `[data-ui-id="${snapshot.uiId}"]`, codePath: sourceUrl },
    size: { width: snapshot.clientRect.width, height: snapshot.clientRect.height },
    position: { x: snapshot.clientRect.x, y: snapshot.clientRect.y },
    spacing: styleSubset.gap ?? styleSubset.rowGap ?? styleSubset.columnGap,
    padding: hasPadding ? { top: styleSubset.paddingTop ?? 0, right: styleSubset.paddingRight ?? 0, bottom: styleSubset.paddingBottom ?? 0, left: styleSubset.paddingLeft ?? 0 } : undefined,
    layout: {
      type: styleSubset.display === 'flex' || styleSubset.display === 'inline-flex' ? (styleSubset.flexDirection === 'column' || styleSubset.flexDirection === 'column-reverse' ? 'vertical' : 'horizontal') : styleSubset.display === 'grid' ? 'stack' : 'none',
      gap: styleSubset.gap,
      wrap: styleSubset.flexWrap === 'wrap' || styleSubset.flexWrap === 'wrap-reverse',
      padding: hasPadding ? { top: styleSubset.paddingTop ?? 0, right: styleSubset.paddingRight ?? 0, bottom: styleSubset.paddingBottom ?? 0, left: styleSubset.paddingLeft ?? 0 } : undefined,
      alignment: {
        primary: styleSubset.justifyContent === 'center' ? 'center' : styleSubset.justifyContent === 'flex-end' ? 'end' : styleSubset.justifyContent === 'space-between' ? 'space-between' : 'start',
        cross: styleSubset.alignItems === 'center' ? 'center' : styleSubset.alignItems === 'flex-end' ? 'end' : styleSubset.alignItems === 'stretch' ? 'stretch' : 'start'
      }
    },
    style: {
      ...(fill ? { fill } : {}),
      ...(stroke ? { stroke } : {}),
      ...(styleSubset.borderRadius !== undefined ? { radius: styleSubset.borderRadius } : {}),
      ...(styleSubset.opacity !== undefined ? { opacity: styleSubset.opacity } : {}),
      text: styleSubset.fontFamily || styleSubset.fontSize || styleSubset.lineHeight || styleSubset.letterSpacing || styleSubset.textAlign
        ? { fontFamily: styleSubset.fontFamily, fontStyle: undefined, fontSize: styleSubset.fontSize, lineHeight: styleSubset.lineHeight, letterSpacing: styleSubset.letterSpacing, textAlign: styleSubset.textAlign === 'start' ? 'left' : styleSubset.textAlign === 'end' ? 'right' : styleSubset.textAlign as 'left' | 'center' | 'right' | 'justify' | undefined, textCase: undefined }
        : undefined
    },
    declarativeStyle: undefined,
    computedStyle: snapshot.computedStyle,
    semanticTokens: undefined,
    boundingBox: { x: snapshot.clientRect.x, y: snapshot.clientRect.y, width: snapshot.clientRect.width, height: snapshot.clientRect.height },
    asset: snapshot.asset,
    icon: snapshot.icon,
    state: { visible: snapshot.visibility.visible, display: snapshot.visibility.display, visibility: snapshot.visibility.visibility, opacity: snapshot.visibility.opacity, interactive: snapshot.semantics.clickTarget || ['input','button'].includes(kind), expanded: guardrails.dynamicStatefulBlock, selected: snapshot.checked },
    responsive: { viewportWidth: snapshot.breakpoint.viewportWidth, viewportHeight: snapshot.breakpoint.viewportHeight, breakpointName: snapshot.breakpoint.name },
    meta: {
      guardrails,
      renderSurface: snapshot.renderSurface,
      rendered: {
        contractVersion: RENDERED_UI_CONTRACT_VERSION,
        treePath: snapshot.treePath,
        breakpoint: snapshot.breakpoint,
        computedStyle: snapshot.computedStyle,
        visibility: snapshot.visibility,
        media: snapshot.media,
        asset: snapshot.asset,
        icon: snapshot.icon,
        semantics: snapshot.semantics,
        renderSurface: snapshot.renderSurface,
        dom: { tag: snapshot.tag, id: snapshot.domId, className: snapshot.className },
        form: { placeholder: snapshot.placeholder, inputType: snapshot.inputType, checked: snapshot.checked },
        guardrails,
        syncRelevantFields: snapshot.syncRelevantFields,
        mvpComputedStyleProperties: [...RENDERED_UI_MVP_COMPUTED_STYLE_PROPERTIES]
      }
    },
    children: snapshot.children.map((child: RenderedNodeSnapshot) => buildUiNode(child, sourceUrl))
  };
};

const buildHeuristicDomScript = (payload: { rootUiId?: string; breakpointName?: string; contractVersion: string; syncRelevantFields: string[]; allowPrivateDataCapture: boolean; allowRuntimeDataAsBaseline: boolean; pageRiskyRegions: string[]; mode: 'snapshot' | 'diagnose'; renderProfile: RenderProfile; }): string => {
  const json = JSON.stringify(payload);
  return `(() => {
    const args = ${json};
    const seenElements = new WeakSet();
    function toNumber(value) { const match = String(value || '').match(/-?\\d+(?:\\.\\d+)?/); return match ? Number(match[0]) : undefined; }
    function normalizeText(value) { if (!value) return undefined; const normalized = String(value).replace(/\\s+/g, ' ').trim(); return normalized || undefined; }
    function directText(element) { return normalizeText(Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || '').join(' ')); }
    function hasOwnVisualContainerStyle(style) { return Boolean((style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') || (style.backgroundImage && style.backgroundImage !== 'none') || (Number.parseFloat(style.borderTopWidth || '0') > 0 && style.borderTopStyle !== 'none') || Number.parseFloat(style.borderRadius || '0') > 0 || (style.boxShadow && style.boxShadow !== 'none') || Number.parseFloat(style.paddingTop || '0') > 0 || Number.parseFloat(style.paddingBottom || '0') > 0 || Number.parseFloat(style.paddingLeft || '0') > 0 || Number.parseFloat(style.paddingRight || '0') > 0); }
    function containsPrivateText(value) { return Boolean(value && ((/@/).test(value) || /\\b\\d{3}[- ]?\\d{2}[- ]?\\d{4}\\b/.test(value) || /\\+?\\d[\\d ()-]{7,}/.test(value))); }
    function resolveAssetPath(value) { if (!value) return undefined; try { return new URL(value, window.location.href).pathname; } catch { return value; } }
    function isVisible(el) { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return !(s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || '1') === 0 || r.width === 0 || r.height === 0 || el.hidden); }
    function isMeaningful(el) {
      const tag = el.tagName.toLowerCase();
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const text = directText(el) || normalizeText(el.innerText || el.textContent);
      const role = el.getAttribute('role') || '';
      const iconLike = tag === 'i' || (tag === 'span' && /(^|\s)(fa[srldb]?|fa-[\w-]+|bi|bi-[\w-]+)(\s|$)/.test(String(el.className || '')));
      const directSvgChild = el.children.length === 1 && el.firstElementChild instanceof SVGElement;
      const iconWrapperLike = hasOwnVisualContainerStyle(style) && rect.width > 0 && rect.height > 0 && rect.width <= 96 && rect.height <= 96 && (directSvgChild || Array.from(el.children || []).some((child) => child instanceof SVGElement));
      return isVisible(el) && (
        el.hasAttribute('data-ui-id') ||
        ['main','section','article','nav','header','footer','aside','button','a','input','textarea','select','img','picture','video','svg','canvas','form','ul','ol','li','h1','h2','h3','h4','h5','h6'].includes(tag) ||
        iconLike ||
        iconWrapperLike ||
        ['button','textbox','link','list','navigation','banner','main','switch'].includes(role) ||
        Boolean(text && text.length >= 2) ||
        rect.width * rect.height > 12000
      );
    }
    function scoreRoot(el) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      const tag = el.tagName.toLowerCase();
      const text = normalizeText(el.innerText || el.textContent) || '';
      let score = area;
      if (['main','section','article'].includes(tag)) score += 500000;
      if (tag === 'div') score += 100000;
      if (text.length > 40) score += 100000;
      if (el.querySelector('button,a,input,img,picture,video,svg,h1,h2,h3')) score += 120000;
      return score;
    }
    function domPath(element) {
      if (!(element instanceof Element) || element === document.body || element === document.documentElement) return '';
      const parts = [];
      let current = element;
      while (current && current instanceof Element && current !== document.body && current !== document.documentElement) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName) : [current];
        const index = Math.max(1, siblings.indexOf(current) + 1);
        parts.unshift(tag + '[' + index + ']');
        current = parent;
      }
      return parts.join('/');
    }
    function syntheticUiId(el) { const path = domPath(el); return path ? '__auto__/' + path : '__auto__/'; }
    function buildTreePath(element, parentPath) {
      const path = domPath(element);
      return path ? '/' + path : '/';
    }
    function resolveContentRoot(shellRoot, selectionMode) {
      const surfaceMode = args.renderProfile && args.renderProfile.surfaceMode;
      if (!(shellRoot instanceof HTMLElement) && !(shellRoot instanceof SVGElement)) return { contentRoot: shellRoot, selectionMode, contentSelectionMode: selectionMode, shellPreserved: false };
      if (!(surfaceMode === 'app_shell' || surfaceMode === 'auth_gated_spa')) return { contentRoot: shellRoot, selectionMode, contentSelectionMode: selectionMode, shellPreserved: false };
      const candidates = Array.from(shellRoot.querySelectorAll('main, [role="main"], section, article, [data-ui-root], [data-page-root], [data-route-root], [data-screen-root], [data-content-root]'))
        .filter((node) => node instanceof HTMLElement || node instanceof SVGElement)
        .filter((node) => isVisible(node));
      const scored = candidates
        .map((node) => {
          let score = scoreRoot(node);
          const tag = String(node.tagName || '').toLowerCase();
          if (tag === 'main') score += 800000;
          if (node.hasAttribute && (node.hasAttribute('data-page-root') || node.hasAttribute('data-route-root') || node.hasAttribute('data-screen-root') || node.hasAttribute('data-content-root'))) score += 1000000;
          if (node !== shellRoot && node.querySelector && node.querySelector('[data-ui-id]')) score += 300000;
          if (node === shellRoot) score -= 500000;
          return { node, score };
        })
        .sort((left, right) => right.score - left.score);
      const best = scored[0] && scored[0].node !== shellRoot ? scored[0].node : null;
      if (!best) return { contentRoot: shellRoot, selectionMode, contentSelectionMode: selectionMode, shellPreserved: false };
      return { contentRoot: best, selectionMode, contentSelectionMode: 'shell-content:' + String(best.tagName || '').toLowerCase(), shellPreserved: true };
    }
    function selectRoot() {
      const explicit = args.rootUiId ? document.querySelector('[data-ui-id="' + String(args.rootUiId).replace(/"/g, '\\"') + '"]') : null;
      if (explicit instanceof HTMLElement) return { shellRoot: explicit, contentRoot: explicit, resolvedByUiId: true, selectionMode: 'explicit-ui-id', contentSelectionMode: 'explicit-ui-id', shellPreserved: false };
      if (Array.isArray(args.renderProfile && args.renderProfile.preferredRootSelectors)) {
        for (const selector of args.renderProfile.preferredRootSelectors) {
          try {
            const matches = Array.from(document.querySelectorAll(selector)).filter((node) => node instanceof HTMLElement || node instanceof SVGElement);
            if (matches.length) {
              const best = matches.sort((left, right) => scoreRoot(right) - scoreRoot(left))[0];
              if (best) {
                const resolved = resolveContentRoot(best, 'preferred-selector:' + selector);
                return { shellRoot: best, ...resolved, resolvedByUiId: false };
              }
            }
          } catch {}
        }
      }
      if (document.body instanceof HTMLElement) {
        const resolved = resolveContentRoot(document.body, 'body-default');
        return { shellRoot: document.body, ...resolved, resolvedByUiId: false };
      }
      if (document.documentElement instanceof HTMLElement) {
        const resolved = resolveContentRoot(document.documentElement, 'document-default');
        return { shellRoot: document.documentElement, ...resolved, resolvedByUiId: false };
      }
      return { shellRoot: document.body, contentRoot: document.body, resolvedByUiId: false, selectionMode: 'body-fallback', contentSelectionMode: 'body-fallback', shellPreserved: false };
    }


    function inferAssetAndIcon(element, style, rect) {
      const tag = element.tagName.toLowerCase();
      const className = String(element.getAttribute('class') || '');
      const ariaHidden = element.getAttribute('aria-hidden') === 'true';
      const decorative = ariaHidden || element.getAttribute('role') === 'presentation';
      const sourceUrl = tag === 'img' ? (element.currentSrc || element.src || undefined) : undefined;
      const backgroundImage = style.backgroundImage && style.backgroundImage !== 'none' ? style.backgroundImage : undefined;
      const isFontIcon = tag === 'i' || (tag === 'span' && /(^|\s)(fa[srldb]?|fa-[\w-]+|bi|bi-[\w-]+)(\s|$)/.test(className));
      const directSvgChild = tag !== 'svg' && element.children.length === 1 && element.firstElementChild instanceof SVGElement ? element.firstElementChild : null;
      const containerHasOwnVisualStyle = hasOwnVisualContainerStyle(style);
      const shouldPromoteSingleSvgChild = Boolean(directSvgChild) && !(element.textContent || '').trim() && !containerHasOwnVisualStyle;
      const svgNode = tag === 'svg' ? element : (shouldPromoteSingleSvgChild ? directSvgChild : null);
      const isSvgIcon = Boolean(svgNode) && (tag === 'svg' || element.children.length <= 1);
      const icon = isFontIcon ? {
        sourceType: 'font-icon',
        textLabel: className || tag,
        svgMarkup: undefined,
        fill: style.color || undefined,
        stroke: undefined,
        size: { width: rect.width, height: rect.height },
        placement: decorative ? 'decorative' : 'standalone',
        spriteRef: undefined,
        hash: undefined,
        assetId: undefined,
        figmaStrategy: 'vector_icon'
      } : isSvgIcon ? {
        sourceType: svgNode && svgNode.querySelector && svgNode.querySelector('use') ? 'sprite' : 'inline-svg',
        textLabel: element.getAttribute('aria-label') || element.getAttribute('title') || (svgNode ? svgNode.getAttribute('aria-label') || svgNode.getAttribute('title') || className || tag : className || tag),
        svgMarkup: svgNode && svgNode.outerHTML ? svgNode.outerHTML : undefined,
        fill: style.color || undefined,
        stroke: style.stroke || undefined,
        size: { width: rect.width, height: rect.height },
        placement: decorative ? 'decorative' : (tag === 'svg' ? 'standalone' : 'leading'),
        spriteRef: svgNode && svgNode.querySelector && svgNode.querySelector('use') ? svgNode.querySelector('use').getAttribute('href') || svgNode.querySelector('use').getAttribute('xlink:href') || undefined : undefined,
        hash: undefined,
        assetId: undefined,
        figmaStrategy: 'vector_icon'
      } : { sourceType: undefined, textLabel: undefined, svgMarkup: undefined, fill: undefined, stroke: undefined, size: undefined, placement: undefined, spriteRef: undefined, hash: undefined, assetId: undefined, figmaStrategy: undefined };
      const asset = sourceUrl ? {
        layer: 'image',
        sourceUrl,
        resolvedAssetPath: sourceUrl,
        objectFit: style.objectFit || undefined,
        role: decorative ? 'decorative' : 'content',
        naturalSize: { width: element.naturalWidth || rect.width, height: element.naturalHeight || rect.height },
        renderedSize: { width: rect.width, height: rect.height },
        alt: element.getAttribute('alt') || undefined,
        hash: undefined,
        assetId: undefined,
        figmaStrategy: 'image_fill'
      } : backgroundImage ? {
        layer: 'background-image',
        sourceUrl: backgroundImage,
        resolvedAssetPath: backgroundImage,
        objectFit: undefined,
        role: decorative ? 'decorative' : 'content',
        naturalSize: undefined,
        renderedSize: { width: rect.width, height: rect.height },
        alt: undefined,
        hash: undefined,
        assetId: undefined,
        figmaStrategy: 'image_fill'
      } : icon.sourceType ? {
        layer: 'svg-icon',
        sourceUrl: undefined,
        resolvedAssetPath: undefined,
        objectFit: undefined,
        role: decorative ? 'decorative' : 'content',
        naturalSize: undefined,
        renderedSize: { width: rect.width, height: rect.height },
        alt: icon.textLabel || undefined,
        hash: undefined,
        assetId: undefined,
        figmaStrategy: 'vector_icon'
      } : {};
      return { asset, icon };
    }

    function nearestChildren(element) {
      return Array.from(element.children || []).filter((child) => child instanceof HTMLElement || child instanceof SVGElement).filter((child) => {
        if (child.hasAttribute('data-ui-id')) return true;
        if (isMeaningful(child)) return true;
        return Array.from(child.querySelectorAll('*')).some((desc) => desc instanceof HTMLElement && (desc.hasAttribute('data-ui-id') || isMeaningful(desc)));
      });
    }
    function buildNode(element, parentPath, inheritedUnstable) {
      if (seenElements.has(element)) return null;
      seenElements.add(element);
      const explicitUiId = element.getAttribute('data-ui-id') || undefined;
      const uiId = explicitUiId || syntheticUiId(element);
      const unstable = inheritedUnstable || !explicitUiId;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role') || undefined;
      const visible = isVisible(element);
      const treePath = buildTreePath(element, parentPath);
      const bodyStyle = window.getComputedStyle(document.body);
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const inheritedRootBackgroundColor = (!parentPath && (!style.backgroundColor || style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent')) ? ((bodyStyle.backgroundColor && bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? bodyStyle.backgroundColor : undefined) || (htmlStyle.backgroundColor && htmlStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? htmlStyle.backgroundColor : undefined)) : undefined;
      const inheritedRootBackgroundImage = (!parentPath && (!style.backgroundImage || style.backgroundImage === 'none')) ? ((bodyStyle.backgroundImage && bodyStyle.backgroundImage !== 'none' ? bodyStyle.backgroundImage : undefined) || (htmlStyle.backgroundImage && htmlStyle.backgroundImage !== 'none' ? htmlStyle.backgroundImage : undefined)) : undefined;
      const computedStyle = { color: style.color || undefined, backgroundColor: inheritedRootBackgroundColor || style.backgroundColor || undefined, backgroundImage: inheritedRootBackgroundImage || style.backgroundImage || undefined, borderColor: style.borderColor || undefined, borderWidth: toNumber(style.borderTopWidth), borderStyle: style.borderTopStyle || undefined, borderRadius: toNumber(style.borderRadius), boxShadow: style.boxShadow || undefined, opacity: Number(style.opacity || '1'), fontFamily: style.fontFamily || undefined, fontSize: toNumber(style.fontSize), fontWeight: style.fontWeight || undefined, lineHeight: toNumber(style.lineHeight), letterSpacing: toNumber(style.letterSpacing), textAlign: style.textAlign || undefined, display: style.display || undefined, flexDirection: style.flexDirection || undefined, flexWrap: style.flexWrap || undefined, alignItems: style.alignItems || undefined, alignContent: style.alignContent || undefined, justifyContent: style.justifyContent || undefined, justifyItems: style.justifyItems || undefined, justifySelf: style.justifySelf || undefined, gap: toNumber(style.gap), rowGap: toNumber(style.rowGap), columnGap: toNumber(style.columnGap), paddingTop: toNumber(style.paddingTop), paddingRight: toNumber(style.paddingRight), paddingBottom: toNumber(style.paddingBottom), paddingLeft: toNumber(style.paddingLeft), marginTop: toNumber(style.marginTop), marginRight: toNumber(style.marginRight), marginBottom: toNumber(style.marginBottom), marginLeft: toNumber(style.marginLeft), marginLeftAuto: style.marginLeft === 'auto', marginRightAuto: style.marginRight === 'auto', width: rect.width, height: rect.height, position: style.position || undefined, overflowX: style.overflowX || undefined, overflowY: style.overflowY || undefined };
      const ai = inferAssetAndIcon(element, style, rect); const asset = ai.asset; const icon = ai.icon;
      const media = {};
      if (asset.layer === 'image') { media.kind = tag === 'picture' ? 'picture' : tag === 'video' ? 'video' : 'img'; media.sourceUrl = asset.sourceUrl; media.alt = asset.alt; media.poster = tag === 'video' ? (element.poster || undefined) : undefined; media.sources = tag === 'picture' ? Array.from(element.querySelectorAll('source')).map((item) => item.getAttribute('srcset') || item.getAttribute('src')).filter(Boolean) : undefined; media.contentRole = asset.role; }
      else if (asset.layer === 'background-image') { media.kind = 'background-image'; media.sourceUrl = asset.sourceUrl; media.contentRole = asset.role; }
      else if (asset.layer === 'decorative-asset') { media.contentRole = asset.role; }
      if (icon.sourceType === 'inline-svg' || icon.sourceType === 'sprite') { media.kind = 'svg'; media.inlineSvg = icon.sourceType === 'inline-svg'; media.svgSpriteUse = icon.spriteRef; media.iconRole = icon.placement; media.contentRole = icon.placement === 'decorative' ? 'decorative' : 'content'; }
      else if (icon.sourceType === 'font-icon') { media.kind = 'icon-font'; media.iconRole = icon.placement; media.contentRole = icon.placement === 'decorative' ? 'decorative' : 'content'; }
      const normalizedText = directText(element) || normalizeText(element.innerText || element.textContent);
      const tagLower = tag.toLowerCase();
      const unsupportedRegions = Array.from(new Set([].concat(args.pageRiskyRegions || [], (unstable ? ['heuristic_node'] : []), tagLower === 'canvas' ? ['canvas'] : [], ((element.matches('[data-carousel], .carousel, .swiper, .slick-slider, [aria-roledescription="carousel"]') || element.closest('[data-carousel], .carousel, .swiper, .slick-slider, [aria-roledescription="carousel"]')) ? ['carousel'] : []), ((element.matches('[data-infinite-scroll="true"], .infinite-scroll, [data-virtualized="true"]') || element.closest('[data-infinite-scroll="true"], .infinite-scroll, [data-virtualized="true"]')) ? ['infinite_scroll'] : []), (((window.getComputedStyle(element).animationName !== 'none') || Number.parseFloat(window.getComputedStyle(element).transitionDuration || '0') > 0.2) ? ['animated_regions'] : []))));
      const privateNode = ((tagLower === 'input') && ['password','email','tel'].includes((element.getAttribute('type') || '').toLowerCase())) || Boolean(element.matches('[data-private="true"]')) || containsPrivateText(normalizedText);
      const dynamicStatefulBlock = unstable || ['input','textarea','select','video','canvas'].includes(tagLower) || element.hasAttribute('contenteditable') || element.hasAttribute('data-state') || element.hasAttribute('aria-expanded') || Boolean(element.closest('[data-carousel], .carousel, .swiper, .slick-slider'));
      const textValue = privateNode && !args.allowPrivateDataCapture ? undefined : normalizedText;
      return { contractVersion: args.contractVersion, uiId, tag, domId: element.id || undefined, className: element.getAttribute('class') || undefined, text: textValue, placeholder: element.getAttribute('placeholder') || undefined, inputType: element.getAttribute('type') || undefined, checked: element instanceof HTMLInputElement ? Boolean(element.checked) : undefined, treePath, clientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, computedStyle, visibility: { visible, display: style.display || undefined, visibility: style.visibility || undefined, opacity: Number(style.opacity || '1') }, media, asset, icon, semantics: { role, ariaLabel: element.getAttribute('aria-label') || undefined, headingLevel: /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) : undefined, clickTarget: typeof element.onclick === 'function' || ['button', 'link'].includes(role || '') || tag === 'button' || tag === 'a', hidden: element.hidden }, guardrails: { privateDataRedacted: privateNode && !args.allowPrivateDataCapture, runtimeBaseline: dynamicStatefulBlock && !args.allowRuntimeDataAsBaseline ? 'untrusted' : 'trusted', dynamicStatefulBlock, unsupportedRegions }, breakpoint: { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, name: args.breakpointName || undefined }, syncRelevantFields: args.syncRelevantFields, children: nearestChildren(element).map((child) => buildNode(child, treePath, unstable)).filter(Boolean) };
    }
    const selected = selectRoot();
    const tree = buildNode(selected.contentRoot, '', selected.contentSelectionMode !== 'explicit-ui-id' && !selected.contentRoot.hasAttribute('data-ui-id'));
    if (tree) {
      tree.renderSurface = { surfaceMode: args.renderProfile && args.renderProfile.surfaceMode, shellSelectionMode: selected.selectionMode, contentSelectionMode: selected.contentSelectionMode, shellPreserved: Boolean(selected.shellPreserved), shellRootTag: selected.shellRoot && selected.shellRoot.tagName ? String(selected.shellRoot.tagName).toLowerCase() : undefined, contentRootTag: selected.contentRoot && selected.contentRoot.tagName ? String(selected.contentRoot.tagName).toLowerCase() : undefined };
    }
    if (args.mode === 'diagnose') {
      const style = window.getComputedStyle(selected.contentRoot);
      const rect = selected.contentRoot.getBoundingClientRect();
      const computedStyle = { color: style.color || undefined, backgroundColor: style.backgroundColor || undefined, backgroundImage: style.backgroundImage || undefined, borderColor: style.borderColor || undefined, borderWidth: style.borderTopWidth || undefined, borderStyle: style.borderTopStyle || undefined, borderRadius: style.borderRadius || undefined, boxShadow: style.boxShadow || undefined, opacity: style.opacity || undefined, fontFamily: style.fontFamily || undefined, fontSize: style.fontSize || undefined, fontWeight: style.fontWeight || undefined, lineHeight: style.lineHeight || undefined, letterSpacing: style.letterSpacing || undefined, textAlign: style.textAlign || undefined, display: style.display || undefined, flexDirection: style.flexDirection || undefined, alignItems: style.alignItems || undefined, justifyContent: style.justifyContent || undefined, gap: style.gap || undefined, paddingTop: style.paddingTop || undefined, paddingRight: style.paddingRight || undefined, paddingBottom: style.paddingBottom || undefined, paddingLeft: style.paddingLeft || undefined, width: style.width || undefined, height: style.height || undefined, position: style.position || undefined, overflowX: style.overflowX || undefined, overflowY: style.overflowY || undefined };
      return { finalUrl: window.location.href, title: document.title, domUiIdCount: document.querySelectorAll('[data-ui-id]').length, rootRequestedUiId: args.rootUiId || undefined, rootResolvedByUiId: selected.resolvedByUiId, rootSelectionMode: selected.selectionMode, fallbackUsed: selected.selectionMode !== 'explicit-ui-id' && selected.selectionMode !== 'first-ui-id', rootSummary: { uiId: tree.uiId, tag: selected.contentRoot.tagName.toLowerCase(), text: normalizeText(selected.contentRoot.innerText || selected.contentRoot.textContent), childCount: tree.children.length, boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, computedStyle, shellSelectionMode: selected.selectionMode, contentSelectionMode: selected.contentSelectionMode, shellPreserved: Boolean(selected.shellPreserved), shellRootTag: selected.shellRoot && selected.shellRoot.tagName ? String(selected.shellRoot.tagName).toLowerCase() : undefined }, childUiIds: tree.children.map((child) => child.uiId), computedStyleKeys: Object.keys(computedStyle).filter((key) => computedStyle[key]) };
    }
    return tree;
  })()`;
};

const buildRenderedSnapshotScript = (payload: { rootUiId?: string; breakpointName?: string; contractVersion: string; syncRelevantFields: string[]; allowPrivateDataCapture: boolean; allowRuntimeDataAsBaseline: boolean; pageRiskyRegions: string[]; renderProfile: RenderProfile; }): string => buildHeuristicDomScript({ ...payload, mode: 'snapshot' });
const buildRenderedDiagnosticsScript = (payload: { rootUiId?: string; breakpointName?: string; contractVersion: string; syncRelevantFields: string[]; allowPrivateDataCapture: boolean; allowRuntimeDataAsBaseline: boolean; pageRiskyRegions: string[]; renderProfile: RenderProfile; }): string => buildHeuristicDomScript({ ...payload, mode: 'diagnose' });

export class PlaywrightRenderedUiRuntime implements RenderedUiRuntime {
  constructor(private readonly browserRendererService: BrowserRendererService = new BrowserRendererService()) {}


  public async diagnose(input: z.infer<typeof diagnoseRenderedUiSchema>): Promise<RenderedUiDiagnostics> {
    const normalized = normalizeRenderedExtractInput(input as z.infer<typeof extractRenderedUiSchema>);
    return this.browserRendererService.withPage(normalized, async ({ page, pageAudit, resolvedUrl, targetMode }) => {
      visualLogger.info({ rootUiId: normalized.rootUiId, breakpointName: normalized.breakpointName, pageAudit }, 'playwright rendered diagnostics start');
      const renderProfile = createRenderProfileResolver().resolve(normalized);
      const script = buildRenderedDiagnosticsScript({ rootUiId: normalized.rootUiId, breakpointName: normalized.breakpointName, contractVersion: RENDERED_UI_CONTRACT_VERSION, syncRelevantFields: [...RENDERED_UI_MVP_SYNC_RELEVANT_FIELDS], allowPrivateDataCapture: normalized.guardrails.allowPrivateDataCapture, allowRuntimeDataAsBaseline: normalized.guardrails.allowRuntimeDataAsBaseline, pageRiskyRegions: pageAudit.riskyRegions, renderProfile });
      const result = await page.evaluate(script) as Record<string, unknown>;
      const diagnostics = ({ targetMode, resolvedUrl, pageAudit, ...result } as unknown) as RenderedUiDiagnostics;
      visualLogger.info({ diagnostics }, 'playwright rendered diagnostics done');
      return diagnostics;
    });
  }

  public async capture(input: z.infer<typeof extractRenderedUiSchema>): Promise<RenderedNodeSnapshot> {
    const normalized = normalizeRenderedExtractInput(input);
    return this.browserRendererService.withPage(normalized, async ({ page, pageAudit }) => {
      visualLogger.info({ rootUiId: normalized.rootUiId, breakpointName: normalized.breakpointName, pageAudit }, 'playwright rendered capture start');
      const renderProfile = createRenderProfileResolver().resolve(normalized);
      const script = buildRenderedSnapshotScript({ rootUiId: normalized.rootUiId, breakpointName: normalized.breakpointName, contractVersion: RENDERED_UI_CONTRACT_VERSION, syncRelevantFields: [...RENDERED_UI_MVP_SYNC_RELEVANT_FIELDS], allowPrivateDataCapture: normalized.guardrails.allowPrivateDataCapture, allowRuntimeDataAsBaseline: normalized.guardrails.allowRuntimeDataAsBaseline, pageRiskyRegions: pageAudit.riskyRegions, renderProfile });
      const raw = await page.evaluate(script);
      const snapshot = renderedNodeSnapshotSchema.parse(raw);
      visualLogger.info({ root: summarizeNode(snapshot), pageAudit }, 'playwright rendered capture done');
      return snapshot;
    });
  }
}

export class RenderedUiExtractorService {
  constructor(private readonly runtime: RenderedUiRuntime = new PlaywrightRenderedUiRuntime(), private readonly designTokenService?: DesignTokenService, private readonly assetRegistryService?: { upsertAsset: (input: any) => AssetRegistryRecord }) {}


  public async diagnose(input: z.input<typeof diagnoseRenderedUiSchema>): Promise<RenderedUiDiagnostics> {
    const data = normalizeRenderedExtractInput(diagnoseRenderedUiSchema.parse(input) as z.infer<typeof extractRenderedUiSchema>);
    const runtime = this.runtime as RenderedUiRuntime & { diagnose?: (input: z.infer<typeof diagnoseRenderedUiSchema>) => Promise<RenderedUiDiagnostics> };
    if (typeof runtime.diagnose !== 'function') {
      throw new Error('Rendered UI diagnostics are only available for browser-backed runtime');
    }
    const diagnostics = await runtime.diagnose(data as z.infer<typeof diagnoseRenderedUiSchema>);
    if (!diagnostics.childSummaries || !diagnostics.childSummaries.length) {
      const document = await this.extract(data as z.infer<typeof extractRenderedUiSchema>);
      diagnostics.childSummaries = document.root.children.map((child) => {
        const rect = child.boundingBox;
        const area = rect && typeof rect.width === 'number' && typeof rect.height === 'number' ? rect.width * rect.height : 0;
        const reasons: string[] = [];
        if (['section','article','header','footer','nav','frame','button','list'].includes(child.kind)) reasons.push('semantic_kind');
        if (child.computedStyle?.display === 'grid' || child.computedStyle?.display === 'flex') reasons.push(`layout_${child.computedStyle.display}`);
        if (child.text && child.text.length > 80) reasons.push('long_text_content');
        if ((child.children?.length ?? 0) > 0) reasons.push('contains_nested_nodes');
        if (child.asset || child.icon) reasons.push('contains_asset_or_icon');
        if (!reasons.length) reasons.push('heuristic_section_candidate');
        return {
          uiId: child.uiId,
          tag: child.name ?? child.kind,
          textPreview: typeof child.text === 'string' ? child.text.slice(0, 120) : undefined,
          boundingBox: rect,
          display: child.computedStyle?.display,
          layoutDirection: child.computedStyle?.flexDirection,
          score: area + (reasons.includes('semantic_kind') ? 250000 : 0) + (reasons.some((x) => x.startsWith('layout_')) ? 120000 : 0) + (reasons.includes('long_text_content') ? 80000 : 0) + (reasons.includes('contains_nested_nodes') ? 60000 : 0) + (reasons.includes('contains_asset_or_icon') ? 40000 : 0),
          selectionReasons: reasons,
          area
        } as Record<string, unknown>;
      });
    }
    return diagnostics;
  }

  public async extract(input: z.input<typeof extractRenderedUiSchema>): Promise<UiModelDocument> {
    const data = normalizeRenderedExtractInput(extractRenderedUiSchema.parse(input));
    visualLogger.info({ targetMode: data.target.mode, rootUiId: data.rootUiId, breakpoint: data.breakpointName }, 'rendered document extract start');
    const snapshot = await this.runtime.capture(data);
    visualLogger.info({ snapshot: summarizeNode(snapshot), breakpoint: data.breakpointName }, 'rendered runtime snapshot captured');
    const sourceUrl = data.target.mode === 'existing_url' ? data.target.url : data.target.mode === 'preview_build' ? (data.target.readyUrl ?? `http://127.0.0.1:${data.target.port}${data.target.path.startsWith('/') ? data.target.path : `/${data.target.path}`}`) : (data.target.readyUrl ?? `http://127.0.0.1:${data.target.port}${data.target.path.startsWith('/') ? data.target.path : `/${data.target.path}`}`);
    const renderProfile = createRenderProfileResolver().resolve(data);
    const document = annotateDocumentWithTokens(uiModelDocumentSchema.parse({ version: "ui-model.v1", root: buildUiNode(snapshot, sourceUrl) }), this.designTokenService, data.project);
    document.root.meta = { ...(document.root.meta ?? {}), renderProfile };
    this.registerAssets(document, data.project);
    const annotated = attachPlanningContext(annotateVisualConfidence(document));
    visualLogger.info({ root: summarizeNode(annotated.root), sourceUrl, renderProfile }, 'rendered document extract done');
    return annotated;
  }

  private registerAssets(document: UiModelDocument, project?: string): void {
    const registry = this.assetRegistryService;
    if (!project || !registry) return;
    const walk = (node: UiNode): void => {
      if (node.asset && (node.asset.sourceUrl || node.asset.resolvedAssetPath)) {
        const asset = node.asset;
        const hash = inferAssetHash({
          assetKind: asset.layer === 'svg-icon' ? 'svg' : (asset.layer ?? 'image'),
          sourcePath: asset.resolvedAssetPath,
          resolvedUrl: asset.sourceUrl,
          width: asset.naturalSize?.width ?? asset.renderedSize?.width,
          height: asset.naturalSize?.height ?? asset.renderedSize?.height,
          role: asset.role
        });
        const assetId = inferAssetId(project, node.uiId, hash);
        const figmaStrategy = inferFigmaAssetStrategy({
          assetKind: asset.layer === 'svg-icon' ? 'svg' : ((asset.layer as any) ?? 'image'),
          role: asset.role,
          sourcePath: asset.resolvedAssetPath,
          resolvedUrl: asset.sourceUrl
        });
        node.asset = { ...asset, hash, assetId, figmaStrategy };
        registry.upsertAsset({
          assetId,
          project,
          uiId: node.uiId,
          assetKind: asset.layer === 'svg-icon' ? 'svg' : ((asset.layer as any) ?? 'image'),
          sourcePath: asset.resolvedAssetPath,
          resolvedUrl: asset.sourceUrl,
          hash,
          width: asset.naturalSize?.width ?? asset.renderedSize?.width,
          height: asset.naturalSize?.height ?? asset.renderedSize?.height,
          role: asset.role,
          figmaStrategy,
          metadata: { alt: asset.alt, objectFit: asset.objectFit }
        });
      }
      if (node.icon && node.icon.sourceType) {
        const icon = node.icon;
        const hash = inferAssetHash({
          assetKind: 'icon',
          sourcePath: icon.spriteRef,
          resolvedUrl: icon.textLabel,
          width: icon.size?.width,
          height: icon.size?.height,
          role: icon.placement
        });
        const assetId = inferAssetId(project, node.uiId, hash);
        const figmaStrategy = inferFigmaAssetStrategy({ assetKind: 'icon', metadata: { sourceType: icon.sourceType } });
        node.icon = { ...icon, hash, assetId, figmaStrategy };
        registry.upsertAsset({
          assetId,
          project,
          uiId: node.uiId,
          assetKind: icon.sourceType === 'inline-svg' || icon.sourceType === 'sprite' ? 'svg' : 'icon',
          sourcePath: icon.spriteRef,
          resolvedUrl: icon.textLabel,
          hash,
          width: icon.size?.width,
          height: icon.size?.height,
          role: icon.placement === 'decorative' ? 'decorative' : 'content',
          figmaStrategy,
          metadata: { sourceType: icon.sourceType, fill: icon.fill, stroke: icon.stroke, placement: icon.placement }
        });
      }
      node.children.forEach(walk);
    };
    walk(document.root);
  }

  public async extractBreakpoints(input: z.input<typeof extractRenderedUiBreakpointsSchema>): Promise<RenderedBreakpointSnapshotResult> {
    const data = extractRenderedUiBreakpointsSchema.parse(input);
    const snapshots = {} as Record<RenderedBreakpointPreset, UiModelDocument>;
    for (const breakpoint of data.breakpoints) {
      snapshots[breakpoint] = await this.extract({ ...data, breakpoint, breakpointName: breakpoint });
    }
    return { activeBreakpoint: data.breakpoints[0], snapshots };
  }
}

export const createRenderedUiExtractorService = (runtime?: RenderedUiRuntime, designTokenService?: DesignTokenService, assetRegistryService?: { upsertAsset: (input: any) => AssetRegistryRecord }): RenderedUiExtractorService => new RenderedUiExtractorService(runtime ?? new PlaywrightRenderedUiRuntime(), designTokenService, assetRegistryService);
