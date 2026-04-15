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

const sizeSchema = z.object({
  width: z.number().finite().nonnegative().optional(),
  height: z.number().finite().nonnegative().optional()
}).partial();

const positionSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional()
}).partial();

const edgeInsetsSchema = z.object({
  top: z.number().finite().nonnegative(),
  right: z.number().finite().nonnegative(),
  bottom: z.number().finite().nonnegative(),
  left: z.number().finite().nonnegative()
});

const layoutSchema = z.object({
  type: z.enum(['none', 'horizontal', 'vertical', 'stack']).default('none'),
  gap: z.number().finite().nonnegative().optional(),
  padding: edgeInsetsSchema.optional(),
  alignment: z.object({
    primary: z.enum(['start', 'center', 'end', 'space-between']).optional(),
    cross: z.enum(['start', 'center', 'end', 'stretch']).optional()
  }).partial().optional(),
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

const paintSchema = z.object({
  value: z.string().trim().min(1).optional(),
  token: z.string().trim().min(1).optional(),
  opacity: z.number().min(0).max(1).optional()
}).partial();

const styleSchema = z.object({
  fill: z.union([z.string().trim().min(1), paintSchema]).optional(),
  stroke: z.union([z.string().trim().min(1), paintSchema]).optional(),
  radius: z.number().finite().nonnegative().optional(),
  opacity: z.number().min(0).max(1).optional(),
  text: textStyleSchema.optional()
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

export type UiKind = z.infer<typeof uiKindSchema>;
export type SemanticRole = z.infer<typeof semanticRoleSchema>;
export type UiSize = z.infer<typeof sizeSchema>;
export type UiPosition = z.infer<typeof positionSchema>;
export type UiEdgeInsets = z.infer<typeof edgeInsetsSchema>;
export type UiLayout = z.infer<typeof layoutSchema>;
export type UiTextStyle = z.infer<typeof textStyleSchema>;
export type UiPaint = z.infer<typeof paintSchema>;
export type UiStyle = z.infer<typeof styleSchema>;
export type UiSourceMapping = z.infer<typeof sourceMappingSchema>;
export type UiTokenRefs = z.infer<typeof tokenRefsSchema>;
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
  tokens?: UiTokenRefs;
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
  tokens: tokenRefsSchema.optional(),
  meta: z.record(z.string(), z.unknown()).default({}).optional(),
  children: z.array(uiNodeSchema).default([])
}));

export const uiModelDocumentSchema = z.object({
  version: z.literal('ui-model.v1').default('ui-model.v1'),
  root: uiNodeSchema
});

export type UiModelDocument = z.infer<typeof uiModelDocumentSchema>;

export const serializeUiModel = (document: UiModelDocument): string =>
  JSON.stringify(uiModelDocumentSchema.parse(document), null, 2);

export const deserializeUiModel = (input: string | unknown): UiModelDocument => {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  return uiModelDocumentSchema.parse(raw);
};

export const getRequiredSyncFields = (kind: UiKind): string[] => {
  const common = ['kind', 'uiId', 'visible'];
  switch (kind) {
    case 'text':
      return [...common, 'text'];
    case 'image':
      return [...common, 'size'];
    case 'button':
    case 'input':
      return [...common, 'name'];
    default:
      return common;
  }
};

export const collectSyncRequiredFieldPaths = (node: UiNode): string[] => {
  const fields = new Set<string>(getRequiredSyncFields(node.kind));
  if (node.layout) fields.add('layout.type');
  if (node.padding) fields.add('padding');
  if (node.spacing !== undefined) fields.add('spacing');
  if (node.style?.fill !== undefined) fields.add('style.fill');
  if (node.style?.stroke !== undefined) fields.add('style.stroke');
  if (node.style?.radius !== undefined) fields.add('style.radius');
  if (node.style?.text !== undefined) fields.add('style.text');
  if (node.tokens) fields.add('tokens');
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
};
