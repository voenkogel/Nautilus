import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, NodeStatus } from '../types/config';
import { extractMonitoredNodeIds } from '../utils/nodeUtils';
import { api } from '../utils/apiClient';

// Re-exported so existing `import { NodeStatus } from '../hooks/useNodeStatus'` keeps working.
export type { NodeStatus };

export interface StatusResponse {
  timestamp: string;
  statuses: Record<string, NodeStatus>;
}

// True when two node statuses are field-for-field identical. Used to skip
// re-renders when a poll returns the same data (the common case between
// health-check cycles, when no node's lastChecked/status has changed).
const isSameStatus = (a?: NodeStatus, b?: NodeStatus): boolean => {
  if (!a || !b) return a === b;
  return a.status === b.status
    && a.lastChecked === b.lastChecked
    && a.statusChangedAt === b.statusChangedAt
    && a.responseTime === b.responseTime
    && a.error === b.error
    && a.streams === b.streams
    && a.version === b.version
    && a.motd === b.motd
    && a.favicon === b.favicon
    && a.players?.online === b.players?.online
    && a.players?.max === b.players?.max;
};

const statusMapsEqual = (
  a: Record<string, NodeStatus>,
  b: Record<string, NodeStatus>
): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(k => isSameStatus(a[k], b[k]));
};

export const useNodeStatus = (appConfig: AppConfig) => {
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [nextCheckCountdown, setNextCheckCountdown] = useState<number>(0);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  
  // Use a ref to store the performFetch function so it can be called externally
  const performFetchRef = useRef<(() => Promise<void>) | null>(null);

  // Mirror isConnected into a ref so fetchStatuses can read the latest value
  // WITHOUT listing isConnected in its deps. Otherwise every connect/disconnect
  // flip changed fetchStatuses' identity, which tore down and restarted the
  // entire polling effect (countdown reset + immediate refetch) on each flap.
  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  const fetchStatuses = useCallback(async () => {
    if (!appConfig || !appConfig.tree.nodes) return;

    const nodeIdentifiers = extractMonitoredNodeIds(appConfig.tree.nodes);
    if (nodeIdentifiers.length === 0) {
      setStatuses({});
      setIsConnected(true);
      return;
    }

    try {
      const data = await api.get<StatusResponse>('/api/status');

      if (data && data.statuses) {
        // Compare with previous statuses to detect changes and preserve statusChangedAt
        setStatuses(prev => {
          const newStatuses: Record<string, NodeStatus> = {};

          Object.entries(data.statuses).forEach(([nodeId, newStatus]) => {
            // Always use server-provided statusChangedAt when available
            // Server timestamps are authoritative for status duration tracking
            newStatuses[nodeId] = {
              ...newStatus,
              statusChangedAt: newStatus.statusChangedAt || new Date().toISOString()
            };
          });

          // Skip the state update (and the canvas-wide re-render it triggers)
          // when nothing changed since the last poll.
          return statusMapsEqual(prev, newStatuses) ? prev : newStatuses;
        });
        setIsConnected(true);
      } else {
        console.warn('Received empty or invalid status data from server');
      }
    } catch (err) {
      if (isConnectedRef.current) {
        console.error('❌ Lost connection to status server:', err instanceof Error ? err.message : 'Unknown error');
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnected(false);
      
      // When the server is unreachable, mark all nodes as offline
      setStatuses(prevStatuses => {
        const offlineStatuses: Record<string, NodeStatus> = {};
        const now = new Date().toISOString();

        nodeIdentifiers.forEach((id: string) => {
          const prevStatus = prevStatuses[id];
          const wasOffline = prevStatus && prevStatus.status === 'offline';

          offlineStatuses[id] = {
            status: 'offline',
            // Once a node is already shown offline, keep its prior timestamps so
            // the object stays byte-for-byte stable across polls — otherwise a
            // fresh `lastChecked` every cycle defeats the equality check below
            // and re-renders the whole canvas on each poll while the server is
            // down.
            lastChecked: wasOffline ? (prevStatus.lastChecked || now) : now,
            error: 'Server unreachable',
            statusChangedAt: wasOffline
              ? prevStatus.statusChangedAt || now  // Keep existing timestamp if already offline
              : now  // Update timestamp if status changed to offline
          };
        });

        // Skip the state update (and the canvas-wide re-render) when every node
        // is already in this offline state — mirrors the success path's de-dupe.
        return statusMapsEqual(prevStatuses, offlineStatuses) ? prevStatuses : offlineStatuses;
      });
    } finally {
      // Note: We don't set isQuerying to false here anymore
      // This is now handled by the timer mechanism to ensure clean transitions
      setIsLoading(false);
    }
  }, [appConfig]);

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
    
    // Store the performFetch function in ref so it can be called externally
    performFetchRef.current = performFetch;
    
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

  const getNodeStatus = useCallback((nodeId: string): NodeStatus => {
    const status = statuses[nodeId];
    if (status) {
      return status;
    }
    
    // Fallback for nodes not found in status map
    const now = new Date().toISOString();
    return {
      status: 'checking',
      lastChecked: now,
      statusChangedAt: now,
    };
  }, [statuses]);

  const forceRefresh = useCallback(async () => {
    // Call performFetch directly for immediate status update
    if (performFetchRef.current) {
      await performFetchRef.current();
    }
  }, []);

  return { 
    statuses, 
    isLoading, 
    error, 
    isConnected, 
    nextCheckCountdown, 
    totalInterval: appConfig.server?.healthCheckInterval || 20000,
    isQuerying,
    getNodeStatus,
    forceRefresh
  };
};