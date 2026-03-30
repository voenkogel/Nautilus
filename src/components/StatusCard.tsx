import React, { useState } from 'react';
import { Settings as SettingsIcon, ChevronDown, ChevronRight, Play, Users } from 'lucide-react';
import type { AppConfig, NodeStatus } from '../types/config';
import { extractMonitoredNodeIdentifiers, getAllNodes } from '../utils/nodeUtils';

type NodeFilter = 'online' | 'offline' | 'activity';

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
  activeFilter?: NodeFilter | null;
  onFilterChange?: (filter: NodeFilter | null) => void;
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
  isMobile = false,
  activeFilter,
  onFilterChange,
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

  // Activity tracking — Plex streams & Minecraft players
  const allNodes = getAllNodes(appConfig.tree.nodes);

  interface ActivityItem {
    title: string;
    type: 'plex' | 'minecraft';
    count: number;
    max?: number;
  }

  const activityItems: ActivityItem[] = [];
  const hasActivityNodes = allNodes.some(n =>
    (n.healthCheckType === 'plex' || n.healthCheckType === 'minecraft') &&
    (n.internalAddress || (n.ip && n.healthCheckPort)) &&
    !n.disableHealthCheck
  );

  if (hasActivityNodes) {
    for (const node of allNodes) {
      const identifier = node.internalAddress ||
        (node.ip && node.healthCheckPort ? `${node.ip}:${node.healthCheckPort}` : null);
      if (!identifier || node.disableHealthCheck) continue;

      const status = statuses[identifier];
      if (!status || status.status !== 'online') continue;

      if (node.healthCheckType === 'plex' && (status.streams ?? 0) > 0) {
        activityItems.push({ title: node.title, type: 'plex', count: status.streams! });
      }
      if (node.healthCheckType === 'minecraft' && (status.players?.online ?? 0) > 0) {
        activityItems.push({ title: node.title, type: 'minecraft', count: status.players!.online, max: status.players!.max });
      }
    }
  }

  const isActive = activityItems.length > 0;

  // Calculate percentages for the progress bar
  const healthPercentage = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 100; // Green portion
  const offlinePercentage = totalNodes > 0 ? (offlineNodes / totalNodes) * 100 : 0; // Red portion
  const checkingPercentage = totalNodes > 0 ? (checkingNodes / totalNodes) * 100 : 0; // Gray portion

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
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 hover:scale-110 rounded-md transition-all duration-200"
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
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 hover:scale-110 rounded-md transition-all duration-200"
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

          {/* Progress bar with three sections: green (online), gray (checking), red (offline) */}
          <div className="relative">
            {/* Background for the full bar */}
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              {/* Red portion (offline nodes) - positioned from the right */}
              {offlinePercentage > 0 && (
                <div 
                  className="absolute right-0 top-0 h-full bg-red-400 transition-all duration-500 ease-out"
                  style={{ width: `${offlinePercentage}%` }}
                ></div>
              )}
              
              {/* Gray portion (checking nodes) - positioned after green */}
              {checkingPercentage > 0 && (
                <div 
                  className="absolute top-0 h-full bg-gray-300 transition-all duration-500 ease-out"
                  style={{ 
                    left: `${healthPercentage}%`, 
                    width: `${checkingPercentage}%` 
                  }}
                ></div>
              )}
              
              {/* Green portion (online nodes) - starts from left */}
              <div 
                className="h-full bg-green-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${healthPercentage}%` }}
              ></div>
            </div>
            
            {/* Progress bar shine effect - only on green portion */}
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full transition-all duration-500"
              style={{ width: `${healthPercentage}%` }}
            ></div>
          </div>

          {/* Status breakdown — each item is a filter trigger */}
          <div className="flex items-center gap-1 text-[11px] text-gray-600 font-roboto mt-2 select-none flex-wrap">
            <button
              onClick={() => onFilterChange?.(activeFilter === 'online' ? null : 'online')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 ${
                activeFilter === 'online'
                  ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                  : 'hover:bg-gray-50 hover:text-gray-800'
              }`}
              title="Filter to online nodes"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span>{healthyNodes} online</span>
            </button>

            {checkingNodes > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 text-gray-400">
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse flex-shrink-0" />
                <span>{checkingNodes}</span>
              </span>
            )}

            <button
              onClick={() => onFilterChange?.(activeFilter === 'offline' ? null : 'offline')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 ${
                activeFilter === 'offline'
                  ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                  : 'hover:bg-gray-50 hover:text-gray-800'
              }`}
              title="Filter to offline nodes"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${offlineNodes > 0 ? 'bg-red-500' : 'bg-red-200'}`} />
              <span>{offlineNodes} offline</span>
            </button>
          </div>

          {/* Activity section — Plex streams & Minecraft players */}
          {hasActivityNodes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              {/* Clickable header row acts as activity filter toggle */}
              <button
                onClick={() => onFilterChange?.(activeFilter === 'activity' ? null : 'activity')}
                className={`w-full flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg transition-all duration-150 ${
                  activeFilter === 'activity' ? '' : 'hover:bg-gray-50'
                }`}
                style={activeFilter === 'activity' ? {
                  backgroundColor: `${appConfig.appearance.accentColor}12`,
                  boxShadow: `0 0 0 1px ${appConfig.appearance.accentColor}40`,
                } : {}}
                title="Filter to active nodes"
              >
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide font-roboto">Activity</span>
                {isActive ? (
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold font-roboto"
                    style={{ color: appConfig.appearance.accentColor }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: appConfig.appearance.accentColor }}
                    />
                    In Use
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400 font-roboto">Idle</span>
                )}
              </button>

              {isActive ? (
                <div className="flex flex-wrap gap-1.5">
                  {activityItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium font-roboto"
                      style={{
                        backgroundColor: `${appConfig.appearance.accentColor}18`,
                        color: appConfig.appearance.accentColor,
                      }}
                    >
                      {item.type === 'plex'
                        ? <Play size={10} fill="currentColor" strokeWidth={0} />
                        : <Users size={10} />
                      }
                      <span>
                        {item.type === 'plex'
                          ? `${item.count} ${item.count === 1 ? 'stream' : 'streams'}`
                          : `${item.count}${item.max ? `/${item.max}` : ''} player${item.count !== 1 ? 's' : ''}`
                        }
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                  <span className="text-[11px] text-gray-400 font-roboto">No active usage</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusCard;