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
  // Set when the parent's children are laid out as a wrapped multi-row leaf block.
  // The router uses a vertical trunk + per-row sub-bus instead of the single shared bus.
  isWrapped?: boolean;
  wrapTrunkX?: number; // Absolute x of the block-center trunk
  isRowFirst?: boolean; // First column in its row (round outer corner)
  isRowLast?: boolean; // Last column in its row (round outer corner)
}

// Node dimensions and spacing
export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 90;
export const SIBLING_SPACING = 20;
export const GROUP_SPACING = 40;
export const VERTICAL_SPACING = 40;
export const HORIZONTAL_SPACING = 20; // Used in collision detection

// Leaf-fan wrapping: many leaf children are packed into a compact multi-row grid
export const WRAP_MIN_COUNT = 6; // only wrap fans of >= this many leaf children
export const WRAP_MAX_COLS = 4; // cap columns in a wrapped block
export const WRAP_ROW_SPACING = 24; // vertical gap between wrapped rows

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
  isWrapBlock?: boolean; // children are laid out as a wrapped multi-row leaf grid
  wrapCols?: number; // column count of the wrapped block
}

export interface LayoutOptions {
  disableWrap?: boolean; // when true, never wrap leaf fans (single-row layout)
}

export const calculateTreeLayout = (rootNodes: TreeNode[], opts: LayoutOptions = {}): { nodes: PositionedNode[], connections: Connection[] } => {
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
      // A collapsed node has no visible children but still renders a
      // "N hidden nodes" pill one row below it (same width, centered like the
      // node). Reserve that row in the profiles so sibling subtrees lay out
      // clear of the pill instead of overlapping it.
      if (node.hasHiddenChildren) {
        myLeftProfile.set(depth + 1, 0);
        myRightProfile.set(depth + 1, NODE_WIDTH);
      }
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

    // Leaf-fan wrapping: a large set of all-leaf children is packed into a
    // compact multi-row grid instead of one very wide row.
    // A collapsed node carries a pill one row below it, so it is not a pure
    // leaf — exclude it so it never gets packed into a tight wrapped grid
    // (which would drop the pill onto the row beneath).
    const isLeafFan = !opts.disableWrap
      && children.length >= WRAP_MIN_COUNT
      && children.every(c => c.children.length === 0 && !c.node.hasHiddenChildren);

    if (isLeafFan) {
      const n = children.length;
      // Only ever wrap to an EVEN number of columns. With even columns the block
      // center falls in a gutter between columns, so the connector trunk runs
      // straight down the middle without crossing any card. (WRAP_MAX_COLS is even.)
      const target = Math.ceil(Math.sqrt(n));
      const cols = Math.min(WRAP_MAX_COLS, Math.max(2, target + (target % 2)));
      const rows = Math.ceil(n / cols);
      const COL_STRIDE = NODE_WIDTH + SIBLING_SPACING;
      const ROW_STRIDE = NODE_HEIGHT + WRAP_ROW_SPACING;
      const baseRowY = (depth + 1) * (NODE_HEIGHT + VERTICAL_SPACING);

      const blockWidth = cols * NODE_WIDTH + (cols - 1) * SIBLING_SPACING;
      const shift = NODE_WIDTH / 2 - blockWidth / 2;

      children.forEach((child, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        child.x = shift + col * COL_STRIDE;
        child.y = baseRowY + row * ROW_STRIDE; // override depth-based y (leaves have no descendants)
      });

      // Register the block's full footprint into the parent profiles so sibling
      // subtrees clear the whole block (behaves like a rows-deep, blockWidth-wide subtree).
      const left = shift;
      const right = shift + blockWidth;
      for (let rk = 0; rk < rows; rk++) {
        const d = depth + 1 + rk;
        if (!myLeftProfile.has(d) || left < myLeftProfile.get(d)!) myLeftProfile.set(d, left);
        if (!myRightProfile.has(d) || right > myRightProfile.get(d)!) myRightProfile.set(d, right);
      }

      return {
        node,
        x: 0, // Will be set by parent context
        y: depth * (NODE_HEIGHT + VERTICAL_SPACING),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        children,
        leftProfile: myLeftProfile,
        rightProfile: myRightProfile,
        isWrapBlock: true,
        wrapCols: cols
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

    const cols = pNode.wrapCols ?? 1;
    // The block is centered under the parent and always has an even column count,
    // so the block center sits in a gutter between columns — the trunk runs down
    // the middle without crossing any card.
    const wrapTrunkX = pNode.isWrapBlock ? newNode.x + NODE_WIDTH / 2 : undefined;

    pNode.children.forEach((child, index) => {
      const childNode = flattenTree(child, absoluteX);

      if (pNode.isWrapBlock) {
        const col = index % cols;
        connections.push({
          from: newNode,
          to: childNode,
          isFirstChild: index === 0,
          isLastChild: index === pNode.children.length - 1,
          isWrapped: true,
          wrapTrunkX,
          isRowFirst: col === 0,
          isRowLast: col === cols - 1 || index === pNode.children.length - 1
        });
      } else {
        connections.push({
          from: newNode,
          to: childNode,
          isFirstChild: index === 0,
          isLastChild: index === pNode.children.length - 1
        });
      }
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
