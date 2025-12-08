import React from 'react';
import type { DragState } from '../hooks/useDragReorder';
import type { PositionedNode } from '../utils/layoutUtils';
import type { AppConfig } from '../types/config';
import { 
  NODE_WIDTH, 
  NODE_HEIGHT, 
  VERTICAL_SPACING, 
  SIBLING_SPACING 
} from '../utils/layoutUtils';

interface DragGhostProps {
  dragState: DragState;
  nodes: PositionedNode[];
  config: AppConfig;
}

const DragGhost: React.FC<DragGhostProps> = ({ dragState, nodes, config }) => {
  if (!dragState.isDragging || !dragState.dropTarget || !dragState.draggedNode) {
    return null;
  }

  const dropTarget = dragState.dropTarget;
  const accentColor = config.appearance?.accentColor || '#3b82f6';
  const draggedNode = dragState.draggedNode;
  
  // Find the parent node for the drop target
  const parentId = dropTarget.parentId;
  const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
  
  // Find the target node (the node we're dropping near)
  const targetNode = dropTarget.targetNodeId 
    ? nodes.find(n => n.id === dropTarget.targetNodeId) 
    : null;
  
  // Calculate accurate ghost position
  let ghostX: number;
  let ghostY: number;
  
  if (dropTarget.type === 'as-child' && targetNode) {
    // Dropping as first child of target node - position below
    ghostX = targetNode.x; // Same X as would-be parent
    ghostY = targetNode.y + NODE_HEIGHT + VERTICAL_SPACING;
  } else if (dropTarget.type === 'as-root') {
    // Dropping as new root - find rightmost root node
    const rootLevelNodes = nodes.filter(n => {
      // A node is at root level if it's a direct child of the tree
      return config.tree.nodes.some(root => root.id === n.id);
    });
    if (rootLevelNodes.length > 0) {
      const rightMost = rootLevelNodes.reduce((prev, curr) => 
        curr.x + curr.width > prev.x + prev.width ? curr : prev
      );
      ghostX = rightMost.x + rightMost.width + 60;
      ghostY = rightMost.y;
    } else {
      ghostX = 0;
      ghostY = 0;
    }
  } else if (targetNode) {
    // Dropping before or after a sibling - siblings are HORIZONTAL
    ghostY = targetNode.y; // Same Y position as sibling (same level)
    
    if (dropTarget.position === 'before') {
      // 'before' = to the LEFT of the target node
      // Ghost takes position to the left, target shifts right
      ghostX = targetNode.x;
    } else {
      // 'after' = to the RIGHT of the target node
      ghostX = targetNode.x + NODE_WIDTH + SIBLING_SPACING;
    }
  } else {
    return null;
  }
  
  // Calculate connection line to parent
  const renderConnection = () => {
    if (!parentNode) return null;
    
    const startX = parentNode.x + NODE_WIDTH / 2;
    const startY = parentNode.y + NODE_HEIGHT;
    const endX = ghostX + NODE_WIDTH / 2;
    const endY = ghostY;
    const midY = startY + (endY - startY) / 2;
    const cornerRadius = 12;
    
    let d = `M ${startX} ${startY}`;
    
    if (startX === endX) {
      d += ` L ${endX} ${endY}`;
    } else {
      const isMovingRight = endX > startX;
      d += ` L ${startX} ${midY - cornerRadius}`;
      d += ` Q ${startX} ${midY} ${startX + (isMovingRight ? cornerRadius : -cornerRadius)} ${midY}`;
      d += ` L ${endX + (isMovingRight ? -cornerRadius : cornerRadius)} ${midY}`;
      d += ` Q ${endX} ${midY} ${endX} ${midY + cornerRadius}`;
      d += ` L ${endX} ${endY}`;
    }
    
    return (
      <path
        d={d}
        fill="none"
        stroke={accentColor}
        strokeWidth={3}
        strokeDasharray="8 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
    );
  };
  
  return (
    <>
      {/* Dashed connection line to parent */}
      <svg
        className="absolute top-0 left-0 overflow-visible pointer-events-none"
        style={{ width: 1, height: 1, zIndex: 999 }}
      >
        {renderConnection()}
      </svg>
      
      {/* Ghost node placeholder */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: ghostX,
          top: ghostY,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          zIndex: 1000,
          animation: 'fade-in 0.15s ease-out'
        }}
      >
        {/* Dashed outline ghost */}
        <div 
          className="w-full h-full rounded-xl"
          style={{
            border: `3px dashed ${accentColor}`,
            backgroundColor: `${accentColor}15`,
            boxShadow: `0 0 20px ${accentColor}30`
          }}
        >
          {/* Ghost content preview */}
          <div className="p-3 h-full flex flex-col justify-center opacity-60">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-600 truncate">
                {draggedNode.title}
              </span>
            </div>
            {draggedNode.subtitle && (
              <div className="text-sm text-gray-400 truncate">
                {draggedNode.subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DragGhost;
