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

/**
 * Determines the display text for a node's address/network details.
 * Only returns external addresses (externalAddress or legacy url field).
 * Internal addresses are never shown on the canvas.
 */
export const getNodeAddressDisplay = (node: TreeNode): string | null => {
  // Only show external address (externalAddress or legacy url), never internal addresses
  return node.externalAddress || node.url || null;
};

/**
 * Determines the target URL for a node when clicked.
 * Returns null if the node is not interactable or has no valid URL.
 */
export const getNodeTargetUrl = (node: TreeNode): string | null => {
  // Check if node is interactable
  if (node.isInteractable === false) {
    return null;
  }

  let targetUrl = null;
  
  // Check for explicit externalAddress or URL first
  const externalUrl = node.externalAddress || node.url;
  if (externalUrl) {
    targetUrl = externalUrl.includes('://') ? externalUrl : `https://${externalUrl}`;
  }
  // For nodes with internalAddress, try to use it
  else if (node.internalAddress) {
    if (node.internalAddress.includes('://')) {
      targetUrl = node.internalAddress;
    } else {
      // Try to guess protocol based on port if present
      const match = node.internalAddress.match(/:(\d+)$/);
      if (match) {
        const port = parseInt(match[1]);
        const commonHttpPorts = [80, 8080, 8989, 7878, 8686, 6767, 5076, 9117];
        const protocol = commonHttpPorts.includes(port) ? 'http' : 'https';
        targetUrl = `${protocol}://${node.internalAddress}`;
      } else {
        targetUrl = `https://${node.internalAddress}`;
      }
    }
  }
  // Legacy fallback: For nodes with healthCheckPort and an IP, create URL from IP:port
  else if (node.healthCheckPort && node.ip) {
    // Try HTTPS first, fallback will be handled by the browser
    targetUrl = `https://${node.ip}:${node.healthCheckPort}`;
  }
  
  return targetUrl;
};
