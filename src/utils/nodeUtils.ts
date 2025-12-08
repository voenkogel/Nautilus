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

/**
 * Reorders a node within the tree structure.
 * Handles moving nodes between different parent levels.
 * @param nodes - The root nodes array
 * @param nodeId - The ID of the node to move
 * @param newParentId - The ID of the new parent (null for root level)
 * @param insertIndex - The index to insert at within the new parent's children
 * @returns The updated nodes array
 */
export const reorderNode = (
  nodes: TreeNode[],
  nodeId: string,
  newParentId: string | null,
  insertIndex: number
): TreeNode[] => {
  // Deep clone the nodes to avoid mutation
  const clonedNodes = JSON.parse(JSON.stringify(nodes)) as TreeNode[];
  
  // Find and remove the node from its current position
  let nodeToMove: TreeNode | null = null;
  
  const removeNode = (nodeList: TreeNode[]): TreeNode[] => {
    return nodeList.filter((node) => {
      if (node.id === nodeId) {
        nodeToMove = node;
        return false;
      }
      if (node.children) {
        node.children = removeNode(node.children);
      }
      return true;
    });
  };
  
  // First, remove the node from its current position
  const nodesAfterRemoval = removeNode(clonedNodes);
  
  if (!nodeToMove) {
    console.warn(`Node with ID ${nodeId} not found`);
    return nodes; // Return original if node not found
  }
  
  // Helper to find a node's parent and siblings info
  const findCurrentParentAndIndex = (nodeList: TreeNode[], targetId: string, parentId: string | null = null): { parentId: string | null, index: number } | null => {
    for (let i = 0; i < nodeList.length; i++) {
      if (nodeList[i].id === targetId) {
        return { parentId, index: i };
      }
      if (nodeList[i].children && nodeList[i].children!.length > 0) {
        const found = findCurrentParentAndIndex(nodeList[i].children!, targetId, nodeList[i].id);
        if (found) return found;
      }
    }
    return null;
  };
  
  // Check if we're moving within the same parent and adjust index if needed
  const currentPos = findCurrentParentAndIndex(nodes, nodeId);
  let adjustedInsertIndex = insertIndex;
  
  if (currentPos && currentPos.parentId === newParentId && currentPos.index < insertIndex) {
    // If moving within the same parent and the original position is before the insert position,
    // we need to decrement the insert index since removing the node shifts indices
    adjustedInsertIndex = Math.max(0, insertIndex - 1);
  }
  
  // Insert the node at the new position
  if (newParentId === null) {
    // Insert at root level
    nodesAfterRemoval.splice(adjustedInsertIndex, 0, nodeToMove);
    return nodesAfterRemoval;
  }
  
  // Find the new parent and insert
  const insertIntoParent = (nodeList: TreeNode[]): boolean => {
    for (const node of nodeList) {
      if (node.id === newParentId) {
        if (!node.children) {
          node.children = [];
        }
        node.children.splice(adjustedInsertIndex, 0, nodeToMove!);
        return true;
      }
      if (node.children && insertIntoParent(node.children)) {
        return true;
      }
    }
    return false;
  };
  
  if (!insertIntoParent(nodesAfterRemoval)) {
    console.warn(`Parent node with ID ${newParentId} not found`);
    // Fallback: insert at root level
    nodesAfterRemoval.splice(adjustedInsertIndex, 0, nodeToMove);
  }
  
  return nodesAfterRemoval;
};

/**
 * Finds a node by ID in the tree.
 */
export const findNodeById = (nodes: TreeNode[], nodeId: string): TreeNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Counts all descendants of a node (children, grandchildren, etc.)
 */
export const countDescendants = (node: TreeNode): number => {
  if (!node.children || node.children.length === 0) return 0;
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
};
