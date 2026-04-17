import { z } from 'zod';

const uiKindSchema = z.enum([
  'page',
  'section',
  'frame',
  'group',
  'text',
  'image',
  'button',
  'input',
  'card',
  'list',
  'icon',
  'component_instance'
]);

const semanticRoleSchema = z.enum([
  'root',
  'container',
  'headline',
  'subheadline',
  'body',
  'caption',
  'button-primary',
  'button-secondary',
  'input-field',
  'image-hero',
  'list-item',
  'icon-leading',
  'icon-trailing'
]).optional();

const sizeSchema = z.object({ width: z.number().finite().nonnegative().optional(), height: z.number().finite().nonnegative().optional() }).partial();
const positionSchema = z.object({ x: z.number().finite().optional(), y: z.number().finite().optional() }).partial();
const edgeInsetsSchema = z.object({ top: z.number().finite().nonnegative(), right: z.number().finite().nonnegative(), bottom: z.number().finite().nonnegative(), left: z.number().finite().nonnegative() });

const layoutSchema = z.object({
  type: z.enum(['none', 'horizontal', 'vertical', 'stack']).default('none'),
  gap: z.number().finite().nonnegative().optional(),
  padding: edgeInsetsSchema.optional(),
  alignment: z.object({ primary: z.enum(['start', 'center', 'end', 'space-between']).optional(), cross: z.enum(['start', 'center', 'end', 'stretch']).optional() }).partial().optional(),
  wrap: z.boolean().optional()
}).partial();

const textStyleSchema = z.object({
  fontFamily: z.string().trim().min(1).optional(),
  fontStyle: z.string().trim().min(1).optional(),
  fontSize: z.number().finite().positive().optional(),
  lineHeight: z.number().finite().positive().optional(),
  letterSpacing: z.number().finite().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  textCase: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional()
}).partial();

const paintSchema = z.object({ value: z.string().trim().min(1).optional(), token: z.string().trim().min(1).optional(), opacity: z.number().min(0).max(1).optional() }).partial();

const styleSchema = z.object({
  fill: z.union([z.string().trim().min(1), paintSchema]).optional(),
  stroke: z.union([z.string().trim().min(1), paintSchema]).optional(),
  radius: z.number().finite().nonnegative().optional(),
  opacity: z.number().min(0).max(1).optional(),
  text: textStyleSchema.optional()
}).partial();

const computedStyleSchema = z.object({
  color: z.string().trim().min(1).optional(),
  backgroundColor: z.string().trim().min(1).optional(),
  backgroundImage: z.string().trim().min(1).optional(),
  borderColor: z.string().trim().min(1).optional(),
  borderWidth: z.number().finite().nonnegative().optional(),
  borderStyle: z.string().trim().min(1).optional(),
  borderRadius: z.number().finite().nonnegative().optional(),
  boxShadow: z.string().trim().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontSize: z.number().finite().positive().optional(),
  fontWeight: z.string().trim().min(1).optional(),
  lineHeight: z.number().finite().positive().optional(),
  letterSpacing: z.number().finite().optional(),
  textAlign: z.string().trim().min(1).optional(),
  display: z.string().trim().min(1).optional(),
  flexDirection: z.string().trim().min(1).optional(),
  flexWrap: z.string().trim().min(1).optional(),
  alignItems: z.string().trim().min(1).optional(),
  alignContent: z.string().trim().min(1).optional(),
  justifyContent: z.string().trim().min(1).optional(),
  justifyItems: z.string().trim().min(1).optional(),
  justifySelf: z.string().trim().min(1).optional(),
  gap: z.number().finite().nonnegative().optional(),
  rowGap: z.number().finite().nonnegative().optional(),
  columnGap: z.number().finite().nonnegative().optional(),
  paddingTop: z.number().finite().optional(),
  paddingRight: z.number().finite().optional(),
  paddingBottom: z.number().finite().optional(),
  paddingLeft: z.number().finite().optional(),
  marginTop: z.number().finite().optional(),
  marginRight: z.number().finite().optional(),
  marginBottom: z.number().finite().optional(),
  marginLeft: z.number().finite().optional(),
  marginLeftAuto: z.boolean().optional(),
  marginRightAuto: z.boolean().optional(),
  width: z.number().finite().nonnegative().optional(),
  height: z.number().finite().nonnegative().optional(),
  position: z.string().trim().min(1).optional(),
  overflowX: z.string().trim().min(1).optional(),
  overflowY: z.string().trim().min(1).optional()
}).partial();

const sourceMappingSchema = z.object({
  fileKey: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  codePath: z.string().trim().min(1).optional(),
  codeExportName: z.string().trim().min(1).optional(),
  codeSelector: z.string().trim().min(1).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  jsxPath: z.string().trim().min(1).optional()
}).partial();

const tokenRefsSchema = z.object({
  fill: z.string().trim().min(1).optional(),
  stroke: z.string().trim().min(1).optional(),
  spacing: z.string().trim().min(1).optional(),
  radius: z.string().trim().min(1).optional(),
  typography: z.string().trim().min(1).optional(),
  shadow: z.string().trim().min(1).optional(),
  breakpoint: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]).optional()
}).partial();

const boundingBoxSchema = z.object({ x: z.number().finite().optional(), y: z.number().finite().optional(), width: z.number().finite().nonnegative().optional(), height: z.number().finite().nonnegative().optional() }).partial();
const assetInfoSchema = z.object({
  layer: z.enum(['image', 'svg-icon', 'background-image', 'decorative-asset']).optional(),
  assetId: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
  resolvedAssetPath: z.string().trim().min(1).optional(),
  hash: z.string().trim().min(1).optional(),
  naturalSize: sizeSchema.optional(),
  renderedSize: sizeSchema.optional(),
  objectFit: z.string().trim().min(1).optional(),
  alt: z.string().optional(),
  role: z.enum(['content', 'decorative']).optional(),
  figmaStrategy: z.enum(['image_fill', 'vector_icon', 'placeholder']).optional(),
  changeType: z.enum(['asset_ref_change', 'layout_around_asset_change']).optional()
}).partial();
const iconInfoSchema = z.object({
  sourceType: z.enum(['inline-svg', 'component', 'sprite', 'font-icon']).optional(),
  textLabel: z.string().optional(),
  fill: z.string().trim().min(1).optional(),
  stroke: z.string().trim().min(1).optional(),
  size: sizeSchema.optional(),
  placement: z.enum(['standalone', 'leading', 'trailing', 'decorative']).optional(),
  spriteRef: z.string().trim().min(1).optional(),
  hash: z.string().trim().min(1).optional(),
  assetId: z.string().trim().min(1).optional(),
  figmaStrategy: z.enum(['image_fill', 'vector_icon', 'placeholder']).optional()
}).partial();
const stateInfoSchema = z.object({
  visible: z.boolean().optional(),
  display: z.string().trim().min(1).optional(),
  visibility: z.string().trim().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  interactive: z.boolean().optional(),
  disabled: z.boolean().optional(),
  selected: z.boolean().optional(),
  expanded: z.boolean().optional(),
  focused: z.boolean().optional(),
  hovered: z.boolean().optional(),
  active: z.boolean().optional()
}).partial();
const confidenceSchema = z.object({
  ast: z.number().min(0).max(1),
  rendered: z.number().min(0).max(1),
  figma: z.number().min(0).max(1),
  token: z.number().min(0).max(1),
  visual: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reasons: z.array(z.string())
});

const responsiveContextSchema = z.object({
  viewportWidth: z.number().finite().positive().optional(),
  viewportHeight: z.number().finite().positive().optional(),
  breakpointName: z.string().trim().min(1).optional(),
  hiddenOn: z.array(z.enum(['mobile', 'tablet', 'desktop'])).optional(),
  visibleOn: z.array(z.enum(['mobile', 'tablet', 'desktop'])).optional()
}).partial();

export type UiKind = z.infer<typeof uiKindSchema>;
export type SemanticRole = z.infer<typeof semanticRoleSchema>;
export type UiSize = z.infer<typeof sizeSchema>;
export type UiPosition = z.infer<typeof positionSchema>;
export type UiEdgeInsets = z.infer<typeof edgeInsetsSchema>;
export type UiLayout = z.infer<typeof layoutSchema>;
export type UiTextStyle = z.infer<typeof textStyleSchema>;
export type UiPaint = z.infer<typeof paintSchema>;
export type UiStyle = z.infer<typeof styleSchema>;
export type UiComputedStyle = z.infer<typeof computedStyleSchema>;
export type UiSourceMapping = z.infer<typeof sourceMappingSchema>;
export type UiTokenRefs = z.infer<typeof tokenRefsSchema>;
export type UiBoundingBox = z.infer<typeof boundingBoxSchema>;
export type UiAssetInfo = z.infer<typeof assetInfoSchema>;
export type UiIconInfo = z.infer<typeof iconInfoSchema>;
export type UiStateInfo = z.infer<typeof stateInfoSchema>;
export type UiResponsiveContext = z.infer<typeof responsiveContextSchema>;
export type UiConfidence = z.infer<typeof confidenceSchema>;

export type UiNode = {
  kind: UiKind;
  uiId: string;
  name?: string;
  role?: SemanticRole;
  visible?: boolean;
  text?: string;
  source?: UiSourceMapping;
  size?: UiSize;
  position?: UiPosition;
  spacing?: number;
  padding?: UiEdgeInsets;
  layout?: UiLayout;
  style?: UiStyle;
  declarativeStyle?: UiStyle;
  computedStyle?: UiComputedStyle;
  tokens?: UiTokenRefs;
  semanticTokens?: UiTokenRefs;
  boundingBox?: UiBoundingBox;
  asset?: UiAssetInfo;
  icon?: UiIconInfo;
  state?: UiStateInfo;
  responsive?: UiResponsiveContext;
  confidence?: UiConfidence;
  meta?: Record<string, unknown>;
  children: UiNode[];
};

export const uiNodeSchema: z.ZodType<UiNode> = z.lazy(() => z.object({
  kind: uiKindSchema,
  uiId: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  role: semanticRoleSchema,
  visible: z.boolean().default(true),
  text: z.string().optional(),
  source: sourceMappingSchema.optional(),
  size: sizeSchema.optional(),
  position: positionSchema.optional(),
  spacing: z.number().finite().nonnegative().optional(),
  padding: edgeInsetsSchema.optional(),
  layout: layoutSchema.optional(),
  style: styleSchema.optional(),
  declarativeStyle: styleSchema.optional(),
  computedStyle: computedStyleSchema.optional(),
  tokens: tokenRefsSchema.optional(),
  semanticTokens: tokenRefsSchema.optional(),
  boundingBox: boundingBoxSchema.optional(),
  asset: assetInfoSchema.optional(),
  icon: iconInfoSchema.optional(),
  state: stateInfoSchema.optional(),
  responsive: responsiveContextSchema.optional(),
  confidence: confidenceSchema.optional(),
  meta: z.record(z.string(), z.unknown()).default({}).optional(),
  children: z.array(uiNodeSchema).default([])
}));

export const uiModelDocumentSchema = z.object({ version: z.literal('ui-model.v1').default('ui-model.v1'), root: uiNodeSchema });
export type UiModelDocument = z.infer<typeof uiModelDocumentSchema>;
export const serializeUiModel = (document: UiModelDocument): string => JSON.stringify(uiModelDocumentSchema.parse(document), null, 2);
export const deserializeUiModel = (input: string | unknown): UiModelDocument => { const raw = typeof input === 'string' ? JSON.parse(input) : input; return uiModelDocumentSchema.parse(raw); };

export const getRequiredSyncFields = (kind: UiKind): string[] => {
  const common = ['kind', 'uiId', 'visible'];
  switch (kind) {
    case 'text': return [...common, 'text'];
    case 'image': return [...common, 'size'];
    case 'button':
    case 'input': return [...common, 'name'];
    default: return common;
  }
};

export const collectSyncRequiredFieldPaths = (node: UiNode): string[] => {
  const fields = new Set<string>(getRequiredSyncFields(node.kind));
  if (node.layout) fields.add('layout.type');
  if (node.padding) fields.add('padding');
  if (node.spacing !== undefined) fields.add('spacing');
  if (node.declarativeStyle?.fill !== undefined || node.style?.fill !== undefined) fields.add('declarativeStyle.fill');
  if (node.declarativeStyle?.stroke !== undefined || node.style?.stroke !== undefined) fields.add('declarativeStyle.stroke');
  if (node.declarativeStyle?.radius !== undefined || node.style?.radius !== undefined) fields.add('declarativeStyle.radius');
  if (node.declarativeStyle?.text !== undefined || node.style?.text !== undefined) fields.add('declarativeStyle.text');
  if (node.computedStyle) fields.add('computedStyle');
  if (node.boundingBox) fields.add('boundingBox');
  if (node.asset) fields.add('asset');
  if (node.state) fields.add('state');
  if (node.responsive) fields.add('responsive');
  if (node.semanticTokens || node.tokens) fields.add('semanticTokens');
  if (node.confidence) fields.add('confidence');
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
};
