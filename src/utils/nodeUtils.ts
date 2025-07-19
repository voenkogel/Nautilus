import type { TreeNode } from '../types/config';

/**
 * Extracts all node identifiers (IP or URL) from the tree that should be monitored for status.
 * Only includes nodes that have web GUIs enabled (hasWebGui !== false) and have an IP or URL.
 * This ensures consistent counting across server, status card, and other components.
 */
export const extractMonitoredNodeIdentifiers = (nodes: TreeNode[]): string[] => {
  const identifiers: string[] = [];
  
  const traverse = (nodeList: TreeNode[]) => {
    for (const node of nodeList) {
      // Only include nodes that have web GUIs enabled (hasWebGui !== false)
      // If hasWebGui is undefined, default to true for backward compatibility
      const shouldMonitor = node.hasWebGui !== false;
      
      if (shouldMonitor) {
        // Use IP if available, otherwise use URL
        const identifier = node.ip || node.url;
        if (identifier) {
          identifiers.push(identifier);
        }
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
