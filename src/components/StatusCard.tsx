import React, { useState } from 'react';
import { Settings as SettingsIcon, ChevronDown, ChevronRight } from 'lucide-react';
import type { AppConfig, NodeStatus } from '../types/config';
import { extractMonitoredNodeIdentifiers } from '../utils/nodeUtils';

interface StatusCardProps {
  onOpenSettings: () => void;
  appConfig: AppConfig;
  statuses: { [key: string]: NodeStatus };
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  nextCheckCountdown: number;
  totalInterval: number;
  isQuerying: boolean;
  isMobile?: boolean;
}

const StatusCard: React.FC<StatusCardProps> = ({ 
  onOpenSettings,
  appConfig,
  statuses,
  isLoading,
  error,
  isConnected,
  nextCheckCountdown,
  totalInterval,
  isQuerying,
  isMobile = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get all monitored node identifiers (only nodes with web GUIs enabled and IP/URL)
  const monitoredNodes = extractMonitoredNodeIdentifiers(appConfig.tree.nodes);
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

  const healthPercentage = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 100; // 100% when no nodes (green)

  // Calculate progress for countdown (0 to 1)
  // Simpler calculation with smoother transitions
  const countdownProgress = isQuerying 
    ? 1 // Full circle when querying 
    : (totalInterval > 0 && nextCheckCountdown > 0)
      ? Math.min(1, Math.max(0, 1 - (nextCheckCountdown / (totalInterval / 1000))))
      : 0;

  // Circular progress bar component with querying state
  const CircularProgress: React.FC<{ progress: number; size: number; isQuerying: boolean }> = ({ progress, size, isQuerying }) => {
    const radius = size / 2 - 2;
    const circumference = 2 * Math.PI * radius;
    // Ensure smooth transitions with clamped values
    const strokeDashoffset = circumference - (Math.min(1, Math.max(0, progress)) * circumference);

    // Use a single SVG structure for both states to prevent DOM replacement jittering
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg 
          className={isQuerying ? "animate-spin" : "transform -rotate-90"} 
          width={size} 
          height={size}
        >
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
            strokeDashoffset={isQuerying ? circumference * 0.75 : strokeDashoffset}
            className={`transition-all duration-300 ease-in-out ${isQuerying ? "text-blue-500" : "text-green-500"}`}
            strokeLinecap="round"
          />
        </svg>
        
        {/* Timer text - only show when not querying */}
        {!isQuerying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-gray-600 font-roboto">
              {nextCheckCountdown > 0 ? Math.ceil(nextCheckCountdown) : '⏱️'}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (isLoading && totalNodes > 0) {
    return (
      <div className={`${isMobile 
        ? 'bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-4' 
        : 'bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-4 min-w-[200px]'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-gray-600 font-roboto">Loading status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${isMobile 
        ? 'bg-white/95 backdrop-blur-sm border-b border-red-200 px-4 py-4' 
        : 'bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-red-200 p-4 min-w-[200px]'
      }`}>
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
    <div className={`${isMobile 
      ? 'bg-white/95 backdrop-blur-sm border-b border-gray-200' 
      : 'bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 min-w-[200px]'
    }`}>
      {/* Always visible header with collapse/expand, system health title, and settings buttons */}
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center space-x-2">
          {/* Collapse/Expand button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            title={isCollapsed ? "Expand status card" : "Collapse status card"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </button>
          
          {/* System Health title - now always visible */}
          <span className="text-base font-medium text-gray-800 font-roboto">System Health</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1">
          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            title="Open settings"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          {/* Health count and timing indicator row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-lg font-semibold text-gray-800 font-roboto">
                {healthyNodes}/{totalNodes}
              </span>
              <span className="text-sm text-gray-600 font-roboto ml-1">healthy</span>
            </div>
            
            {/* Timing indicator moved to right side */}
            {isConnected && !error && totalInterval > 0 && (
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
          <div className="flex items-center justify-between text-[11px] text-gray-600 font-roboto mt-2 select-none" aria-label={`Status breakdown: ${healthyNodes} online${checkingNodes>0?`, ${checkingNodes} checking`:''}, ${offlineNodes} offline`}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]" aria-hidden="true" />
                <span>{healthyNodes} online</span>
              </span>
              {checkingNodes > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300 animate-pulse shadow-[0_0_0_1px_rgba(0,0,0,0.05)]" aria-hidden="true" />
                  <span>{checkingNodes} checking</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.05)] ${offlineNodes>0 ? 'bg-red-500' : 'bg-red-200'}`} aria-hidden="true" />
                <span>{offlineNodes} offline</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusCard;