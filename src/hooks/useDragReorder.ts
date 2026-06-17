import { useState, useCallback, useRef, useEffect } from 'react';
import type { TreeNode } from '../types/config';
import {
  type PositionedNode,
  NODE_HEIGHT
} from '../utils/layoutUtils';
import { findNodeById } from '../utils/nodeUtils';

export interface DragState {
  isDragging: boolean;
  draggedNode: PositionedNode | null;
  draggedNodeWithChildren: TreeNode | null; // Full node with children for moving
  dragStartPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  dropTarget: DropTarget | null;
}

export interface DropTarget {
  type: 'between-siblings' | 'as-child' | 'as-root';
  parentId: string | null; // null for root level
  insertIndex: number; // Index to insert at within parent's children
  targetNodeId?: string; // The node we're dropping near (for visual feedback)
  position?: 'before' | 'after'; // Whether dropping before or after the target
}

export interface DropZone {
  id: string;
  type: 'between-siblings' | 'as-child' | 'as-root';
  parentId: string | null;
  insertIndex: number;
  targetNodeId?: string;
  position?: 'before' | 'after';
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseDragReorderProps {
  nodes: PositionedNode[];
  rootNodes: TreeNode[];
  isEditMode: boolean;
  onReorder: (nodeId: string, newParentId: string | null, insertIndex: number) => Promise<void>;
}

// Helper to check if a node is a descendant of another node
const isDescendantOf = (nodeId: string, potentialAncestorId: string, rootNodes: TreeNode[]): boolean => {
  const ancestor = findNodeById(rootNodes, potentialAncestorId);
  if (!ancestor || !ancestor.children) return false;
  
  const checkChildren = (children: TreeNode[]): boolean => {
    for (const child of children) {
      if (child.id === nodeId) return true;
      if (child.children && checkChildren(child.children)) return true;
    }
    return false;
  };
  
  return checkChildren(ancestor.children);
};

export const useDragReorder = ({ nodes, rootNodes, isEditMode, onReorder }: UseDragReorderProps) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedNode: null,
    draggedNodeWithChildren: null,
    dragStartPos: { x: 0, y: 0 },
    currentPos: { x: 0, y: 0 },
    dropTarget: null,
  });

  const [dropZones, setDropZones] = useState<DropZone[]>([]);
  const [animatingNodes, setAnimatingNodes] = useState<Set<string>>(new Set());
  
  const dragTimeoutRef = useRef<number | null>(null);

  // Calculate drop zones based on current node positions
  const calculateDropZones = useCallback((draggedNodeId: string) => {
    if (!isEditMode) return [];

    const zones: DropZone[] = [];
    const ZONE_HEIGHT = 30;
    const ZONE_PADDING = 5;

    // Create drop zones for each positioned node
    nodes.forEach((node) => {
      // Don't create zones for the dragged node or its descendants
      if (node.id === draggedNodeId || isDescendantOf(node.id, draggedNodeId, rootNodes)) {
        return;
      }

      // Horizontal placement is fully automatic, so the only manual gestures are
      // functional: drop a node UNDER another node (reparent / regroup / change depth)
      // or drop it as a new root. Sibling order is derived, not hand-adjustable.
      const originalNode = findNodeById(rootNodes, node.id);
      const childCount = originalNode?.children?.length ?? 0;

      // Zone BELOW the node for adding as a child (works for any node, including
      // parents that already have children — appends to the end of their children).
      zones.push({
        id: `child-${node.id}`,
        type: 'as-child',
        parentId: node.id,
        insertIndex: childCount,
        targetNodeId: node.id,
        x: node.x,
        y: node.y + node.height + ZONE_PADDING,
        width: node.width,
        height: ZONE_HEIGHT,
      });
    });

    // Add zone for adding as new root (at the end)
    if (nodes.length > 0) {
      const rightMostNode = nodes.reduce((rightMost, node) => {
        return node.x + node.width > rightMost.x + rightMost.width ? node : rightMost;
      }, nodes[0]);

      zones.push({
        id: 'new-root',
        type: 'as-root',
        parentId: null,
        insertIndex: rootNodes.length,
        x: rightMostNode.x + rightMostNode.width + 40,
        y: rightMostNode.y,
        width: 200,
        height: NODE_HEIGHT,
      });
    }

    return zones;
  }, [nodes, rootNodes, isEditMode]);

  // Start dragging a node
  const startDrag = useCallback((node: PositionedNode, clientX: number, clientY: number) => {
    if (!isEditMode) return;

    // Find the full node with children
    const fullNode = findNodeById(rootNodes, node.id);
    if (!fullNode) return;

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    const zones = calculateDropZones(node.id);
    setDropZones(zones);

    setDragState({
      isDragging: true,
      draggedNode: node,
      draggedNodeWithChildren: fullNode,
      dragStartPos: { x: clientX, y: clientY },
      currentPos: { x: clientX, y: clientY },
      dropTarget: null,
    });
  }, [isEditMode, rootNodes, calculateDropZones]);

  // Update drag position
  const updateDrag = useCallback((clientX: number, clientY: number, canvasTransform: { x: number; y: number; scale: number }) => {
    if (!dragState.isDragging || !dragState.draggedNode) return;

    // Convert screen coordinates to canvas coordinates
    const canvasX = (clientX - canvasTransform.x) / canvasTransform.scale;
    const canvasY = (clientY - canvasTransform.y) / canvasTransform.scale;

    // Find the closest drop zone that the cursor is actually near
    let closestZone: DropZone | null = null;
    let closestDistance = Infinity;

    // Vertical tolerance - cursor must be within this range of the zone's vertical layer
    const VERTICAL_TOLERANCE = 60;

    dropZones.forEach(zone => {
      // First, check if cursor is within the vertical layer of this zone
      // This prevents selecting drop zones on different tree levels
      const zoneTop = zone.y - VERTICAL_TOLERANCE;
      const zoneBottom = zone.y + zone.height + VERTICAL_TOLERANCE;
      
      if (canvasY < zoneTop || canvasY > zoneBottom) {
        // Cursor is not in this vertical layer - skip this zone entirely
        return;
      }
      
      // For zones in the correct vertical layer, use horizontal distance primarily
      const zoneCenterX = zone.x + zone.width / 2;
      const horizontalDistance = Math.abs(canvasX - zoneCenterX);

      // Check if within reasonable horizontal range (100px threshold)
      if (horizontalDistance < 100 && horizontalDistance < closestDistance) {
        closestDistance = horizontalDistance;
        closestZone = zone;
      }
    });

    const newDropTarget: DropTarget | null = closestZone !== null ? {
      type: (closestZone as DropZone).type,
      parentId: (closestZone as DropZone).parentId,
      insertIndex: (closestZone as DropZone).insertIndex,
      targetNodeId: (closestZone as DropZone).targetNodeId,
      position: (closestZone as DropZone).position,
    } : null;

    setDragState(prev => ({
      ...prev,
      currentPos: { x: clientX, y: clientY },
      dropTarget: newDropTarget,
    }));

    // Animate nodes making space
    if (newDropTarget?.targetNodeId) {
      setAnimatingNodes(new Set([newDropTarget.targetNodeId]));
    } else {
      setAnimatingNodes(new Set());
    }
  }, [dragState.isDragging, dragState.draggedNode, dropZones]);

  // End dragging
  const endDrag = useCallback(async () => {
    // Re-enable text selection (always, in case drag started)
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    
    if (!dragState.isDragging || !dragState.draggedNode) {
      setDragState({
        isDragging: false,
        draggedNode: null,
        draggedNodeWithChildren: null,
        dragStartPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        dropTarget: null,
      });
      setDropZones([]);
      setAnimatingNodes(new Set());
      return;
    }

    const { dropTarget, draggedNode } = dragState;

    if (dropTarget) {
      // Helper to get the current position of the dragged node
      const getCurrentPosition = (nodeId: string): { parentId: string | null, index: number } | null => {
        // Check root level
        const rootIndex = rootNodes.findIndex(n => n.id === nodeId);
        if (rootIndex !== -1) {
          return { parentId: null, index: rootIndex };
        }
        
        // Check nested levels
        const findInParent = (treeNodes: TreeNode[]): { parentId: string | null, index: number } | null => {
          for (const node of treeNodes) {
            if (node.children) {
              const childIndex = node.children.findIndex(c => c.id === nodeId);
              if (childIndex !== -1) {
                return { parentId: node.id, index: childIndex };
              }
              const found = findInParent(node.children);
              if (found) return found;
            }
          }
          return null;
        };
        
        return findInParent(rootNodes);
      };
      
      const currentPos = getCurrentPosition(draggedNode.id);
      
      // Check if we're dropping in the same position (no change needed)
      const isSamePosition = currentPos && 
        currentPos.parentId === dropTarget.parentId && 
        (currentPos.index === dropTarget.insertIndex || 
         currentPos.index === dropTarget.insertIndex - 1); // "after" previous sibling = same position
      
      if (!isSamePosition) {
        // Perform the reorder only if position actually changes
        await onReorder(draggedNode.id, dropTarget.parentId, dropTarget.insertIndex);
      }
    }

    // Reset state
    setDragState({
      isDragging: false,
      draggedNode: null,
      draggedNodeWithChildren: null,
      dragStartPos: { x: 0, y: 0 },
      currentPos: { x: 0, y: 0 },
      dropTarget: null,
    });
    setDropZones([]);
    
    // Clear animating nodes after a short delay
    setTimeout(() => {
      setAnimatingNodes(new Set());
    }, 300);
  }, [dragState, onReorder]);

  // Cancel drag
  const cancelDrag = useCallback(() => {
    // Re-enable text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    
    setDragState({
      isDragging: false,
      draggedNode: null,
      draggedNodeWithChildren: null,
      dragStartPos: { x: 0, y: 0 },
      currentPos: { x: 0, y: 0 },
      dropTarget: null,
    });
    setDropZones([]);
    setAnimatingNodes(new Set());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Count children for drag preview
  const getChildCount = useCallback((node: TreeNode): number => {
    if (!node.children) return 0;
    return node.children.reduce((count, child) => count + 1 + getChildCount(child), 0);
  }, []);

  return {
    dragState,
    dropZones,
    animatingNodes,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    getChildCount,
  };
};
