import { useState, useEffect } from 'react';
import configData from '../../config.json';
import type { AppConfig } from '../types/config';
import { getServerUrl } from '../utils/config';

const appConfig = configData as AppConfig;

export interface NodeStatus {
  status: 'online' | 'offline' | 'checking';
  lastChecked: string;
  responseTime?: number;
  error?: string;
}

export interface StatusResponse {
  timestamp: string;
  statuses: Record<string, NodeStatus>;
}

export const useNodeStatus = () => {
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nextCheckCountdown, setNextCheckCountdown] = useState(0);
  const [lastHealthCheckTime, setLastHealthCheckTime] = useState<number>(0);
  const [isQuerying, setIsQuerying] = useState(false);

  const fetchStatuses = async () => {
    try {
      const serverUrl = getServerUrl();
      console.log(`Fetching status from: ${serverUrl}/api/status`);
      
      const response = await fetch(`${serverUrl}/api/status`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: StatusResponse = await response.json();
      setStatuses(data.statuses);
      setError(null);
      setIsConnected(true);
      
      // Calculate the last health check time from the most recent lastChecked timestamp
      const lastCheckedTimes = Object.values(data.statuses)
        .map(status => status.lastChecked ? new Date(status.lastChecked).getTime() : 0)
        .filter(time => time > 0);
      
      if (lastCheckedTimes.length > 0) {
        const mostRecent = Math.max(...lastCheckedTimes);
        setLastHealthCheckTime(mostRecent);
      }
    } catch (err) {
      console.error('Failed to fetch node statuses:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnected(false);
      
      // Set all nodes to offline if we can't reach the status server
      setStatuses(prev => {
        const offlineStatuses: Record<string, NodeStatus> = {};
        Object.keys(prev).forEach(ip => {
          offlineStatuses[ip] = {
            status: 'offline',
            lastChecked: new Date().toISOString(),
            error: 'Status server unreachable'
          };
        });
        return offlineStatuses;
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatuses();

    // Set up polling with interval from centralized config
    const interval = setInterval(fetchStatuses, appConfig.client.apiPollingInterval);

    return () => clearInterval(interval);
  }, []);

  // Countdown effect - updates every 100ms for smooth progress bar
  useEffect(() => {
    if (!lastHealthCheckTime) return;
    
    const countdownInterval = setInterval(() => {
      const elapsed = Date.now() - lastHealthCheckTime;
      const remaining = Math.max(0, appConfig.server.healthCheckInterval - elapsed);
      setNextCheckCountdown(remaining);
      
      // Detect if we're in the querying phase (countdown at 0 but no new data yet)
      const isCurrentlyQuerying = remaining === 0 && elapsed < appConfig.server.healthCheckInterval + 5000; // Allow 5s for query time
      setIsQuerying(isCurrentlyQuerying);
      
      if (remaining === 0 && elapsed > appConfig.server.healthCheckInterval + 10000) {
        // If we've been at 0 for more than 10 seconds, something might be wrong
        clearInterval(countdownInterval);
      }
    }, 100);

    return () => clearInterval(countdownInterval);
  }, [lastHealthCheckTime]);

  const getNodeStatus = (ip: string): NodeStatus => {
    return statuses[ip] || { 
      status: 'checking', 
      lastChecked: new Date().toISOString() 
    };
  };

  return {
    statuses,
    isLoading,
    error,
    isConnected,
    getNodeStatus,
    refresh: fetchStatuses,
    nextCheckCountdown,
    totalInterval: appConfig.server.healthCheckInterval,
    isQuerying
  };
};