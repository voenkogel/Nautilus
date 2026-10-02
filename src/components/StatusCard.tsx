import React, { useState } from 'react';
import { Settings as SettingsIcon, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import type { AppConfig, NodeStatus } from '../types/config';
import { extractMonitoredNodeIds, getAllNodes, isNodeMonitored, isStreamSource } from '../utils/nodeUtils';

type NodeFilter = 'online' | 'offline' | 'activity';

interface StatusCardProps {
  onOpenSettings: () => void;
  onOpenHistory?: () => void;
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
  onOpenHistory,
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

  // Get all monitored node ids (only nodes with a health-check address, enabled)
  const monitoredNodes = extractMonitoredNodeIds(appConfig.tree.nodes);
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

  // Count nodes currently in a backup window (planned downtime, shown violet)
  const backupNodes = monitoredNodes.filter(identifier => {
    const status = statuses[identifier];
    return status && status.status === 'backup';
  }).length;

  // Activity tracking — media server streams & Minecraft players
  const allNodes = getAllNodes(appConfig.tree.nodes);

  const hasActivityNodes = allNodes.some(n =>
    (isStreamSource(n) || n.healthCheckType === 'minecraft') &&
    isNodeMonitored(n)
  );

  // Nodes currently reporting live activity (a media stream or a Minecraft player)
  const activeNodes = hasActivityNodes ? allNodes.filter(node => {
    if (node.disableHealthCheck) return false;
    const status = statuses[node.id];
    if (!status || status.status !== 'online') return false;
    return (isStreamSource(node) && (status.streams ?? 0) > 0) ||
           (node.healthCheckType === 'minecraft' && (status.players?.online ?? 0) > 0);
  }) : [];

  const isActive = activeNodes.length > 0;

  // Aggregate what's happening into a pronounced, human-readable summary
  const totalStreams = activeNodes.reduce(
    (sum, n) => (isStreamSource(n) ? sum + (statuses[n.id]?.streams ?? 0) : sum),
    0
  );
  const totalPlayers = activeNodes.reduce(
    (sum, n) => (n.healthCheckType === 'minecraft' ? sum + (statuses[n.id]?.players?.online ?? 0) : sum),
    0
  );
  const activityParts: string[] = [];
  if (totalStreams > 0) activityParts.push(`${totalStreams} stream${totalStreams === 1 ? '' : 's'}`);
  if (totalPlayers > 0) activityParts.push(`${totalPlayers} player${totalPlayers === 1 ? '' : 's'}`);
  const activitySummary = activityParts.join(' · ');
  const accent = '#65d7e8';

  // Calculate percentages for the progress bar
  const healthPercentage = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 100; // Green portion
  const offlinePercentage = totalNodes > 0 ? (offlineNodes / totalNodes) * 100 : 0; // Red portion
  const checkingPercentage = totalNodes > 0 ? (checkingNodes / totalNodes) * 100 : 0; // Gray portion
  const backupPercentage = totalNodes > 0 ? (backupNodes / totalNodes) * 100 : 0; // Violet portion

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
      <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
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
            className={`transition-all duration-300 ease-in-out ${isQuerying ? "text-accent" : "text-green-500"}`}
            strokeLinecap="round"
          />
        </svg>
        
        {/* Timer text - only show when not querying */}
        {!isQuerying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-muted font-roboto">
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
        ? 'bg-surface/95 backdrop-blur-sm border-b border-line px-4 py-4'
        : 'bg-surface/95 backdrop-blur-sm rounded-lg shadow-lg border border-line p-4 min-w-[200px]'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 bg-line rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-muted font-roboto">Loading status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${isMobile 
        ? 'bg-surface/95 backdrop-blur-sm border-b border-negative/25 px-4 py-4'
        : 'bg-surface/95 backdrop-blur-sm rounded-lg shadow-lg border border-negative/25 p-4 min-w-[200px]'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm font-medium text-negative font-roboto">Monitoring Offline</span>
          </div>
        </div>
        <div className="text-xs text-negative font-roboto">Status server unreachable</div>
      </div>
    );
  }

  return (
    <div className={`${isMobile 
      ? 'bg-surface/95 backdrop-blur-sm border-b border-line'
      : 'bg-surface/95 backdrop-blur-sm rounded-lg shadow-lg border border-line min-w-[200px]'
    }`}>
      {/* Always visible header with collapse/expand, system health title, and settings buttons */}
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center space-x-2">
          {/* Collapse/Expand button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-muted hover:text-ink hover:bg-raised hover:scale-110 rounded-md transition-all duration-200"
            aria-label={isCollapsed ? "Expand status card" : "Collapse status card"}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? "Expand status card" : "Collapse status card"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </button>
          
          {/* System Health title - now always visible */}
          <span className="text-base font-medium text-ink font-roboto">System Health</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1">
          {/* History button */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="p-2 text-muted hover:text-ink hover:bg-raised hover:scale-110 rounded-md transition-all duration-200"
              aria-label="View history"
              title="View history"
            >
              <Clock size={18} />
            </button>
          )}
          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="p-2 text-muted hover:text-ink hover:bg-raised hover:scale-110 rounded-md transition-all duration-200"
            aria-label="Open settings"
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
            <div aria-live="polite">
              <span className="text-lg font-semibold text-ink font-roboto">
                {healthyNodes}/{totalNodes}
              </span>
              <span className="text-sm text-muted font-roboto ml-1">healthy</span>
            </div>
            
            {/* Timing indicator moved to right side */}
            {isConnected && !error && totalInterval > 0 && (
              <CircularProgress progress={countdownProgress} size={24} isQuerying={isQuerying} />
            )}
            {/* Show disconnected status when not connected */}
            {!isConnected && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span className="text-xs font-roboto text-negative">Disconnected</span>
              </div>
            )}
          </div>

          {/* Progress bar with three sections: green (online), gray (checking), red (offline) */}
          {/* Decorative — the same counts are available as text in the breakdown below (A11Y-4/6) */}
          <div className="relative" aria-hidden="true">
            {/* Background for the full bar */}
            <div className="w-full h-3 bg-raised rounded-full overflow-hidden">
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
                  className="absolute top-0 h-full bg-line transition-all duration-500 ease-out"
                  style={{
                    left: `${healthPercentage}%`,
                    width: `${checkingPercentage}%`
                  }}
                ></div>
              )}

              {/* Violet portion (backing-up nodes) - positioned after checking */}
              {backupPercentage > 0 && (
                <div
                  className="absolute top-0 h-full bg-violet-400 transition-all duration-500 ease-out"
                  style={{
                    left: `${healthPercentage + checkingPercentage}%`,
                    width: `${backupPercentage}%`
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
          <div className="flex items-center gap-1 text-[11px] text-muted font-roboto mt-2 select-none flex-wrap">
            <button
              onClick={() => onFilterChange?.(activeFilter === 'online' ? null : 'online')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 ${
                activeFilter === 'online'
                  ? 'bg-positive/10 text-positive ring-1 ring-green-200'
                  : 'hover:bg-abyss hover:text-ink'
              }`}
              title="Filter to online nodes"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span>{healthyNodes} online</span>
            </button>

            {checkingNodes > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 text-muted">
                <span className="w-2 h-2 rounded-full bg-line animate-pulse flex-shrink-0" />
                <span>{checkingNodes}</span>
              </span>
            )}

            {backupNodes > 0 && (
              <span
                className="flex items-center gap-1.5 px-2 py-1 text-violet-700"
                title={`${backupNodes} node${backupNodes === 1 ? '' : 's'} backing up`}
              >
                <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                <span>{backupNodes} backing up</span>
              </span>
            )}

            <button
              onClick={() => onFilterChange?.(activeFilter === 'offline' ? null : 'offline')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 ${
                activeFilter === 'offline'
                  ? 'bg-negative/10 text-negative ring-1 ring-red-200'
                  : 'hover:bg-abyss hover:text-ink'
              }`}
              title="Filter to offline nodes"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${offlineNodes > 0 ? 'bg-red-500' : 'bg-negative/20'}`} />
              <span>{offlineNodes} offline</span>
            </button>
          </div>

          {/* Live activity — a pronounced pill, shown ONLY when a media stream or Minecraft player is active */}
          {hasActivityNodes && isActive && (
            <div className="mt-3 pt-3 border-t border-line">
              <button
                onClick={() => onFilterChange?.(activeFilter === 'activity' ? null : 'activity')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:brightness-[1.03]"
                style={{
                  background: `linear-gradient(135deg, ${accent}1F 0%, ${accent}0A 100%)`,
                  boxShadow: activeFilter === 'activity'
                    ? `inset 0 0 0 1.5px ${accent}, 0 4px 14px -3px ${accent}66`
                    : `inset 0 0 0 1px ${accent}33`,
                }}
                title="Filter to active nodes"
                aria-label={`Live activity: ${activitySummary || 'in use'}. Click to filter to active nodes.`}
              >
                {/* Radar ping — the pronounced "live" beacon */}
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                    style={{ backgroundColor: accent }}
                  />
                  <span
                    className="relative inline-flex h-3 w-3 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                </span>

                {/* Label + human-readable summary of what's active */}
                <span className="flex flex-col items-start leading-tight min-w-0">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider font-roboto"
                    style={{ color: accent }}
                  >
                    Live Activity
                  </span>
                  <span className="text-xs font-medium text-ink font-roboto truncate">
                    {activitySummary || 'In use'}
                  </span>
                </span>

                {/* Drill-in affordance */}
                <ChevronRight
                  size={16}
                  className="ml-auto flex-shrink-0 transition-transform duration-200"
                  style={{ color: accent, opacity: activeFilter === 'activity' ? 0.9 : 0.45 }}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusCard;