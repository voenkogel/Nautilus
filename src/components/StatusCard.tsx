import React from 'react';
import { useNodeStatus } from '../hooks/useNodeStatus';
import configData from '../../config.json';
import type { AppConfig } from '../types/config';
import { extractAllIPs } from '../utils/config';

const appConfig = configData as AppConfig;

const StatusCard: React.FC = () => {
  const { statuses, isLoading, error, isConnected, nextCheckCountdown, totalInterval, isQuerying } = useNodeStatus();

  // Get all node IPs from the centralized config
  const allNodeIPs = extractAllIPs(appConfig.tree.nodes);
  const totalNodes = allNodeIPs.length;
  
  // Count healthy nodes
  const healthyNodes = allNodeIPs.filter(ip => {
    const status = statuses[ip];
    return status && status.status === 'online';
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
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 min-w-[200px] border border-gray-200">
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
        <span>{totalNodes - healthyNodes} offline</span>
      </div>
    </div>
  );
};

export default StatusCard;