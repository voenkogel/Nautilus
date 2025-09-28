import React, { useCallback } from 'react';
import type { TreeNode } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';
import { getIconSvg } from '../utils/iconUtils';

// Utility function to format time duration since status change
const formatTimeSince = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m`;
  } else {
    // For anything less than a minute, show "<1m" instead of seconds
    return `<1m`;
  }
};

import type { AppConfig } from '../types/config';

interface MobileNodeListProps {
  nodes: TreeNode[];
  statuses: Record<string, NodeStatus>;
  onNodeClick: (node: TreeNode) => void;
  appConfig?: AppConfig;
  statusCard?: React.ReactNode;
}

const MobileNodeList: React.FC<MobileNodeListProps> = ({ 
  nodes, 
  statuses, 
  onNodeClick, 
  appConfig,
  statusCard
}) => {
  // Get node card style based on type
  const getNodeCardStyle = (nodeType?: string) => {
    switch (nodeType) {
      case 'circular':
        return 'rounded-full';
      case 'angular':
        // Use CSS clip-path for angular/diamond shape
        return 'rounded-none';
      case 'square':
      default:
        return 'rounded-lg';
    }
  };

  // Get custom style for angular cards with more subtle design
  const getAngularStyle = (nodeType?: string) => {
    if (nodeType === 'angular') {
      return {
        clipPath: 'polygon(5% 0%, 95% 0%, 100% 15%, 100% 85%, 95% 100%, 5% 100%, 0% 85%, 0% 15%)'
      };
    }
    return {};
  };

  // Render a node and its children recursively
  const renderNode = useCallback((node: TreeNode, level: number = 0, isLastChild: boolean = true, parentPath: boolean[] = [], childIndex: number = 0) => {
    const { id, title, subtitle, ip, url, icon, type, children } = node;
    
    // Get status for this node using the same identifier logic as desktop
    const nodeIdentifier = node.healthCheckPort && node.ip 
      ? `${node.ip}:${node.healthCheckPort}` 
      : (ip || url);
    const status = nodeIdentifier ? statuses[nodeIdentifier] : undefined;
    let statusColor = '#6b7280'; // Default gray
    
    // Check if node has monitoring disabled (no healthCheckPort)
    const isMonitoringDisabled = !node.healthCheckPort;
    
    if (status && !isMonitoringDisabled) {
      if (status.status === 'online') {
        statusColor = '#10b981'; // Green
      } else if (status.status === 'offline') {
        statusColor = '#ef4444'; // Red
      }
    } else {
      // Gray color for disabled nodes or nodes without status
      statusColor = '#6b7280';
    }
    
    // Get SVG for the icon if available
    const iconSvg = icon 
      ? getIconSvg(icon, '#ffffff')
      : getIconSvg('server', '#ffffff'); // Default to server icon
    
    // Card border radius based on node type
    const cardStyle = getNodeCardStyle(type);
    
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
        
        <div 
          className={`relative flex items-center p-3 bg-white/90 shadow-lg border border-gray-100 h-[88px] z-10 ${cardStyle}`}
          style={{ 
            marginLeft: `${level * connectionOffset}px`,
            marginBottom: '12px', // Reduced from 16px to 12px
            ...getAngularStyle(type)
          }}
        >
          {/* Status indicator - slightly larger size for better visibility */}
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            dangerouslySetInnerHTML={{ __html: iconSvg }}
          />

          {/* Content area with vertical centering */}
          <div className="flex-1 min-w-0 flex items-center h-full" onClick={() => onNodeClick(node)}>
            {/* Text content - fixed height container */}
            <div className="flex-1 flex flex-col justify-center h-full">
              {/* Title row with status badge */}
              <div className="flex items-center gap-2 mb-1">
                <div className="font-semibold text-gray-900 truncate text-base leading-tight">{title}</div>
                {/* Status duration badge inline with title - only for nodes with monitoring enabled */}
                {status && status.statusChangedAt && !isMonitoringDisabled && nodeIdentifier && (
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-medium shadow-sm flex-shrink-0 ${
                      status.status === 'online' 
                        ? 'bg-green-200 text-green-800' 
                        : status.status === 'offline' 
                          ? 'bg-red-200 text-red-800' 
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {status.status} for {formatTimeSince(status.statusChangedAt || status.lastChecked)}
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600 truncate">{subtitle}</div>
              
              {/* Details - fixed height to maintain consistent card height */}
              <div className="mt-2 h-4 flex items-center">
                {(ip || url) ? (
                  <div className="flex items-center text-xs text-gray-500">
                    {ip && (
                      <div className="flex items-center mr-3">
                        <svg className="mr-1" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
                          <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                          <path d="M12 14v4" />
                        </svg>
                        <span>{ip}</span>
                      </div>
                    )}
                    {url && (
                      <div className="flex items-center">
                        <svg className="mr-1" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          <path d="M2 12h20" />
                        </svg>
                        <span>{url}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">No network details</div>
                )}
              </div>
            </div>
          </div>
        </div>
        
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