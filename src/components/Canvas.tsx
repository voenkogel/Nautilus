import { deleteTreeNode } from '../utils/deleteTreeNode';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TreeNode, AppConfig } from '../types/config';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { reorderNode, countDescendants, getNodeSiblingPosition } from '../utils/nodeUtils';
import { useAppearance } from '../hooks/useAppearance';
import Settings from './Settings';
import { NodeEditor } from './NodeEditor';
import EmptyNodesFallback, { createStartingNode } from './EmptyNodesFallback';
import { useToast } from './Toast';
import NetworkScanWindow from './NetworkScanWindow';
import { authenticate, withAuthGuard, getAuthHeaders, hasAuthToken } from '../utils/auth';
import { iconImageCache, iconSvgCache } from '../utils/iconUtils';
import { ConfirmDialog } from './ConfirmDialog';
import { getNodeTargetUrl } from '../utils/nodeUtils';
import { openExternal } from '../utils/openExternal';
import { api, ApiError } from '../utils/apiClient';
import { normalizeConfig } from '../utils/configUtils';
import HistoryModal from './HistoryModal';
import RadialDashboard from './RadialDashboard';

const initialAppConfig: AppConfig = {
  general: {
    title: "Nautilus"
  },
  tree: {
    nodes: []
  },
  server: {
    healthCheckInterval: 20000,
    corsOrigins: ["http://localhost:3070"]
  },
  client: {
    apiPollingInterval: 5000
  }
};

const Canvas: React.FC = () => {
  const { addToast } = useToast();
  const lastOpenTimesRef = useRef<Record<string, number>>({});
  const collapseSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [networkRevision, setNetworkRevision] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Check for recent scan results on initialization (only for authenticated users)
  const [isScanWindowOpen, setIsScanWindowOpen] = useState(false);
  
  const [scanActive, setScanActive] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authAttemptedForCurrentScan, setAuthAttemptedForCurrentScan] = useState(false);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [currentConfig, setCurrentConfig] = useState<AppConfig>(initialAppConfig);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());


  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  
  // State for delete confirmation dialog
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    nodeId: string;
    nodeTitle: string;
    childCount: number;
    onConfirm: () => void;
  } | null>(null);
  

  // State for history modal: null = closed; nodeId null = global view; string = specific node
  const [historyModal, setHistoryModal] = useState<{ nodeId: string | null; nodeName?: string } | null>(null);

  
  // Use the status monitoring hook, now passing the live config
  const { 
    statuses, 
    isLoading, 
    error, 
    isConnected,
    forceRefresh
  } = useNodeStatus(currentConfig);

  // Apply appearance settings
  useAppearance(currentConfig);

  // Reusable function to fetch config with auth headers
  const loadConfig = useCallback(async () => {
    try {
      // api.get sends auth headers automatically (returns admin config when logged in)
      const serverConfig = await api.get<AppConfig>('api/config');

      // Merge server config over the local defaults (utils/configUtils)
      const completeConfig = normalizeConfig(serverConfig, initialAppConfig);

      setCurrentConfig(completeConfig);

      // Initialize collapsed state from config
      const collapsedIds = new Set<string>();
      const traverse = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.collapsed) collapsedIds.add(node.id);
          if (node.children) traverse(node.children);
        });
      };
      traverse(completeConfig.tree.nodes);
      setCollapsedNodeIds(collapsedIds);
    } catch (error) {
      console.warn('Failed to fetch config from server, using default:', error);
      setCurrentConfig(initialAppConfig);
      addToast({
        type: 'error',
        message: error instanceof ApiError
          ? 'Could not load configuration from the server — showing defaults. Changes may not reflect the live config.'
          : 'Cannot reach the Nautilus server — showing default configuration. Check that the server is running.',
        duration: 6000
      });
    }
  }, [addToast]);

  // Wrapper function to handle authentication with state tracking
  const authenticateWithState = async (): Promise<boolean> => {
    if (isAuthenticating) {
      console.log('🔄 Authentication already in progress, skipping');
      return false;
    }
    
    setIsAuthenticating(true);
    try {
      const result = await authenticate();
      if (result) {
        // Refresh config after successful login to get sensitive data (like internal IPs)
        await loadConfig();
      }
      return result;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Fetch current config from server on mount
  useEffect(() => {
    const fetchCurrentConfig = async () => {
      await loadConfig();
    };

    const checkScanStatus = async () => {
      try {
        // Only check scan status if user is already authenticated
        // This avoids authentication errors on page load for unauthenticated users
        if (!hasAuthToken()) {
          console.debug('Skipping scan status check - user not authenticated');
          return;
        }
        
        const response = await fetch('api/network-scan/progress', {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const scanData = await response.json();
          // If there's an active scan, open the scan window
          if (scanData.status === 'scanning') {
            console.log('Detected active scan on page load, reopening scan window');
            setIsScanWindowOpen(true);
            setScanActive(true);
          }
        } else if (response.status === 401) {
          // Authentication failed - token might be expired
          console.debug('Authentication failed during scan status check - token may be expired');
        }
      } catch (error) {
        // Scan status check is optional, don't log errors
        console.debug('No active scan detected on page load:', error);
      }
    };

    fetchCurrentConfig();
    checkScanStatus();
  }, [loadConfig]);

  // Check for recent scan results or active scan and restore scan window
  useEffect(() => {
    const checkAndRestoreScanWindow = async () => {
      // First check for recent scan results in localStorage
      try {
        const savedResults = localStorage.getItem('networkScanResults');
        if (savedResults) {
          const parsedResults = JSON.parse(savedResults);
          // Check if results are recent (within last 10 minutes for completed scans)
          const now = Date.now();
          const resultAge = now - (parsedResults.timestamp || 0);
          const maxAge = 10 * 60 * 1000; // 10 minutes in milliseconds
          
          if (resultAge < maxAge) {
            // Require authentication before showing scan results
            const isAuth = await authenticateWithState();
            if (isAuth) {
              setIsScanWindowOpen(true);
            }
            return; // Found recent results, no need to check scan status
          }
        }
      } catch (err) {
        console.warn('Failed to check saved scan results:', err);
      }

      // If no recent results, check if there's an active scan
      // Use public status endpoint (no auth required) - works for everyone
      try {
        console.log('🔍 Checking scan status on page load...');
        const response = await fetch('api/network-scan/status');
        console.log('📡 Scan status response:', response.status, response.ok);
        
        if (response.ok) {
          const scanData = await response.json();
          console.log('📊 Scan data received:', scanData);
          if (scanData.active) {
            console.log('✅ Detected active scan on page load, opening scan window');
            // Require authentication before showing active scan
            const isAuth = await authenticateWithState();
            if (isAuth) {
              setIsScanWindowOpen(true);
              setScanActive(true);
            }
          } else if (scanData.hasRecentResults) {
            console.log('📋 Detected recent completed scan results on server, opening scan window');
            // Require authentication before showing recent results
            const isAuth = await authenticateWithState();
            if (isAuth) {
              setIsScanWindowOpen(true);
              setScanActive(false); // Not actively scanning, just showing results
            }
          } else {
            console.log('❌ No active scan or recent results detected on page load');
          }
        } else {
          console.warn('⚠️ Scan status endpoint returned non-OK status:', response.status);
        }
      } catch (error) {
        // Scan status check failed, but don't show errors for this
        console.warn('❌ Could not check scan status on page load:', error);
      }
    };

    checkAndRestoreScanWindow();
  }, []);

  // Continuously poll for scan activity and automatically open scan window
  useEffect(() => {
    let pollInterval: number | null = null;
    
    const checkScanActivity = async () => {
      // Only check if scan window is not already open
      if (isScanWindowOpen) {
        // Reset auth attempt flag when scan window is open
        if (authAttemptedForCurrentScan) {
          setAuthAttemptedForCurrentScan(false);
        }
        return;
      }

      try {
        // Use public status endpoint (no auth required) - works for everyone
        console.log('🔄 Polling for scan activity...');
        const response = await fetch('api/network-scan/status');
        console.log('📡 Poll response:', response.status, response.ok);
        
        if (response.ok) {
          const scanData = await response.json();
          console.log('📊 Poll scan data:', scanData);
          if (scanData.active) {
            // Only attempt authentication if we haven't already tried for this scan session
            if (!authAttemptedForCurrentScan && !isAuthenticating) {
              console.log('✅ Detected active scan during polling, attempting authentication');
              setAuthAttemptedForCurrentScan(true); // Mark that we've attempted auth
              // Require authentication before showing scan results
              const isAuthenticated = await authenticateWithState();
              if (isAuthenticated) {
                setIsScanWindowOpen(true);
                setScanActive(true);
              }
            } else if (authAttemptedForCurrentScan) {
              console.log('🔄 Active scan detected but authentication already attempted for this scan');
            } else if (isAuthenticating) {
              console.log('🔄 Active scan detected but authentication already in progress');
            }
          } else {
            // No active scan - reset the auth attempt flag for the next scan
            if (authAttemptedForCurrentScan) {
              console.log('🔄 No active scan detected, resetting auth attempt flag');
              setAuthAttemptedForCurrentScan(false);
            }
          }
        }
      } catch (error) {
        // Silent fail - scan status polling is optional
        console.warn('❌ Scan activity polling failed:', error);
      }
    };

    // Start polling after a short delay to avoid overlap with initial check
    const initialDelay = setTimeout(() => {
      // Check immediately after delay
      checkScanActivity();
      
      // Set up frequent polling every 2 seconds for maximum responsiveness
      pollInterval = setInterval(checkScanActivity, 2000);
    }, 1000);

    return () => {
      clearTimeout(initialDelay);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isScanWindowOpen, authAttemptedForCurrentScan, isAuthenticating]); // Re-run when scan window state changes

  // Listen for config updates from scan window
  useEffect(() => {
    const handleConfigUpdate = async () => {
      try {
        const response = await fetch('api/config', { headers: getAuthHeaders() });
        if (response.ok) {
          const serverConfig = await response.json();
          
          // Merge server config over the local defaults (utils/configUtils)
          const completeConfig = normalizeConfig(serverConfig, initialAppConfig);
          
          setCurrentConfig(completeConfig);
        }
      } catch (error) {
        console.warn('Failed to refresh config:', error);
      }
    };

    const handleCanvasRefresh = () => {
      // Force a re-render by triggering a config refresh
      setCurrentConfig(prev => ({ ...prev }));
    };

    const handleOpenScanWindow = () => {
      setIsScanWindowOpen(true);
      setScanActive(false); // Reset scan active state for new scan
    };

    const handleCloseScanWindow = () => {
      setIsScanWindowOpen(false);
      setScanActive(false);
    };

    window.addEventListener('configUpdated', handleConfigUpdate);
    window.addEventListener('refreshCanvas', handleCanvasRefresh);
    window.addEventListener('openScanWindow', handleOpenScanWindow);
    window.addEventListener('closeScanWindow', handleCloseScanWindow);

    return () => {
      window.removeEventListener('configUpdated', handleConfigUpdate);
      window.removeEventListener('refreshCanvas', handleCanvasRefresh);
      window.removeEventListener('openScanWindow', handleOpenScanWindow);
      window.removeEventListener('closeScanWindow', handleCloseScanWindow);
    };
  }, []);

  // Helper function to find a node by ID in the tree
  const findNodeById = useCallback((nodes: TreeNode[], nodeId: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const handleSaveConfig = async (newConfig: AppConfig) => {
    newConfig = normalizeConfig(newConfig, initialAppConfig);
    // Send the config to the server to update the config.json file.
    try {
      await api.post('api/config', newConfig);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw new Error('Authentication required. Please log in again.', { cause: err });
      }
      throw err;
    }

    setCurrentConfig(normalizeConfig(newConfig, initialAppConfig));

    // Re-fetch through the SAME path as the initial load (api.get +
    // normalizeConfig) so the stored config gets the default section-merge; a
    // raw fetch here left save state diverging from load (missing
    // server/client/appearance defaults). Best-effort: a failed re-fetch must
    // not undo the successful save.
    try {
      const serverConfig = await api.get<AppConfig>('api/config');
      setCurrentConfig(normalizeConfig(serverConfig, initialAppConfig));

      // Clear icon caches when config changes to force reload of icons with new colors/content
      iconImageCache.clear();
      iconSvgCache.clear();
    } catch (err) {
      console.warn('Config saved but re-fetch failed:', err);
    }
  };

  const handleRestoreConfig = async (newConfig: AppConfig) => {
    await collapseSaveQueue.current;
    newConfig = normalizeConfig(newConfig, initialAppConfig);
    // Send the config to the server with replace mode for complete restoration.
    try {
      await api.post('api/config?replace=true', newConfig);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw new Error('Authentication required. Please log in again.', { cause: err });
      }
      throw err;
    }

    // A successful POST is authoritative even if the follow-up GET fails.
    let restoredConfig = normalizeConfig(newConfig, initialAppConfig);
    try {
      restoredConfig = normalizeConfig(await api.get<AppConfig>('api/config'), initialAppConfig);
    } catch (err) {
      console.warn('Config restored but re-fetch failed:', err);
    }
    setCurrentConfig(restoredConfig);
    const restoredFolds = new Set<string>();
    const collectFolds = (nodes: TreeNode[]) => nodes.forEach(node => {
      if (node.collapsed) restoredFolds.add(node.id);
      collectFolds(node.children ?? []);
    });
    collectFolds(restoredConfig.tree.nodes);
    setCollapsedNodeIds(restoredFolds);
    setIsEditMode(false);
    setNetworkRevision(value => value + 1);
    iconImageCache.clear();
    iconSvgCache.clear();
  };

  const handleLoadConfig = async (newConfig: AppConfig) => {
    try {
      // Authenticate before loading config
      const isAuth = await authenticate();
      if (!isAuth) {
        addToast({
          type: 'error',
          message: 'Authentication required to restore backup',
          duration: 5000
        });
        throw new Error('Authentication required to restore backup');
      }

      // Show loading feedback
      addToast({
        type: 'info',
        message: 'Restoring backup configuration...',
        duration: 2000
      });

      // Save the loaded config to the server using replace mode
      await handleRestoreConfig(newConfig);
      
      // Show success feedback
      addToast({
        type: 'success',
        message: `Backup restored successfully! Loaded ${newConfig.tree.nodes.length} nodes.`,
        duration: 4000
      });
      
      // Config is already updated by handleSaveConfig, no need to set it again
    } catch (error) {
      console.error('Failed to restore backup:', error);
      
      // Show error feedback
      const errorMessage = error instanceof Error ? error.message : 'Failed to restore backup';
      addToast({
        type: 'error',
        message: `Backup restore failed: ${errorMessage}`,
        duration: 6000
      });
      
      // Re-throw to let the EmptyNodesFallback handle the error display
      throw error;
    }
  };
  
  const handleEditChildNode = withAuthGuard(async (childNode: TreeNode) => {
    // Create a safe copy of the child node before setting it
    // Note: The current node should already be saved by the NodeEditor before calling this
    try {
      const nodeCopy = JSON.parse(JSON.stringify(childNode));
      setTimeout(() => {
        setEditingNode(nodeCopy);
      }, 10);
    } catch (error) {
      console.error("JSON serialization failed in handleEditChildNode:", error);
      // Fallback to a simpler manual copy
      const basicCopy = {
        ...childNode,
        children: childNode.children ? [...childNode.children] : []
      };
      setTimeout(() => {
        setEditingNode(basicCopy);
      }, 10);
    }
  });

  /** Appends a new node beneath `parentNodeId`, or at the top level (under Home lab) when it is null. */
  const handleAddChildNode = withAuthGuard(async (parentNodeId: string | null) => {
    const newNode: TreeNode = {
      id: `node_${Date.now()}`,
      title: "New Node",
      subtitle: "New subtitle",
      type: "square",
      children: []
    };

    // Add to config
    const newConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep copy
    const parentNode = parentNodeId ? findNodeById(newConfig.tree.nodes, parentNodeId) : null;

    if (parentNode || !parentNodeId) {
      if (!parentNode) newConfig.tree.nodes.push(newNode);
      else {
        if (!parentNode.children) {
          parentNode.children = [];
        }
        parentNode.children.push(newNode);
      }

      // If parent was collapsed, expand it
      if (parentNodeId && collapsedNodeIds.has(parentNodeId)) {
        setCollapsedNodeIds(prev => {
          const next = new Set(prev);
          next.delete(parentNodeId);
          return next;
        });
      }

      // Save config
      try {
        await handleSaveConfig(newConfig);
        
        // Trigger immediate status check for the new node
        forceRefresh();
        
        addToast({
          type: 'success',
          message: 'Child node added successfully',
          duration: 2000
        });
      } catch (error) {
        console.error('Error adding child node:', error);
        addToast({
          type: 'error',
          message: `Failed to add child node: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 5000
        });
      }
    }
  });

  const handleOpenSettings = withAuthGuard(() => {
    setIsSettingsOpen(true);
  });

  const beginInspectorEdit = async (nodeId: string): Promise<TreeNode | null> => {
    if (!await authenticateWithState()) return null;
    const latest = normalizeConfig(await api.get<AppConfig>('api/config'), initialAppConfig);
    setCurrentConfig(latest);
    const node = findNodeById(latest.tree.nodes, nodeId);
    if (!node) throw new Error('This node no longer exists. Refresh the network.');
    return structuredClone(node);
  };

  const handleSaveNode = async (updatedNode: TreeNode) => {
    // Helper function to update node in the tree
    const updateNodeInTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === updatedNode.id) {
          return updatedNode;
        }
        if (node.children) {
          return {
            ...node,
            children: updateNodeInTree(node.children)
          };
        }
        return node;
      });
    };

    const newConfig = {
      ...currentConfig,
      tree: {
        ...currentConfig.tree,
        nodes: updateNodeInTree(currentConfig.tree.nodes)
      }
    };

    try {
      await handleSaveConfig(newConfig);
      setEditingNode(null);
      // Trigger immediate status check for the updated node
      forceRefresh();
      addToast({
        type: 'success',
        message: 'Node saved successfully',
        duration: 2000
      });
    } catch (error) {
      console.error('Error saving node:', error);
      addToast({
        type: 'error',
        message: `Failed to save node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000
      });
      throw error;
    }
  };

  // Core delete function (does the actual deletion with animation)
  const performDeleteNode = async (nodeId: string) => {
    // Helper function to remove node from the tree
    const removeNodeFromTree = (nodes: TreeNode[], nodeIdToRemove: string): TreeNode[] => {
      return nodes.filter(node => {
        if (node.id === nodeIdToRemove) {
          return false;
        }
        if (node.children) {
          node.children = removeNodeFromTree(node.children, nodeIdToRemove);
        }
        return true;
      });
    };

    const newConfig = {
      ...currentConfig,
      tree: {
        ...currentConfig.tree,
        nodes: removeNodeFromTree(structuredClone(currentConfig.tree.nodes), nodeId)
      }
    };

    try {
      await handleSaveConfig(newConfig);
      if (editingNode?.id === nodeId) {
        setEditingNode(null);
      }
      // Trigger immediate status check to update removed node
      forceRefresh();
    } catch (error) {
      console.error('Error deleting node:', error);
      throw error;
    }
  };

  const handleDeleteNode = async () => {
    if (!editingNode) return;

    const childCount = countDescendants(editingNode);
    
    const doDelete = async () => {
      try {
        await performDeleteNode(editingNode.id); // Skip animation for editor delete
        setDeleteConfirmation(null);
        addToast({
          type: 'success',
          message: 'Node deleted successfully',
          duration: 2000
        });
      } catch (error) {
        addToast({
          type: 'error',
          message: `Failed to delete node: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 5000
        });
      }
    };

    if (childCount > 0) {
      // Show confirmation dialog for nodes with children
      setDeleteConfirmation({
        isOpen: true,
        nodeId: editingNode.id,
        nodeTitle: editingNode.title,
        childCount,
        onConfirm: doDelete
      });
    } else {
      // Delete directly if no children
      await doDelete();
    }
  };

  // Refresh before a destructive edit so concurrent moves or new children survive.
  const handleInspectorDelete = async (nodeId: string, keepChildren: boolean) => {
    await collapseSaveQueue.current;
    if (!await authenticate()) throw new Error('Sign in to delete this node.');
    const latest = normalizeConfig(await api.get<AppConfig>('api/config'), initialAppConfig);
    await handleSaveConfig({ ...latest, tree: { ...latest.tree, nodes: deleteTreeNode(latest.tree.nodes, nodeId, keepChildren) } });
    forceRefresh();
    addToast({ type: 'success', message: keepChildren ? 'Node deleted; children moved to its parent.' : 'Node deleted.', duration: 3000 });
  };

  // Handle creating a starting node when there are no nodes
  const handleCreateStartingNode = withAuthGuard(async () => {
    try {
      const startingNode = createStartingNode();
      const newConfig: AppConfig = {
        ...currentConfig,
        tree: {
          ...currentConfig.tree,
          nodes: [startingNode]
        }
      };

      await handleSaveConfig(newConfig);
      
      // Trigger immediate status check for the new node
      forceRefresh();
      
      // Open the edit window for the newly created node
      setEditingNode(startingNode);
    } catch (error) {
      console.error('Error creating starting node:', error);
      // Error will be shown in the UI by handleSaveConfig
    }
  });
  
  const openNodeUrl = useCallback((node: TreeNode) => {
    const targetUrl = getNodeTargetUrl(node);
    
    if (targetUrl) {
      const now = Date.now();
      const lastOpenKey = `lastOpen_${node.id}`;
      const lastOpenTime = lastOpenTimesRef.current[lastOpenKey] || 0;
      if (now - lastOpenTime > 1000) { // 1 second debounce
        lastOpenTimesRef.current[lastOpenKey] = now;
        openExternal(targetUrl);
      }
    }
    // If no URL or IP with web GUI, do nothing (node is not clickable)
  }, []);

  // Handle node reordering via drag and drop
  const handleNodeReorder = useCallback(async (nodeId: string, newParentId: string | null, insertIndex: number) => {
    try {
      const newNodes = reorderNode(currentConfig.tree.nodes, nodeId, newParentId, insertIndex);
      const newConfig = {
        ...currentConfig,
        tree: {
          ...currentConfig.tree,
          nodes: newNodes
        }
      };
      
      await handleSaveConfig(newConfig);
      
      addToast({
        type: 'success',
        message: 'Node rearranged successfully',
        duration: 2000
      });
    } catch (error) {
      console.error('Error reordering node:', error);
      addToast({
        type: 'error',
        message: 'Failed to rearrange node',
        duration: 4000
      });
      throw error;
    }
  }, [currentConfig, addToast]);

  // Keyboard reorder (A11Y-3): move a focused node earlier/later among its siblings.
  const handleKeyboardReorder = useCallback(async (nodeId: string, direction: 'up' | 'down') => {
    const pos = getNodeSiblingPosition(currentConfig.tree.nodes, nodeId);
    if (!pos) return;
    const { parentId, index, siblingCount } = pos;
    try {
      if (direction === 'up' && index > 0) {
        await handleNodeReorder(nodeId, parentId, index - 1);
      } else if (direction === 'down' && index < siblingCount - 1) {
        await handleNodeReorder(nodeId, parentId, index + 2);
      }
    } catch { /* The reorder handler already reports the failed save. */ }
  }, [currentConfig, handleNodeReorder]);

  // Handle expanding/collapsing nodes with optional persistence
  const toggleNodeCollapse = async (nodeId: string, isCollapsed: boolean) => {
    // 1. Update Local UI State immediately for responsiveness
    setCollapsedNodeIds(prev => {
      const next = new Set(prev);
      if (isCollapsed) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      return next;
    });

    // 2. If Admin, Persist to Config
    // A stored token only indicates intent to persist; validate it before writing.
    if (hasAuthToken()) {
      const save = collapseSaveQueue.current.then(async () => {
        // A previous queued toggle may have cancelled reauthentication.
        if (!hasAuthToken()) return;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!await authenticate()) return;
          try {
            // Serialize rapid toggles and apply each one to the latest stored config.
            const latest = normalizeConfig(await api.get<AppConfig>('api/config'), initialAppConfig);
            const updateNodes = (nodes: TreeNode[]): TreeNode[] => {
              return nodes.map(node => {
                if (node.id === nodeId) {
                  return { ...node, collapsed: isCollapsed };
                }
                if (node.children) {
                  return { ...node, children: updateNodes(node.children) };
                }
                return node;
              });
            };

            const newConfig = {
              ...latest,
              tree: {
                ...latest.tree,
                nodes: updateNodes(latest.tree.nodes)
              }
            };
        
            await handleSaveConfig(newConfig);
            return;
          } catch (error) {
            const cause = error instanceof Error ? error.cause : undefined;
            const authFailure = error instanceof ApiError && error.status === 401 || cause instanceof ApiError && cause.status === 401;
            if (!authFailure || attempt > 0) throw error;
            // The backend may have restarted between validation and POST.
            // Retry from authentication and a fresh config, never from a masked snapshot.
          }
        }
      });
      collapseSaveQueue.current = save.catch(error => {
        console.error('Failed to save collapse state:', error);
        addToast({ type: 'error', message: 'Collapse preference could not be saved. Your local view is preserved; toggle the branch to retry.', duration: 6000 });
        // We don't revert the UI state because the user still wants it collapsed locally
      });
      await collapseSaveQueue.current;
    }
  };

  return (
    <div className="app-surface">
      <RadialDashboard key={networkRevision}
        config={currentConfig} statuses={statuses} connected={isConnected} loading={isLoading}
        error={error}
        collapsed={collapsedNodeIds} editMode={isEditMode} onCollapse={toggleNodeCollapse}
        onEditMode={async () => { if (isEditMode) setIsEditMode(false); else if (await authenticateWithState()) setIsEditMode(true); }}
        onSettings={handleOpenSettings} onHistory={() => setHistoryModal({ nodeId: null })}
        onRefresh={forceRefresh} onOpen={openNodeUrl} onEdit={beginInspectorEdit} onSaveNode={handleSaveNode}
        onAdd={handleAddChildNode} onDelete={handleInspectorDelete} onMove={handleNodeReorder}
        onOrder={handleKeyboardReorder}
        empty={<EmptyNodesFallback onCreateStartingNode={handleCreateStartingNode} appConfig={currentConfig} onRestoreConfig={handleLoadConfig} />}
      />
      {/* Settings Modal - Rendered at root level for full page overlay */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialConfig={currentConfig}
        onSave={handleSaveConfig}
        onRestore={handleRestoreConfig}
      />

      {/* Network Scan Window */}
      {isScanWindowOpen && (
        <NetworkScanWindow
          appConfig={currentConfig}
          scanActive={scanActive}
          setScanActive={(active) => {
            setScanActive(active);
            if (!active) {
              setIsScanWindowOpen(false);
              // Reset auth attempt flag when scan ends
              setAuthAttemptedForCurrentScan(false);
            } else {
              // Reset auth attempt flag when new scan starts
              setAuthAttemptedForCurrentScan(false);
            }
          }}
        />
      )}

      {/* Node Editor Modal */}
      {editingNode && (
        <NodeEditor
          node={editingNode}
          onSave={handleSaveNode}
          onClose={() => setEditingNode(null)}
          onDelete={handleDeleteNode}
          onEditChild={handleEditChildNode}
        />
      )}

      {/* History Modal */}
      {historyModal && (
        <HistoryModal
          nodeId={historyModal.nodeId}
          nodeName={historyModal.nodeName}
          appConfig={currentConfig}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation && (
        <ConfirmDialog
          isOpen={deleteConfirmation.isOpen}
          title="Delete Node with Children"
          message={`"${deleteConfirmation.nodeTitle}" has ${deleteConfirmation.childCount} child node${deleteConfirmation.childCount > 1 ? 's' : ''}. Deleting this node will also delete all its children. This action cannot be undone.`}
          confirmLabel="Delete All"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={deleteConfirmation.onConfirm}
          onCancel={() => setDeleteConfirmation(null)}
        />
      )}
    </div>
  );
};

export default Canvas;
