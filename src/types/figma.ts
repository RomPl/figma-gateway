export type FigmaNodeType = string;

export type FigmaImageFormat = 'jpg' | 'png' | 'svg' | 'pdf';

export type FigmaStyleType =
  | 'FILL'
  | 'TEXT'
  | 'EFFECT'
  | 'GRID'
  | 'TOKEN'
  | 'UNKNOWN'
  | string;

export type FigmaVariableResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';

export type FigmaVariableScope = string;

export type FigmaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type FigmaVariableAlias = {
  type: 'VARIABLE_ALIAS';
  id: string;
};

export type FigmaVariableValue = boolean | number | string | FigmaColor | FigmaVariableAlias | null;

export type FigmaUser = {
  id?: string;
  handle?: string;
  img_url?: string;
  email?: string;
  [key: string]: unknown;
};

export type FigmaFrameInfo = {
  nodeId?: string;
  name?: string;
  backgroundColor?: string;
  pageId?: string;
  pageName?: string;
  [key: string]: unknown;
};

export type FigmaNode = {
  id: string;
  name: string;
  type: FigmaNodeType;
  children?: FigmaNode[];
  visible?: boolean;
  [key: string]: unknown;
};

export type FigmaFileResponse = {
  document: FigmaNode;
  components?: Record<string, FigmaPublishedComponent>;
  componentSets?: Record<string, FigmaPublishedComponentSet>;
  schemaVersion?: number;
  styles?: Record<string, FigmaPublishedStyle>;
  name?: string;
  role?: string;
  editorType?: string;
  linkAccess?: string;
  version?: string;
  [key: string]: unknown;
};

export type FigmaFileNode = {
  document: FigmaNode | null;
  components?: Record<string, FigmaPublishedComponent>;
  componentSets?: Record<string, FigmaPublishedComponentSet>;
  schemaVersion?: number;
  styles?: Record<string, FigmaPublishedStyle>;
  [key: string]: unknown;
};

export type FigmaNodesResponse = {
  name?: string;
  nodes: Record<string, FigmaFileNode | null>;
  [key: string]: unknown;
};

export type FigmaImagesResponse = {
  err?: string;
  images: Record<string, string | null>;
  status?: number;
};

export type FigmaPublishedStyle = {
  key: string;
  file_key: string;
  node_id: string;
  style_type: FigmaStyleType;
  thumbnail_url?: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  sort_position?: string;
  user?: FigmaUser;
  [key: string]: unknown;
};

export type FigmaPublishedComponent = {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url?: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  user?: FigmaUser;
  containing_frame?: FigmaFrameInfo;
  [key: string]: unknown;
};

export type FigmaPublishedComponentSet = FigmaPublishedComponent;

export type FigmaLibraryResponse<TItem, TKey extends string> = {
  status: number;
  error: boolean;
  meta: Record<TKey, TItem[]>;
};

export type FigmaStylesResponse = FigmaLibraryResponse<FigmaPublishedStyle, 'styles'>;

export type FigmaComponentsResponse = FigmaLibraryResponse<FigmaPublishedComponent, 'components'>;

export type FigmaComponentSetsResponse = FigmaLibraryResponse<
  FigmaPublishedComponentSet,
  'component_sets'
>;

export type FigmaVariableCodeSyntax = {
  WEB?: string;
  ANDROID?: string;
  iOS?: string;
  [key: string]: string | undefined;
};

export type FigmaVariable = {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: FigmaVariableResolvedType;
  valuesByMode: Record<string, FigmaVariableValue>;
  remote: boolean;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: FigmaVariableScope[];
  codeSyntax?: FigmaVariableCodeSyntax;
  subscribed_id?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type FigmaVariableMode = {
  modeId: string;
  name: string;
  parentModeId?: string;
};

export type FigmaVariableCollection = {
  id: string;
  name: string;
  key: string;
  modes?: FigmaVariableMode[];
  defaultModeId?: string;
  remote?: boolean;
  hiddenFromPublishing?: boolean;
  variableIds?: string[];
  isExtension?: boolean;
  parentVariableCollectionId?: string;
  rootVariableCollectionId?: string;
  inheritedVariableIds?: string[];
  localVariableIds?: string[];
  variableOverrides?: Record<string, Record<string, FigmaVariableValue>>;
  deletedButReferenced?: boolean;
  subscribed_id?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type FigmaVariablesMeta = {
  variables: Record<string, FigmaVariable>;
  variableCollections: Record<string, FigmaVariableCollection>;
};

export type FigmaVariablesResponse = {
  status: number;
  error: boolean;
  meta: FigmaVariablesMeta;
};

export type FigmaApiErrorPayload = {
  status?: number;
  err?: string;
  message?: string;
  error?: boolean;
  meta?: unknown;
  [key: string]: unknown;
};
