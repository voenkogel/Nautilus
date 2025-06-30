import React, { useState } from 'react';
import { Settings as SettingsIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useNodeStatus } from '../hooks/useNodeStatus';
import configData from '../../config.json';
import type { AppConfig, TreeNode } from '../types/config';

const appConfig = configData as AppConfig;

// Helper function to extract all node identifiers (IP or URL) from the tree
const extractAllNodeIdentifiers = (nodes: TreeNode[]): string[] => {
  const identifiers: string[] = [];
  
  const traverse = (nodeList: TreeNode[]) => {
    for (const node of nodeList) {
      // Use IP if available, otherwise use URL (same logic as server and Canvas)
      const identifier = node.ip || node.url;
      if (identifier) {
        identifiers.push(identifier);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  };
  
  traverse(nodes);
  return identifiers;
};

interface StatusCardProps {
  onOpenSettings: () => void;
}

const StatusCard: React.FC<StatusCardProps> = ({ onOpenSettings }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { statuses, isLoading, error, isConnected, nextCheckCountdown, totalInterval, isQuerying } = useNodeStatus();

  // Get all node identifiers (IP or URL) from the centralized config
  const allNodeIdentifiers = extractAllNodeIdentifiers(appConfig.tree.nodes);
  
  // Only count nodes that have identifiers (exclude grey/loading nodes)
  const monitoredNodes = allNodeIdentifiers.filter(identifier => identifier && identifier.trim() !== '');
  const totalNodes = monitoredNodes.length;
  
  // Count healthy nodes (only among monitored nodes)
  const healthyNodes = monitoredNodes.filter(identifier => {
    const status = statuses[identifier];
    return status && status.status === 'online';
  }).length;
  
  // Count offline nodes (only among monitored nodes)
  const offlineNodes = monitoredNodes.filter(identifier => {
    const status = statuses[identifier];
    return status && status.status === 'offline';
  }).length;

  // Count checking nodes (only among monitored nodes)
  const checkingNodes = monitoredNodes.filter(identifier => {
    const status = statuses[identifier];
    return status && status.status === 'checking';
  }).length;

  const healthPercentage = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 0;

  // Calculate progress for countdown (0 to 1)
  const countdownProgress = totalInterval > 0 ? (totalInterval - nextCheckCountdown) / totalInterval : 0;

  // Circular progress bar component with querying state
  const CircularProgress: React.FC<{ progress: number; size: number; isQuerying: boolean }> = ({ progress, size, isQuerying }) => {
    const radius = size / 2 - 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress * circumference);

    if (isQuerying) {
      // Show spinning indicator during queries
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="animate-spin" width={size} height={size}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
              className="text-blue-500"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-green-500 transition-all duration-100 ease-linear"
            strokeLinecap="round"
          />
        </svg>
        {/* Timer text - only show when not querying */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-gray-600 font-roboto">
            {Math.ceil(nextCheckCountdown / 1000)}
          </span>
        </div>
      </div>
    );
  };

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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm font-medium text-red-600 font-roboto">Monitoring Offline</span>
          </div>
        </div>
        <div className="text-xs text-red-500 font-roboto">Status server unreachable</div>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 min-w-[200px]">
      {/* Always visible header with collapse/expand and settings buttons */}
      <div className="flex items-center justify-between p-2">
        {/* Collapse/Expand button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          title={isCollapsed ? "Expand status card" : "Collapse status card"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          title="Open settings"
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          {/* Header with connection status */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-gray-800 font-roboto">System Health</span>
            </div>
            {/* Show countdown timer only when connected */}
            {isConnected && (
              <CircularProgress progress={countdownProgress} size={24} isQuerying={isQuerying} />
            )}
            {/* Show disconnected status when not connected */}
            {!isConnected && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span className="text-xs font-roboto text-red-600">Disconnected</span>
              </div>
            )}
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
            {checkingNodes > 0 && <span>{checkingNodes} checking</span>}
            <span>{offlineNodes} offline</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusCard;