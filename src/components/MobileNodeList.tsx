import React, { useCallback } from 'react';
import type { TreeNode } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';
import NodeCard from './NodeCard';
import type { AppConfig } from '../types/config';
import { getNodeTargetUrl } from '../utils/nodeUtils';

interface MobileNodeListProps {
  nodes: TreeNode[];
  statuses: Record<string, NodeStatus>;
  onNodeClick: (node: TreeNode) => void;
  isEditMode?: boolean;
  accentColor?: string;
  appConfig?: AppConfig;
  statusCard?: React.ReactNode;
}

const MobileNodeList: React.FC<MobileNodeListProps> = ({ 
  nodes, 
  statuses, 
  onNodeClick,
  isEditMode = false,
  accentColor = '#3b82f6',
  appConfig,
  statusCard
}) => {
  // Render a node and its children recursively
  const renderNode = useCallback((node: TreeNode, level: number = 0, isLastChild: boolean = true, parentPath: boolean[] = [], childIndex: number = 0) => {
    const { id, children } = node;
    
    // Get status for this node using the same identifier logic as desktop
    let nodeIdentifier = node.internalAddress;
    if (!nodeIdentifier && node.healthCheckPort && node.ip) {
      nodeIdentifier = `${node.ip}:${node.healthCheckPort}`;
    }
    if (!nodeIdentifier) {
      nodeIdentifier = node.ip || node.url || node.externalAddress;
    }

    const status = nodeIdentifier ? statuses[nodeIdentifier] : undefined;
    
    // Calculate connection line offset
    const connectionOffset = 16; // Base indentation per level
    
    // Determine if this is first or last child (for rounded corners)
    const isFirstChild = childIndex === 0;
    const isFirstOrLastChild = isFirstChild || isLastChild;

    return (
      <div key={id} className="relative">
        {/* Connection lines for tree structure */}
        {level > 0 && (
          <div className="absolute left-0 top-0 h-full pointer-events-none z-0">
            {/* Render vertical lines for each parent level using simple divs */}
            {parentPath.map((hasMoreSiblings, index) => (
              hasMoreSiblings && (
                <div
                  key={index}
                  className="absolute bg-gray-500"
                  style={{
                    left: `${(index + 1) * connectionOffset - 8}px`,
                    top: 0,
                    width: '3px',
                    height: '100%'
                  }}
                />
              )
            ))}
            
            {/* Connection for this node using SVG for proper rounded corners */}
            <svg
              className="absolute"
              style={{
                left: `${level * connectionOffset - 10}px`,
                top: '-56px', // Start above the card
                width: `${connectionOffset + 20}px`,
                height: '144px', // Cover the connection area plus some buffer
                overflow: 'visible'
              }}
            >
              {/* Define the path based on whether this should have rounded corners */}
              <g stroke="#6b7280" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {isFirstOrLastChild ? (
                  // Rounded corner path for first/last children
                  <>
                    {/* Vertical line from top */}
                    <line x1="3" y1="0" x2="3" y2="92" />
                    
                    {/* Rounded corner using path */}
                    <path d="M 3 92 Q 3 100 11 100" />
                    
                    {/* Horizontal line to card */}
                    <line x1="11" y1="100" x2={connectionOffset + 8} y2="100" />
                    
                    {/* Continuation down if not last child */}
                    {!isLastChild && <line x1="3" y1="100" x2="3" y2="144" />}
                  </>
                ) : (
                  // Sharp corner path for middle children (T-junctions)
                  <>
                    {/* Vertical line from top */}
                    <line x1="3" y1="0" x2="3" y2="100" />
                    
                    {/* Horizontal line to card */}
                    <line x1="3" y1="100" x2={connectionOffset + 8} y2="100" />
                    
                    {/* Continuation down if not last child */}
                    {!isLastChild && <line x1="3" y1="100" x2="3" y2="144" />}
                  </>
                )}
              </g>
            </svg>
          </div>
        )}
        
        <NodeCard 
          node={node}
          status={status}
          onClick={onNodeClick}
          isEditMode={isEditMode}
          isInteractable={!!getNodeTargetUrl(node)}
          className="z-10"
          style={{ 
            marginLeft: `${level * connectionOffset}px`,
            marginBottom: '12px',
            height: '88px',
            ...(isEditMode ? {
              boxShadow: `0 0 0 2px ${accentColor}80`,
            } : {})
          }}
        />
        
        {/* Render children recursively */}
        {children && children.length > 0 && (
          <div>
            {children.map((child, index) => {
              const isLastChild = index === children.length - 1;
              const newParentPath = [...parentPath, !isLastChild];
              return renderNode(child, level + 1, isLastChild, newParentPath, index);
            })}
          </div>
        )}
      </div>
    );
  }, [statuses, onNodeClick]);

  return (
    <div className="overflow-y-auto max-h-full bg-transparent">
      {/* Status Card at the top if provided - edge to edge */}
      {statusCard && (
        <div>
          {statusCard}
        </div>
      )}
      
      <div className="px-4 py-4">
        {nodes.map((node, index) => {
          const isLastChild = index === nodes.length - 1;
          return renderNode(node, 0, isLastChild, [], index);
        })}
        
        {/* Logo at the bottom */}
        {(appConfig?.appearance?.logo || appConfig?.appearance?.favicon) && (
          <div className="flex justify-center items-center py-6 mt-4">
            <img 
              src={appConfig.appearance.logo || appConfig.appearance.favicon} 
              alt={appConfig.general?.title || 'Logo'} 
              className="max-h-12 max-w-24 opacity-80 filter drop-shadow-lg object-contain"
              onError={(e) => {
              // Fallback to a default icon if logo/favicon fails
              console.warn('Logo failed to load, trying fallback');
              e.currentTarget.src = '/nautilusIcon.png';
            }}
          />
        </div>
      )}
      
      {/* Fallback logo if no logo or favicon is configured */}
      {!appConfig?.appearance?.logo && !appConfig?.appearance?.favicon && (
        <div className="flex justify-center items-center py-6 mt-4">
          <img 
            src="/nautilusIcon.png" 
            alt="Nautilus" 
            className="w-12 h-12 opacity-80 filter drop-shadow-lg"
            onError={(e) => {
              // Hide if fallback also fails
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
      </div>
    </div>
  );
};

export default MobileNodeList;