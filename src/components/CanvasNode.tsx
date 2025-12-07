import React, { useState } from 'react';
import type { PositionedNode } from '../utils/layoutUtils';
import type { NodeStatus } from '../hooks/useNodeStatus';
import NodeCard from './NodeCard';
import { getIconSvg } from '../utils/iconUtils';

interface CanvasNodeProps {
  node: PositionedNode;
  status?: NodeStatus;
  scale: number;
  isSelected?: boolean;
  onNodeClick: (node: PositionedNode) => void;
  onEditClick: (node: PositionedNode) => void;
  onAddChildClick: (node: PositionedNode) => void;
}

const CanvasNode: React.FC<CanvasNodeProps> = ({
  node,
  status,
  isSelected,
  onNodeClick,
  onEditClick,
  onAddChildClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditHovered, setIsEditHovered] = useState(false);
  const [isAddHovered, setIsAddHovered] = useState(false);

  // Calculate dynamic styles based on scale if needed, 
  // but usually CSS transform on the container handles scale.
  // Here we just position it.
  
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsEditHovered(false);
    setIsAddHovered(false);
  };

  return (
    <div
      className="absolute"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        // We don't apply scale here, the parent container is scaled
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* The Node Card */}
      <div className="relative w-full h-full">
        <NodeCard
          node={node}
          status={status}
          onClick={() => onNodeClick(node)}
          className={`w-full h-full transition-shadow duration-200 ${
            isSelected ? 'ring-2 ring-blue-500 shadow-xl' : 'hover:shadow-xl'
          }`}
          style={{
            // Ensure the card fills the container
            width: '100%',
            height: '100%',
          }}
        />

        {/* Edit Overlay (Pencil) - Only on hover */}
        {isHovered && (
          <div 
            className="absolute top-0 left-0 z-20 cursor-pointer"
            style={{
              // Position over the icon circle
              // NodeCard has padding 12px (p-3), circle is 48px (w-12)
              // We need to match that position
              left: '12px',
              top: '50%',
              marginTop: '-24px', // Half of height
              width: '48px',
              height: '48px',
              borderRadius: '9999px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEditClick(node);
            }}
            onMouseEnter={() => setIsEditHovered(true)}
            onMouseLeave={() => setIsEditHovered(false)}
          >
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/60 rounded-full" />
            
            {/* Pencil Icon */}
            <div 
              className={`absolute inset-0 flex items-center justify-center transition-transform duration-200 ${
                isEditHovered ? 'scale-110' : 'scale-100'
              }`}
            >
              <div 
                className="w-6 h-6 text-white"
                dangerouslySetInnerHTML={{ __html: getIconSvg('pencil', '#ffffff') }}
              />
            </div>
            
            {/* Hover Ring */}
            {isEditHovered && (
              <div className="absolute inset-0 border-2 border-blue-500 rounded-full" />
            )}
          </div>
        )}

        {/* Add Child Button - Bottom Edge */}
        {isHovered && (
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
              className={`w-full h-full rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center transition-colors ${
                isAddHovered ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div 
                className="w-4 h-4"
                dangerouslySetInnerHTML={{ 
                  __html: getIconSvg('plus', isAddHovered ? '#3b82f6' : '#6b7280') 
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasNode;
