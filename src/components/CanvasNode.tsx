import React, { useState } from 'react';
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
  accentColor?: string;
  onNodeClick: (node: PositionedNode) => void;
  onEditClick: (node: PositionedNode) => void;
  onAddChildClick: (node: PositionedNode) => void;
  onDeleteClick?: (node: PositionedNode) => void;
}

const CanvasNode: React.FC<CanvasNodeProps> = ({
  node,
  status,
  isSelected,
  isEditMode = false,
  isNewlyAdded = false,
  isExpanding = false,
  isDeleting = false,
  accentColor = '#3b82f6',
  onNodeClick,
  onAddChildClick,
  onDeleteClick
}) => {
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);

  // Calculate dynamic styles based on scale if needed, 
  // but usually CSS transform on the container handles scale.
  // Here we just position it.

  // Show plus button: always in edit mode
  const showAddChildButton = isEditMode;
  
  // Determine if node is interactable (has a clickable URL)
  const isInteractable = !!getNodeTargetUrl(node);

  // Determine animation class
  const getAnimationClass = () => {
    if (isDeleting) return 'animate-delete-out';
    if (isExpanding) return 'animate-expand-in';
    if (isNewlyAdded) return 'animate-pop-in';
    return '';
  };

  return (
    <div
      className={`absolute group ${getAnimationClass()}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        // We don't apply scale here, the parent container is scaled
      }}
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => {
        setIsNodeHovered(false);
        setIsDeleteHovered(false);
      }}
    >
      {/* The Node Card */}
      <div className="relative w-full h-full">
        <NodeCard
          node={node}
          status={status}
          onClick={() => onNodeClick(node)}
          isEditMode={isEditMode}
          isInteractable={isInteractable}
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
        {isEditMode && isNodeHovered && onDeleteClick && (
          <div
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
            className="absolute left-1/2 -translate-x-1/2 z-20 cursor-pointer flex items-center justify-center transition-all duration-200"
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
                border: `1px solid ${isAddHovered ? accentColor : '#e5e7eb'}`,
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
