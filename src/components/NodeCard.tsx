import React from 'react';
import type { TreeNode } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';
import { getIconSvg } from '../utils/iconUtils';
import { getNodeAddressDisplay } from '../utils/nodeUtils';

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
    return `<1m`;
  }
};

interface NodeCardProps {
  node: TreeNode;
  status?: NodeStatus;
  onClick?: (node: TreeNode) => void;
  className?: string;
  style?: React.CSSProperties;
}

const NodeCard: React.FC<NodeCardProps> = ({ 
  node, 
  status, 
  onClick, 
  className = '',
  style = {}
}) => {
  const { title, subtitle, icon, type } = node;
  
  // Get node card style based on type
  const getNodeCardStyle = (nodeType?: string) => {
    switch (nodeType) {
      case 'circular':
        return 'rounded-full';
      case 'angular':
        return 'rounded-none';
      case 'square':
      default:
        return 'rounded-lg';
    }
  };

  // Get custom style for angular cards
  const getAngularStyle = (nodeType?: string) => {
    if (nodeType === 'angular') {
      return {
        clipPath: 'polygon(5% 0%, 95% 0%, 100% 15%, 100% 85%, 95% 100%, 5% 100%, 0% 85%, 0% 15%)'
      };
    }
    return {};
  };

  // Determine status color
  let statusColor = '#6b7280'; // Default gray
  const isMonitoringDisabled = !node.internalAddress && !node.healthCheckPort;
  
  if (status && !isMonitoringDisabled) {
    if (status.status === 'online') {
      statusColor = '#10b981'; // Green
    } else if (status.status === 'offline') {
      statusColor = '#ef4444'; // Red
    }
  }

  // Get SVG for the icon
  const iconSvg = icon 
    ? getIconSvg(icon, '#ffffff')
    : getIconSvg('server', '#ffffff');

  // Address display logic - only show external address
  const displayAddress = getNodeAddressDisplay(node);

  // Player count logic
  const showPlayerCount = status?.players && node.healthCheckType === 'minecraft';

  return (
    <div 
      className={`relative flex items-center p-3 bg-white/90 shadow-lg border border-gray-100 overflow-hidden ${getNodeCardStyle(type)} ${className}`}
      style={{ 
        ...getAngularStyle(type),
        ...style
      }}
      onClick={() => onClick?.(node)}
    >
      {/* Status indicator / Icon */}
      <div 
        className="w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0 transition-colors duration-300"
        style={{ backgroundColor: statusColor }}
        dangerouslySetInnerHTML={{ __html: iconSvg }}
      />

      {/* Content area */}
      <div className="flex-1 min-w-0 flex items-center h-full">
        <div className="flex-1 flex flex-col justify-center h-full">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1">
            <div className="font-semibold text-gray-900 truncate text-base leading-tight">{title}</div>
            
            {/* Status Badge */}
            {status && status.statusChangedAt && !isMonitoringDisabled && (
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

          {/* Only show subtitle if it exists */}
          {subtitle && (
            <div className="text-sm text-gray-600 truncate">{subtitle}</div>
          )}
          
          {/* Details Row - Only show external address if configured */}
          {displayAddress && (
            <div className="mt-2 flex items-center text-xs text-gray-500">
              <svg className="mr-1" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
              <span className="truncate">{displayAddress}</span>
            </div>
          )}
        </div>

        {/* Player Count (Right aligned, large) */}
        {showPlayerCount && status?.players && (
          <div className="flex flex-col items-end justify-center ml-4 pl-4 border-l border-gray-100 h-full">
            <div className="text-xl font-bold text-gray-800 leading-none">
              {status.players.online}/{status.players.max}
            </div>
            <div className="text-xs font-medium text-gray-500 mt-1">
              players
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeCard;
