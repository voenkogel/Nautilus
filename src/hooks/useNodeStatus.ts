import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, TreeNode } from '../types/config';

export interface NodeStatus {
  status: 'online' | 'offline' | 'checking';
  lastChecked: string;
  statusChangedAt?: string; // Timestamp when status last changed
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
      // Only include nodes that have a web GUI for status checking (or where the flag is not set)
      if (node.hasWebGui !== false) {
        const identifier = node.ip || node.url;
        if (identifier) {
          identifiers.push(identifier);
        }
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

    try {
      const response = await fetch('/api/status');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: StatusResponse = await response.json();
      
      if (data && data.statuses) {
        // Compare with previous statuses to detect changes and preserve statusChangedAt
        setStatuses(prevStatuses => {
          const newStatuses: Record<string, NodeStatus> = {};
          const now = new Date().toISOString();
          
          Object.entries(data.statuses).forEach(([nodeId, newStatus]) => {
            const prevStatus = prevStatuses[nodeId];
            
            newStatuses[nodeId] = {
              ...newStatus,
              statusChangedAt: (prevStatus && prevStatus.status === newStatus.status) 
                ? prevStatus.statusChangedAt || now  // Keep existing timestamp if status unchanged
                : now  // Update timestamp if status changed or no previous status
            };
          });
          
          return newStatuses;
        });
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
      setStatuses(prevStatuses => {
        const offlineStatuses: Record<string, NodeStatus> = {};
        const now = new Date().toISOString();
        
        nodeIdentifiers.forEach(id => {
          const prevStatus = prevStatuses[id];
          
          offlineStatuses[id] = {
            status: 'offline',
            lastChecked: now,
            error: 'Server unreachable',
            statusChangedAt: (prevStatus && prevStatus.status === 'offline') 
              ? prevStatus.statusChangedAt || now  // Keep existing timestamp if already offline
              : now  // Update timestamp if status changed to offline
          };
        });
        
        return offlineStatuses;
      });
    } finally {
      // Note: We don't set isQuerying to false here anymore
      // This is now handled by the timer mechanism to ensure clean transitions
      setIsLoading(false);
    }
  }, [appConfig, isConnected]);

  useEffect(() => {
    // Track if the component is mounted
    let isMounted = true;
    
    // Define the polling interval and health check interval
    const healthInterval = appConfig.server?.healthCheckInterval || 20000; // ms
    
    // Initial state
    let currentCountdown = healthInterval / 1000; // Convert to seconds
    setNextCheckCountdown(currentCountdown);
    
    // Function to perform status fetch with query state management
    const performFetch = async () => {
      if (!isMounted) return;
      
      // Set querying state to true before fetch
      setIsQuerying(true);
      
      try {
        // Perform the actual fetch
        await fetchStatuses();
      } catch (error) {
        console.error("Error fetching statuses:", error);
      } finally {
        if (isMounted) {
          // Reset querying state after fetch completes
          setIsQuerying(false);
        }
      }
    };
    
    // Function to handle the countdown
    const runCountdown = () => {
      // Create a precise timer using performance.now()
      let lastTimestamp = performance.now();
      let accumulatedTime = 0;
      const updateInterval = 100; // Update UI every 100ms for smooth animation
      
      const tick = () => {
        if (!isMounted) return;
        
        const now = performance.now();
        const deltaTime = now - lastTimestamp;
        lastTimestamp = now;
        
        // Accumulate time to handle sub-millisecond precision
        accumulatedTime += deltaTime;
        
        // Only update UI when enough time has passed (reduces jitter)
        if (accumulatedTime >= updateInterval) {
          // Convert accumulated ms to seconds
          const decrement = accumulatedTime / 1000;
          accumulatedTime = 0;
          
          // Update countdown
          currentCountdown = Math.max(0, currentCountdown - decrement);
          setNextCheckCountdown(currentCountdown);
          
          // If countdown reached zero, fetch status and reset
          if (currentCountdown === 0) {
            // Perform fetch and then reset the countdown
            performFetch().then(() => {
              if (isMounted) {
                currentCountdown = healthInterval / 1000;
                setNextCheckCountdown(currentCountdown);
              }
            });
          }
        }
        
        // Continue countdown if still mounted
        if (isMounted) {
          requestAnimationFrame(tick);
        }
      };
      
      // Start the animation frame loop
      requestAnimationFrame(tick);
    };
    
    // Start the initial fetch and countdown
    performFetch().then(() => {
      if (isMounted) {
        runCountdown();
      }
    });
    
    // Cleanup function
    return () => {
      isMounted = false;
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