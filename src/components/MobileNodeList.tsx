import React, { useCallback } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';
import { getIconSvg } from '../utils/iconUtils';

interface MobileNodeListProps {
  nodes: TreeNode[];
  statuses: Record<string, NodeStatus>;
  onNodeClick: (node: TreeNode) => void;
  onEditClick: (node: TreeNode) => void;
  appConfig?: {
    appearance?: AppearanceConfig;
  };
  statusCard?: React.ReactNode;
}

const MobileNodeList: React.FC<MobileNodeListProps> = ({ 
  nodes, 
  statuses, 
  onNodeClick, 
  onEditClick,
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
  const renderNode = useCallback((node: TreeNode, level: number = 0, isLastChild: boolean = true, parentPath: boolean[] = []) => {
    const { id, title, subtitle, ip, url, icon, type, children } = node;
    
    // Get status for this node
    const nodeIdentifier = ip || url;
    const status = nodeIdentifier ? statuses[nodeIdentifier] : undefined;
    let statusColor = '#6b7280'; // Default gray
    
    if (status) {
      if (status.status === 'online') {
        statusColor = '#10b981'; // Green
      } else if (status.status === 'offline') {
        statusColor = '#ef4444'; // Red
      }
    }
    
    // Get SVG for the icon if available
    const iconSvg = icon 
      ? getIconSvg(icon, '#ffffff')
      : getIconSvg('server', '#ffffff'); // Default to server icon
    
    // Card border radius based on node type
    const cardStyle = getNodeCardStyle(type);
    
    // Calculate connection line offset
    const connectionOffset = 16; // Base indentation per level
    
    return (
      <div key={id} className="relative">
        {/* Connection lines for tree structure */}
        {level > 0 && (
          <div className="absolute left-0 top-0 h-full pointer-events-none z-0">
            {/* Render vertical lines for each parent level */}
            {parentPath.map((hasMoreSiblings, index) => (
              hasMoreSiblings && (
                <div
                  key={index}
                  className="absolute bg-gray-500"
                  style={{
                    left: `${(index + 1) * connectionOffset - 9}px`,
                    top: 0,
                    width: '3px',
                    height: '100%'
                  }}
                />
              )
            ))}
            
            {/* Horizontal line to this node - extends to card center */}
            <div
              className="absolute bg-gray-500 z-0"
              style={{
                left: `${level * connectionOffset - 9}px`,
                top: '48px', // Center of the card (96px height / 2)
                width: `${connectionOffset + 9}px`, // Extend all the way to card
                height: '3px'
              }}
            />
            
            {/* Vertical line for this level - extends through gaps including upward to parent center */}
            <div
              className="absolute bg-gray-500"
              style={{
                left: `${level * connectionOffset - 9}px`,
                top: '-60px', // Adjusted for smaller gap (48px card center + 12px gap)
                width: '3px',
                height: isLastChild ? '110px' : `calc(100% + 72px)` // Adjusted for smaller gaps
              }}
            />
          </div>
        )}
        
        <div 
          className={`relative flex items-center p-4 bg-white/90 shadow-lg border border-gray-100 h-[96px] z-10 ${cardStyle}`}
          style={{ 
            marginLeft: `${level * connectionOffset}px`,
            marginBottom: '12px', // Reduced from 16px to 12px
            ...getAngularStyle(type)
          }}
        >
          {/* Status indicator - increased size */}
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mr-4 flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            dangerouslySetInnerHTML={{ __html: iconSvg }}
          />
          
          {/* Content area with vertical centering */}
          <div className="flex-1 min-w-0 flex items-center h-full" onClick={() => onNodeClick(node)}>
            {/* Text content - fixed height container */}
            <div className="flex-1 flex flex-col justify-center h-full">
              <div className="font-semibold text-gray-900 truncate text-base leading-tight">{title}</div>
              <div className="text-sm text-gray-600 truncate mt-1">{subtitle}</div>
              
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
            
            {/* Edit button - properly isolated outside the node click event */}
            <button 
              className="ml-3 text-gray-500 p-2 hover:bg-gray-100 rounded-full flex items-center justify-center h-10 w-10 flex-shrink-0 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onEditClick(node);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Render children recursively */}
        {children && children.length > 0 && (
          <div>
            {children.map((child, index) => {
              const isLastChild = index === children.length - 1;
              const newParentPath = [...parentPath, !isLastChild];
              return renderNode(child, level + 1, isLastChild, newParentPath);
            })}
          </div>
        )}
      </div>
    );
  }, [statuses, onNodeClick, onEditClick]);

  return (
    <div className="px-4 py-4 overflow-y-auto max-h-full bg-transparent">
      {/* Status Card at the top if provided */}
      {statusCard && (
        <div className="mb-4">
          {statusCard}
        </div>
      )}
      
      {nodes.map((node, index) => {
        const isLastChild = index === nodes.length - 1;
        return renderNode(node, 0, isLastChild, []);
      })}
      
      {/* Logo at the bottom */}
      {(appConfig?.appearance?.logo || appConfig?.appearance?.favicon) && (
        <div className="flex justify-center items-center py-6 mt-4">
          <img 
            src={appConfig.appearance.logo || appConfig.appearance.favicon} 
            alt={appConfig.appearance.title || 'Logo'} 
            className="w-12 h-12 opacity-80 filter drop-shadow-lg"
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
  );
};

export default MobileNodeList;
