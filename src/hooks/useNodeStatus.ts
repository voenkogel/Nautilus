import { useState, useEffect } from 'react';
import { appConfig, getServerUrl } from '../config/appConfig';

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
    refresh: fetchStatuses
  };
};