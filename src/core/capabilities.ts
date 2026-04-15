import { config } from '../config/env';

export type GatewayCapabilities = {
  supportsCreatePage: boolean;
  supportsCreateFile: boolean;
  liveWriteBackendConfigured: boolean;
  pluginBridgeConfigured: boolean;
  supportedWriteOperations: string[];
};

export const getGatewayCapabilities = (): GatewayCapabilities => ({
  supportsCreatePage: true,
  supportsCreateFile: false,
  liveWriteBackendConfigured: false,
  pluginBridgeConfigured: true,
  supportedWriteOperations: config.writeAllowedOperations
});
