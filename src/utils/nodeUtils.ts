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
      // Only monitor nodes with internalAddress (or legacy ip+port) specified, AND not explicitly disabled
      const hasInternal = !!node.internalAddress;
      const hasLegacy = !!(node.healthCheckPort && node.ip);

      if ((hasInternal || hasLegacy) && !node.disableHealthCheck) {
        let identifier = node.internalAddress;
        // Fallback to legacy format if internalAddress is not set
        if (!identifier && hasLegacy) {
          identifier = `${node.ip}:${node.healthCheckPort}`;
        }
        
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

/**
 * Returns a tree structure with children of collapsed nodes removed.
 * Used for layout calculations.
 */
export const getVisibleTree = (nodes: TreeNode[], collapsedIds: Set<string>): TreeNode[] => {
  return nodes.map(node => {
    // Create a shallow copy
    const newNode = { ...node };
    
    if (collapsedIds.has(node.id)) {
      // If collapsed, remove children for layout purposes
      newNode.children = [];
    } else if (node.children) {
      // If not collapsed, recursively process children
      newNode.children = getVisibleTree(node.children, collapsedIds);
    }
    
    return newNode;
  });
};
