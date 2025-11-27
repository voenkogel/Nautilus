import type { TreeNode } from '../types/config';

export interface PositionedNode extends TreeNode {
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

export interface Connection {
  from: PositionedNode;
  to: PositionedNode;
  isFirstChild: boolean;
  isLastChild: boolean;
}

// Node dimensions and spacing
export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 90;
export const SIBLING_SPACING = 20;
export const GROUP_SPACING = 60;
export const VERTICAL_SPACING = 40;
export const HORIZONTAL_SPACING = 20; // Used in collision detection

// Type definitions for the layout algorithm
type Profile = Map<number, number>; // depth -> x value

interface ProcessedNode {
  node: TreeNode;
  x: number; // Relative to parent
  y: number;
  width: number;
  height: number;
  children: ProcessedNode[];
  leftProfile: Profile;
  rightProfile: Profile;
}

export const calculateTreeLayout = (rootNodes: TreeNode[]): { nodes: PositionedNode[], connections: Connection[] } => {
  const positionedNodes: PositionedNode[] = [];
  const connections: Connection[] = [];
  
  if (!rootNodes || rootNodes.length === 0) {
    return { nodes: [], connections: [] };
  }

  // Recursive function to calculate layout and profiles (Contour-based tree layout)
  const processNode = (node: TreeNode, depth: number): ProcessedNode => {
    const children = node.children?.map(c => processNode(c, depth + 1)) || [];
    
    let myLeftProfile: Profile = new Map();
    let myRightProfile: Profile = new Map();
    
    // Initialize profiles with current node
    myLeftProfile.set(depth, 0);
    myRightProfile.set(depth, NODE_WIDTH);
    
    if (children.length === 0) {
      return {
        node,
        x: 0,
        y: depth * (NODE_HEIGHT + VERTICAL_SPACING),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        children: [],
        leftProfile: myLeftProfile,
        rightProfile: myRightProfile
      };
    }
    
    // Arrange children
    let currentChildrenRightProfile: Profile = new Map();
    
    children.forEach((child, i) => {
      let xPos = 0;
      
      if (i > 0) {
        // Find minimum distance to previous children
        let maxOverlap = -Infinity;
        
        // Check for collisions at all depths
        for (const [d, minX] of child.leftProfile) {
          if (currentChildrenRightProfile.has(d)) {
            const rightEdge = currentChildrenRightProfile.get(d)!;
            
            // Use larger spacing for deeper levels (cousins/groups) to create visual separation
            // Immediate siblings (d === depth + 1) get tighter spacing
            // Deeper descendants (d > depth + 1) get wider spacing to separate the subtrees
            const spacing = d > depth + 1 ? GROUP_SPACING : SIBLING_SPACING;
            
            // We want childX + minX >= rightEdge + SPACING
            const required = rightEdge + spacing - minX;
            if (required > maxOverlap) {
              maxOverlap = required;
            }
          }
        }
        
        // If no overlap found (shouldn't happen for siblings as they share depth+1), default to 0
        xPos = maxOverlap === -Infinity ? 0 : maxOverlap;
      }
      
      child.x = xPos;
      
      // Update cumulative right profile
      for (const [d, maxX] of child.rightProfile) {
        const absoluteMaxX = xPos + maxX;
        currentChildrenRightProfile.set(d, absoluteMaxX);
      }
    });
    
    // Center parent over children
    const firstChild = children[0];
    const lastChild = children[children.length - 1];
    
    const firstChildCenter = firstChild.x + NODE_WIDTH / 2;
    const lastChildCenter = lastChild.x + NODE_WIDTH / 2;
    const centerOfChildren = (firstChildCenter + lastChildCenter) / 2;
    
    const shift = (NODE_WIDTH / 2) - centerOfChildren;
    
    // Shift children to center them under parent
    children.forEach(c => c.x += shift);
    
    // Merge children profiles into parent profiles
    children.forEach(c => {
      for (const [d, val] of c.leftProfile) {
        const absVal = c.x + val;
        if (!myLeftProfile.has(d) || absVal < myLeftProfile.get(d)!) {
          myLeftProfile.set(d, absVal);
        }
      }
      
      for (const [d, val] of c.rightProfile) {
        const absVal = c.x + val;
        if (!myRightProfile.has(d) || absVal > myRightProfile.get(d)!) {
          myRightProfile.set(d, absVal);
        }
      }
    });
    
    return {
      node,
      x: 0, // Will be set by parent context
      y: depth * (NODE_HEIGHT + VERTICAL_SPACING),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      children,
      leftProfile: myLeftProfile,
      rightProfile: myRightProfile
    };
  };

  // Flatten the processed tree into absolute coordinates
  const flattenTree = (pNode: ProcessedNode, xOffset: number): PositionedNode => {
    const absoluteX = xOffset + pNode.x;
    
    const newNode: PositionedNode = {
      ...pNode.node,
      x: absoluteX,
      y: pNode.y,
      width: pNode.width,
      height: pNode.height,
      level: 0 // Not strictly used
    };
    
    positionedNodes.push(newNode);
    
    pNode.children.forEach((child, index) => {
      const childNode = flattenTree(child, absoluteX);
      
      connections.push({
        from: newNode,
        to: childNode,
        isFirstChild: index === 0,
        isLastChild: index === pNode.children.length - 1
      });
    });
    
    return newNode;
  };

  // Handle multiple root nodes by creating a virtual root
  // Virtual root to hold all actual roots
  const virtualRoot: TreeNode = {
    id: 'virtual-root',
    title: 'Root',
    subtitle: '',
    children: rootNodes,
    type: 'square' // Default type
  };
  
  // Process starting from virtual root at depth -1
  // This places actual roots at depth 0
  const processedRoot = processNode(virtualRoot, -1);
  
  // Flatten children of virtual root (the actual roots)
  processedRoot.children.forEach(child => {
    flattenTree(child, 0);
  });
  
  return { nodes: positionedNodes, connections };
};
