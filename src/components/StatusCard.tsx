import React from 'react';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { defaultTreeConfig } from '../config/treeConfig';

const StatusCard: React.FC = () => {
  const { statuses, isLoading, error } = useNodeStatus();

  // Get all node IPs from the tree config
  const getAllNodeIPs = (nodes: any[]): string[] => {
    const ips: string[] = [];
    
    const traverse = (nodeList: any[]) => {
      nodeList.forEach(node => {
        ips.push(node.ip);
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    
    traverse(nodes);
    return ips;
  };

  const allNodeIPs = getAllNodeIPs(defaultTreeConfig.nodes);
  const totalNodes = allNodeIPs.length;
  
  // Count healthy nodes
  const healthyNodes = allNodeIPs.filter(ip => {
    const status = statuses[ip];
    return status && status.status === 'online';
  }).length;

  const healthPercentage = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 0;

  if (isLoading) {
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 min-w-[200px] border border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-gray-600 font-roboto">Loading status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 min-w-[200px] border border-red-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-sm font-medium text-red-600 font-roboto">Monitoring Offline</span>
        </div>
        <div className="text-xs text-red-500 font-roboto">Status server unreachable</div>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 min-w-[200px] border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-gray-800 font-roboto">System Health</span>
        </div>
        <span className="text-xs text-gray-500 font-roboto">{Math.round(healthPercentage)}%</span>
      </div>

      {/* Health count */}
      <div className="mb-3">
        <span className="text-lg font-semibold text-gray-800 font-roboto">
          {healthyNodes}/{totalNodes}
        </span>
        <span className="text-sm text-gray-600 font-roboto ml-1">healthy</span>
      </div>

      {/* Progress bar */}
      <div className="relative">
        {/* Background (red) */}
        <div className="w-full h-3 bg-red-400 rounded-full overflow-hidden">
          {/* Foreground (green) */}
          <div 
            className="h-full bg-green-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${healthPercentage}%` }}
          ></div>
        </div>
        
        {/* Progress bar shine effect */}
        <div 
          className="absolute top-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full transition-all duration-500"
          style={{ width: `${healthPercentage}%` }}
        ></div>
      </div>

      {/* Status breakdown */}
      <div className="flex justify-between text-xs text-gray-500 font-roboto mt-2">
        <span>{healthyNodes} online</span>
        <span>{totalNodes - healthyNodes} offline</span>
      </div>
    </div>
  );
};

export default StatusCard;