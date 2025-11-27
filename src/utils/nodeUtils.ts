import type { TreeNode } from '../types/config';

/**
 * Extracts all node identifiers for health check monitoring.
 * NEW ARCHITECTURE: Only includes nodes with healthCheckPort specified.
 * Nodes without healthCheckPort are excluded from health monitoring.
 */
export const extractMonitoredNodeIdentifiers = (nodes: TreeNode[]): string[] => {
  const identifiers: string[] = [];
  
  const traverse = (nodeList: TreeNode[]) => {
    for (const node of nodeList) {
      // Only monitor nodes with healthCheckPort and ip specified, AND not explicitly disabled
      if (node.healthCheckPort && node.ip && !node.disableHealthCheck) {
        const identifier = `${node.ip}:${node.healthCheckPort}`;
        identifiers.push(identifier);
      }
      
      if (node.children) {
        traverse(node.children);
      }
    }
  };
  
  traverse(nodes);
  return identifiers;
};

/**
 * Normalizes a node identifier to ensure consistent format for lookups.
 * Removes protocols and trailing slashes for consistent matching.
 */
export const normalizeNodeIdentifier = (identifier: string): string => {
  if (!identifier) return '';
  
  let normalized = identifier;
  
  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, '');
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized;
};
