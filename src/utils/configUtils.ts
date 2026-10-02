import type { AppConfig, TreeNode } from '../types/config';

/** Lift only legacy, decorative home-lab wrappers. Never discard a service. */
export function networkBranches(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap(node => {
    const home = /^(home\s*lab|network root)$/i.test(node.title.trim());
    const service = node.monitored || node.internalAddress || node.externalAddress || (node.ip && node.healthCheckPort) || node.url || node.plexToken || node.backupWindow;
    return home && !service ? networkBranches(node.children ?? []) : [node];
  });
}

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
    tree: { ...(serverConfig.tree || defaults.tree), nodes: networkBranches((serverConfig.tree || defaults.tree).nodes) },
  };
}
