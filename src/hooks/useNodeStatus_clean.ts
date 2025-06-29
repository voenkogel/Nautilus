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
      
      // First test if server is reachable
      try {
        const testResponse = await fetch('http://localhost:3001/api/test');
        if (testResponse.ok) {
          const testData = await testResponse.json();
          console.log('Server test successful:', testData);
        }
      } catch (testErr) {
        console.log('Server test failed, continuing with status check...');
      }
      
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
      setStatuses({
        'proxmox.lan:8006': {
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: 'Status server unreachable'
        },
        'pirate.lan:7878': {
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: 'Status server unreachable'
        },
        'pirate.lan:8989': {
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: 'Status server unreachable'
        }
      });
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatuses();

    // Set up polling every 5 seconds
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
