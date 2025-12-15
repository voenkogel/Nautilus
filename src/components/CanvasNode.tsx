import React, { useState, useRef } from 'react';
import type { PositionedNode } from '../utils/layoutUtils';
import type { NodeStatus } from '../hooks/useNodeStatus';
import NodeCard from './NodeCard';
import { getNodeTargetUrl } from '../utils/nodeUtils';

interface CanvasNodeProps {
  node: PositionedNode;
  status?: NodeStatus;
  scale: number;
  isSelected?: boolean;
  isEditMode?: boolean;
  isNewlyAdded?: boolean;
  isExpanding?: boolean;
  isDeleting?: boolean;
  isDragging?: boolean;
  isDescendantOfDragged?: boolean;
  accentColor?: string;
  onNodeClick: (node: PositionedNode) => void;
  onEditClick: (node: PositionedNode) => void;
  onAddChildClick: (node: PositionedNode) => void;
  onDeleteClick?: (node: PositionedNode) => void;
  onDragStart?: (node: PositionedNode, clientX: number, clientY: number) => void;
}

const CanvasNode: React.FC<CanvasNodeProps> = ({
  node,
  status,
  isSelected,
  isEditMode = false,
  isNewlyAdded = false,
  isExpanding = false,
  isDeleting = false,
  isDragging = false,
  isDescendantOfDragged = false,
  accentColor = '#3b82f6',
  onNodeClick,
  onAddChildClick,
  onDeleteClick,
  onDragStart
}) => {
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const clickHandledRef = useRef(false);

  // Calculate dynamic styles based on scale if needed, 
  // but usually CSS transform on the container handles scale.
  // Here we just position it.

  // Show plus button: always in edit mode
  const showAddChildButton = isEditMode;
  
  // Determine if node is interactable (has a clickable URL)
  const isInteractable = !!getNodeTargetUrl(node);

  // Handle mouse down for drag (in edit mode) or click detection (in view mode)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return;
    
    // Don't start if clicking on buttons
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    
    // Record start position for drag/click threshold detection
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    clickHandledRef.current = false;
    
    if (isEditMode && onDragStart) {
      e.stopPropagation(); // Prevent canvas pan in edit mode
      
      // Add global mouse move and up handlers for edit mode drag
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;
        
        const dx = moveEvent.clientX - dragStartRef.current.x;
        const dy = moveEvent.clientY - dragStartRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only start drag if moved more than 8 pixels
        if (distance > 8 && !isDraggingRef.current) {
          isDraggingRef.current = true;
          clickHandledRef.current = true;
          onDragStart(node, dragStartRef.current.x, dragStartRef.current.y);
        }
      };
      
      const handleMouseUp = () => {
        if (!isDraggingRef.current && !clickHandledRef.current) {
          onNodeClick(node);
        }
        
        dragStartRef.current = null;
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      // View mode: track if mouse moved to prevent click during canvas pan
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;
        
        const dx = moveEvent.clientX - dragStartRef.current.x;
        const dy = moveEvent.clientY - dragStartRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If moved more than 5 pixels, mark as dragging (panning canvas)
        if (distance > 5) {
          isDraggingRef.current = true;
        }
      };
      
      const handleMouseUp = (upEvent: MouseEvent) => {
        // Only trigger click if we didn't move (not panning)
        if (!isDraggingRef.current) {
          // Check if mouseup is still over this node
          const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const nodeElement = (upEvent.target as HTMLElement)?.closest?.('[data-node-id]');
          if (element && nodeElement) {
            onNodeClick(node);
          }
        }
        
        dragStartRef.current = null;
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  // Determine animation class
  const getAnimationClass = () => {
    if (isDragging) return 'animate-drag-out';
    if (isDeleting) return 'animate-delete-out';
    if (isExpanding) return 'animate-expand-in';
    if (isNewlyAdded) return 'animate-pop-in';
    return '';
  };

  return (
    <div
      className={`absolute group ${getAnimationClass()}`}
      data-node-id={node.id}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        opacity: isDragging || isDescendantOfDragged ? 0.3 : 1,
        cursor: isEditMode ? 'grab' : (isInteractable ? 'pointer' : 'default'),
        // We don't apply scale here, the parent container is scaled
      }}
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => {
        setIsNodeHovered(false);
        setIsDeleteHovered(false);
      }}
      onMouseDown={handleMouseDown}
    >
      {/* The Node Card */}
      <div className="relative w-full h-full">
        <NodeCard
          node={node}
          status={status}
          onClick={() => {
            // All clicks are now handled by handleMouseDown to detect panning vs clicking
            // This is kept for keyboard accessibility
          }}
          isEditMode={isEditMode}
          isInteractable={isInteractable}
          accentColor={accentColor}
          className={`w-full h-full ${
            isSelected ? 'ring-2 ring-blue-500' : ''
          }`}
          style={{
            // Ensure the card fills the container
            width: '100%',
            height: '100%',
            ...(isEditMode ? {
              boxShadow: `0 0 0 2px ${accentColor}80`,
            } : {})
          }}
        />

        {/* Delete Button - Top Right (visible on hover in edit mode) */}
        {isEditMode && isNodeHovered && onDeleteClick && !isDragging && (
          <div
            data-no-drag
            className="absolute z-20 cursor-pointer flex items-center justify-center transition-all duration-150"
            style={{
              top: '-8px',
              right: '-8px',
              width: '24px',
              height: '24px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick(node);
            }}
            onMouseEnter={() => setIsDeleteHovered(true)}
            onMouseLeave={() => setIsDeleteHovered(false)}
          >
            <div 
              className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-150 ${
                isDeleteHovered ? 'bg-red-600 scale-110' : 'bg-red-500'
              }`}
              style={{
                boxShadow: isDeleteHovered ? '0 2px 8px rgba(239, 68, 68, 0.5)' : '0 1px 3px rgba(0,0,0,0.2)'
              }}
            >
              <svg 
                className="w-3.5 h-3.5 text-white"
                fill="none" 
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
          </div>
        )}

        {/* Add Child Button - Bottom Edge (visible in edit mode) */}
        {showAddChildButton && (
          <div
            data-no-drag
            className="absolute left-1/2 -translate-x-1/2 z-20 cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{
              bottom: '-12px', // Half sticking out
              width: '24px',
              height: '24px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAddChildClick(node);
            }}
            onMouseEnter={() => setIsAddHovered(true)}
            onMouseLeave={() => setIsAddHovered(false)}
          >
            <div 
              className="w-full h-full rounded-full shadow-sm flex items-center justify-center transition-all duration-150"
              style={{
                border: '1px solid #e5e7eb',
                backgroundColor: isAddHovered ? '#f0f9ff' : 'white'
              }}
            >
              <svg 
                className="w-3.5 h-3.5"
                fill="none" 
                stroke={isAddHovered ? accentColor : '#6b7280'}
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasNode;
