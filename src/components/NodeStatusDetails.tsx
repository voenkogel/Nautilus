import React from 'react';
import type { TreeNode } from '../types/config';
import type { NodeStatus } from '../hooks/useNodeStatus';

interface NodeStatusDetailsProps {
  node: TreeNode;
  status?: NodeStatus;
  accentColor?: string;
}

/**
 * Component to render specific status details based on node type.
 * Currently supports Minecraft player counts, but designed to be extensible.
 */
const NodeStatusDetails: React.FC<NodeStatusDetailsProps> = ({ node, status }) => {
  // Determine status color based on node status
  const getStatusColor = () => {
    if (!status) return '#6b7280'; // Default gray
    
    const isMonitoringDisabled = (!node.internalAddress && !node.healthCheckPort) || 
                                 node.healthCheckType === 'disabled' || 
                                 node.disableHealthCheck;
    
    if (isMonitoringDisabled) return '#6b7280';
    
    switch (status.status) {
      case 'online':
        return '#10b981'; // Green
      case 'offline':
        return '#ef4444'; // Red
      case 'checking':
        return '#3b82f6'; // Blue
      default:
        return '#6b7280'; // Gray
    }
  };

  const statusColor = getStatusColor();

  // Minecraft Player Count
  if (node.healthCheckType === 'minecraft' && status?.players) {
    return (
      <div 
        className="flex flex-col items-center justify-center ml-2 px-3 py-2 rounded-md h-full min-w-max"
        style={{ backgroundColor: `${statusColor}15` }}
      >
        <div 
          className="text-xl font-bold leading-none"
          style={{ color: statusColor }}
        >
          {status.players.online}/{status.players.max}
        </div>
        <div className="text-xs font-medium text-gray-500 mt-1">
          players
        </div>
      </div>
    );
  }

  // Plex Stream Count
  if (node.healthCheckType === 'plex' && typeof status?.streams === 'number') {
    return (
      <div 
        className="flex flex-col items-center justify-center ml-2 px-3 py-2 rounded-md h-full min-w-max"
        style={{ backgroundColor: `${statusColor}15` }}
      >
        <div 
          className="text-xl font-bold leading-none"
          style={{ color: statusColor }}
        >
          {status.streams}
        </div>
        <div className="text-xs font-medium text-gray-500 mt-1">
          {status.streams === 1 ? 'stream' : 'streams'}
        </div>
      </div>
    );
  }

  // Future status types can go here (e.g., Docker container stats, Disk usage, etc.)
  
  return null;
};

export default NodeStatusDetails;
