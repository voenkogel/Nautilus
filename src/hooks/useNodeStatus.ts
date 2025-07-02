import { useState, useEffect } from 'react';
import configData from '../../config.json';
import type { AppConfig } from '../types/config';

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

  const fetchConfig = async () => {
    try {
      // Use a relative path for API calls. This works in both dev and prod.
      const response = await fetch('/api/config', {
        headers: {
          'Cache-Control': 'no-cache', // Ensure we don't get cached responses
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Only log config fetch issues, not successful fetches
      if (!data) {
        console.error('Empty or invalid config received from server');
      }
      
      // Update appConfig with any dynamic values from the server
      Object.assign(appConfig, data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchStatuses = async () => {
    if (!appConfig) return;
    try {
      // Only log at start of querying phase and don't log per-node status (server already does this)
      const addresses = Object.keys(statuses);
      if (addresses.length > 0) {
        console.log(`🔍 Querying ${addresses.length} addresses...`);
      }
      
      // Use a relative path for API calls.
      const response = await fetch('/api/status', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: StatusResponse = await response.json();
      
      // Check if we have valid status data
      if (data && data.statuses && Object.keys(data.statuses).length > 0) {
        // DIRECT USE: Use the statuses exactly as they come from the API
        // This is the critical fix - we don't normalize on the client side
        setStatuses(data.statuses);
        setIsConnected(true);
        
        // Calculate the last health check time from the most recent lastChecked timestamp
        const lastCheckedTimes = Object.values(data.statuses)
          .map(status => status.lastChecked ? new Date(status.lastChecked).getTime() : 0)
          .filter(time => time > 0);
        
        if (lastCheckedTimes.length > 0) {
          const mostRecent = Math.max(...lastCheckedTimes);
          setLastHealthCheckTime(mostRecent);
        }
      } else {
        console.warn('Received empty or invalid status data from server');
      }
    } catch (err) {
      if (isConnected) {
        console.error('❌ Lost connection to status server:', err instanceof Error ? err.message : 'Unknown error');
      }
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
    const initialize = async () => {
      await fetchConfig();
      await fetchStatuses();
    };
    
    initialize();

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
      
      // When we enter querying phase, "freeze" the countdown at 0 rather than resetting
      // This ensures the progress bar doesn't jump backwards during query
      if (isCurrentlyQuerying && remaining === 0) {
        // We're in the querying phase, keep nextCheckCountdown at 0
        // But don't reset lastHealthCheckTime so the progress calculation stays consistent
      }
      
      if (remaining === 0 && elapsed > appConfig.server.healthCheckInterval + 10000) {
        // If we've been at 0 for more than 10 seconds, something might be wrong
        clearInterval(countdownInterval);
      }
    }, 100);

    return () => clearInterval(countdownInterval);
  }, [lastHealthCheckTime]);

  const getNodeStatus = (identifier: string): NodeStatus => {
    // Use the original identifier directly without normalization
    // because we're matching against the API response keys
    return statuses[identifier] || { 
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