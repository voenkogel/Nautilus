import type { AppConfig } from '../types/config';

/**
 * Merges a server-provided config over the local defaults, ensuring every
 * top-level section is present. Used wherever the client loads /api/config.
 */
export function normalizeConfig(serverConfig: AppConfig, defaults: AppConfig): AppConfig {
  return {
    ...defaults,
    ...serverConfig,
    server: { ...defaults.server, ...serverConfig.server },
    client: { ...defaults.client, ...serverConfig.client },
    appearance: { ...defaults.appearance, ...serverConfig.appearance },
    tree: serverConfig.tree || defaults.tree,
  };
}
