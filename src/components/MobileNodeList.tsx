import React, { useCallback } from 'react';
import type { TreeNode } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';
import NodeCard from './NodeCard';
import type { AppConfig } from '../types/config';
import { getNodeTargetUrl, normalizeNodeIdentifier } from '../utils/nodeUtils';

type NodeFilter = 'online' | 'offline' | 'activity';

interface MobileNodeListProps {
  nodes: TreeNode[];
  statuses: Record<string, NodeStatus>;
  onNodeClick: (node: TreeNode) => void;
  isEditMode?: boolean;
  accentColor?: string;
  appConfig?: AppConfig;
  statusCard?: React.ReactNode;
  activeFilter?: NodeFilter | null;
  filteredNodes?: TreeNode[] | null;
  onFilterChange?: (filter: NodeFilter | null) => void;
}

const MobileNodeList: React.FC<MobileNodeListProps> = ({
  nodes,
  statuses,
  onNodeClick,
  isEditMode = false,
  accentColor = '#3b82f6',
  appConfig,
  statusCard,
  activeFilter,
  filteredNodes,
  onFilterChange,
}) => {
  const filterLabel = activeFilter === 'online' ? 'Online' : activeFilter === 'offline' ? 'Offline' : 'Active';
  const filterColor = activeFilter === 'online' ? '#22c55e' : activeFilter === 'offline' ? '#ef4444' : accentColor;
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

    // Normalize the identifier before lookup (same as desktop getNodeStatus does)
    const normalizedIdentifier = nodeIdentifier ? normalizeNodeIdentifier(nodeIdentifier) : '';
    const status = normalizedIdentifier ? statuses[normalizedIdentifier] : undefined;
    
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
      {statusCard && <div>{statusCard}</div>}

      {activeFilter && filteredNodes ? (
        /* ── Filtered flat view ── */
        <div>
          {/* Filter banner */}
          <div className="mx-4 mt-3 mb-1">
            <div
              className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/95 border shadow-sm"
              style={{ borderColor: `${filterColor}45` }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: filterColor }} />
                <span className="text-sm font-semibold text-gray-700 font-roboto">{filterLabel} nodes</span>
                <span
                  className="text-xs font-medium text-white px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: filterColor }}
                >
                  {filteredNodes.length}
                </span>
              </div>
              <button
                onClick={() => onFilterChange?.(null)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-roboto px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Clear
              </button>
            </div>
          </div>

          {/* Flat node cards */}
          <div className="px-4 pb-8 pt-2">
            {filteredNodes.length > 0 ? (
              filteredNodes.map(node => {
                let nodeIdentifier = node.internalAddress;
                if (!nodeIdentifier && node.healthCheckPort && node.ip) {
                  nodeIdentifier = `${node.ip}:${node.healthCheckPort}`;
                }
                const normalizedId = nodeIdentifier ? normalizeNodeIdentifier(nodeIdentifier) : '';
                const nodeStatus = normalizedId ? statuses[normalizedId] : undefined;
                return (
                  <NodeCard
                    key={node.id}
                    node={node}
                    status={nodeStatus}
                    onClick={onNodeClick}
                    isEditMode={isEditMode}
                    isInteractable={!!getNodeTargetUrl(node)}
                    style={{ marginBottom: '12px', height: '88px' }}
                  />
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-roboto">No {filterLabel.toLowerCase()} nodes</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Normal tree view ── */
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
                  console.warn('Logo failed to load, trying fallback');
                  e.currentTarget.src = '/nautilusIcon.png';
                }}
              />
            </div>
          )}

          {!appConfig?.appearance?.logo && !appConfig?.appearance?.favicon && (
            <div className="flex justify-center items-center py-6 mt-4">
              <img
                src="/nautilusIcon.png"
                alt="Nautilus"
                className="w-12 h-12 opacity-80 filter drop-shadow-lg"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileNodeList;