import { useState, useEffect } from 'react';

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

  const fetchStatuses = async () => {
    try {
      console.log('Fetching status from server...');
      const response = await fetch('http://localhost:3001/api/status');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: StatusResponse = await response.json();
      console.log('Received status data:', data);
      setStatuses(data.statuses);
      setError(null);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to fetch node statuses:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
      
      // Set all nodes to offline if we can't reach the status server
      setStatuses(prev => {
        const offlineStatuses: Record<string, NodeStatus> = {};
        // Use some default IPs if prev is empty
        const ips = Object.keys(prev).length > 0 ? Object.keys(prev) : [
          'proxmox.lan:8006',
          'pirate.lan:7878', 
          'pirate.lan:8989'
        ];
        
        ips.forEach(ip => {
          offlineStatuses[ip] = {
            status: 'offline',
            lastChecked: new Date().toISOString(),
            error: 'Status server unreachable'
          };
        });
        return offlineStatuses;
      });
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatuses();

    // Set up polling every 5 seconds (more frequent than the server's 20-second checks)
    const interval = setInterval(fetchStatuses, 5000);

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
    getNodeStatus,
    refresh: fetchStatuses
  };
};
