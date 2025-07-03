import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, TreeNode } from '../types/config';

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

export const useNodeStatus = (appConfig: AppConfig) => {
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [nextCheckCountdown, setNextCheckCountdown] = useState<number>(0);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);

  const fetchStatuses = useCallback(async () => {
    if (!appConfig || !appConfig.tree.nodes) return;

    const nodeIdentifiers = extractAllNodeIdentifiers(appConfig.tree.nodes);
    if (nodeIdentifiers.length === 0) {
      setStatuses({});
      setIsConnected(true);
      return;
    }

    setIsQuerying(true);

    try {
      const response = await fetch('/api/status');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: StatusResponse = await response.json();
      
      if (data && data.statuses) {
        setStatuses(data.statuses);
        setIsConnected(true);
      } else {
        console.warn('Received empty or invalid status data from server');
      }
    } catch (err) {
      if (isConnected) {
        console.error('❌ Lost connection to status server:', err instanceof Error ? err.message : 'Unknown error');
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnected(false);
      
      // When the server is unreachable, mark all nodes as offline
      const offlineStatuses: Record<string, NodeStatus> = {};
      nodeIdentifiers.forEach(id => {
        offlineStatuses[id] = {
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: 'Server unreachable'
        };
      });
      setStatuses(offlineStatuses);
    } finally {
      setIsQuerying(false);
      setIsLoading(false);
    }
  }, [appConfig, isConnected]);

  useEffect(() => {
    // Initial fetch
    fetchStatuses();

    const apiInterval = appConfig.client?.apiPollingInterval || 5000;
    const healthInterval = appConfig.server?.healthCheckInterval || 20000;
    const timer = setInterval(fetchStatuses, apiInterval);

    // Countdown timer logic - show countdown for health check interval with smooth progress
    let countdown = healthInterval / 1000;
    setNextCheckCountdown(countdown);
    const countdownTimer = setInterval(() => {
      countdown -= 0.1; // Update every 100ms for smooth animation
      if (countdown <= 0) {
        countdown = healthInterval / 1000;
      }
      setNextCheckCountdown(countdown);
    }, 100); // Update every 100ms

    return () => {
      clearInterval(timer);
      clearInterval(countdownTimer);
    };
  }, [appConfig, fetchStatuses]);

  const getNodeStatus = useCallback((identifier: string): NodeStatus => {
    return statuses[identifier] || {
      status: 'checking',
      lastChecked: new Date().toISOString(),
    };
  }, [statuses]);

  return { 
    statuses, 
    isLoading, 
    error, 
    isConnected, 
    nextCheckCountdown, 
    totalInterval: appConfig.server?.healthCheckInterval || 20000,
    isQuerying,
    getNodeStatus 
  };
};