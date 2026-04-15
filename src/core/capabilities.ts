import { config } from '../config/env';

export type GatewayMvpScope = {
  version: 'v1';
  code: {
    frameworks: string[];
    languages: string[];
    supportedBlockMarkers: string[];
  };
  figma: {
    supportedNodeTypes: string[];
    supportedVisualProperties: string[];
    supportedLayoutFeatures: string[];
  };
  tokens: {
    categories: string[];
    mappingSources: string[];
    sharedSourceOfTruth: boolean;
  };
  workflows: {
    canCreateFigmaMockupFromCode: boolean;
    canSyncSimpleVisualChangesBackToCode: boolean;
    canRoundTripArbitraryTechnologies: boolean;
  };
  excludes: string[];
};

export type GatewayCapabilities = {
  supportsCreatePage: boolean;
  supportsCreateFile: boolean;
  liveWriteBackendConfigured: boolean;
  pluginBridgeConfigured: boolean;
  supportedWriteOperations: string[];
  mvpScope: GatewayMvpScope;
};

export const getGatewayMvpScope = (): GatewayMvpScope => ({
  version: 'v1',
  code: {
    frameworks: ['React'],
    languages: ['TypeScript'],
    supportedBlockMarkers: ['data-ui-id']
  },
  figma: {
    supportedNodeTypes: ['SECTION', 'FRAME', 'GROUP', 'TEXT', 'IMAGE', 'BUTTON-LIKE'],
    supportedVisualProperties: ['colors', 'typography', 'spacing', 'border-radius'],
    supportedLayoutFeatures: ['auto-layout', 'basic-layout-components']
  },
  tokens: {
    categories: ['colors', 'spacing', 'typography', 'radius', 'shadows', 'breakpoints'],
    mappingSources: ['code', 'figma', 'registry'],
    sharedSourceOfTruth: true
  },
  workflows: {
    canCreateFigmaMockupFromCode: true,
    canSyncSimpleVisualChangesBackToCode: true,
    canRoundTripArbitraryTechnologies: false
  },
  excludes: [
    'complex business logic',
    'animations',
    'complex canvas/webgl UI',
    'responsive diff across all breakpoints at once',
    'full round-trip for arbitrary technologies'
  ]
});

export const getGatewayCapabilities = (): GatewayCapabilities => ({
  supportsCreatePage: true,
  supportsCreateFile: false,
  liveWriteBackendConfigured: false,
  pluginBridgeConfigured: true,
  supportedWriteOperations: config.writeAllowedOperations,
  mvpScope: getGatewayMvpScope()
});
