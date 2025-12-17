import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TreeNode, AppConfig } from '../types/config';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getVisibleTree, reorderNode, countDescendants } from '../utils/nodeUtils';
import { useAppearance } from '../hooks/useAppearance';
import StatusCard from './StatusCard';
import Settings from './Settings';
import { NodeEditor } from './NodeEditor';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import MobileNodeList from './MobileNodeList';
import EmptyNodesFallback from './EmptyNodesFallback';
import { createStartingNode } from './EmptyNodesFallback';
import { useToast } from './Toast';
import NetworkScanWindow from './NetworkScanWindow';
import { authenticate, getAuthHeaders, hasAuthToken } from '../utils/auth';
import { 
  iconImageCache, 
  iconSvgCache
} from '../utils/iconUtils';
import { ConfirmDialog } from './ConfirmDialog';
import { 
  calculateTreeLayout, 
  type PositionedNode, 
  type Connection,
  NODE_WIDTH,
  SIBLING_SPACING
} from '../utils/layoutUtils';
import { getNodeTargetUrl } from '../utils/nodeUtils';
import CanvasNode from './CanvasNode';
import DragGhost from './DragGhost';
import { useDragReorder } from '../hooks/useDragReorder';

const initialAppConfig: AppConfig = {
  general: {
    title: "Nautilus",
    openNodesAsOverlay: true
  },
  appearance: {
    // Removed title from appearance config
    accentColor: "#3b82f6",
    backgroundImage: "",
    favicon: "",
    logo: ""
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
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [transform, setTransform] = useState({
    x: 0,
    y: 0,
    scale: 1
  });
  
  const [initialTransform, setInitialTransform] = useState({
    x: 0,
    y: 0,
    scale: 1
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Check for recent scan results on initialization (only for authenticated users)
  const [isScanWindowOpen, setIsScanWindowOpen] = useState(false);
  
  const [scanActive, setScanActive] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authAttemptedForCurrentScan, setAuthAttemptedForCurrentScan] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(undefined);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [currentConfig, setCurrentConfig] = useState<AppConfig>(initialAppConfig);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  
  // State to track which parent node's connection is being hovered (for collapse button)
  const [hoveredConnectionParentId, setHoveredConnectionParentId] = useState<string | null>(null);
  
  // State to track newly added node for animation
  const [newlyAddedNodeId, setNewlyAddedNodeId] = useState<string | null>(null);
  
  // State to track nodes being animated (for expand/collapse and delete)
  const [expandingNodeIds, setExpandingNodeIds] = useState<Set<string>>(new Set());
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  
  // State for delete confirmation dialog
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    nodeId: string;
    nodeTitle: string;
    childCount: number;
    onConfirm: () => void;
  } | null>(null);
  
  // Use device detection
  const { isMobile } = useDeviceDetection();
  
  // State for mobile iframe overlay
  const [iframeOverlay, setIframeOverlay] = useState<{ url: string; title: string } | null>(null);

  // Helper to get app title from config
  const appTitle = currentConfig.general?.title || 'External Site';
  
  // Use the status monitoring hook, now passing the live config
  const { 
    statuses, 
    isLoading, 
    error, 
    isConnected, 
    nextCheckCountdown, 
    totalInterval,
    isQuerying,
    getNodeStatus,
    forceRefresh
  } = useNodeStatus(currentConfig);

  // Apply appearance settings
  useAppearance(currentConfig);

  // Reusable function to fetch config with auth headers
  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/config', {
        headers: getAuthHeaders() // Include auth headers to get sensitive data if logged in
      });
      if (response.ok) {
        const serverConfig = await response.json();
        
        // Ensure we always have a complete config with proper defaults
        const completeConfig = {
          ...initialAppConfig,
          ...serverConfig,
          server: { ...initialAppConfig.server, ...serverConfig.server },
          client: { ...initialAppConfig.client, ...serverConfig.client },
          appearance: { ...initialAppConfig.appearance, ...serverConfig.appearance },
          tree: serverConfig.tree || initialAppConfig.tree
        };
        
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
      } else {
        console.warn('Failed to fetch config from server, using default');
        setCurrentConfig(initialAppConfig);
      }
    } catch (error) {
      console.warn('Failed to fetch config from server, using default:', error);
      setCurrentConfig(initialAppConfig);
    }
  }, []);

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
        
        const response = await fetch('/api/network-scan/progress', {
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
        const response = await fetch('/api/network-scan/status');
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
        const response = await fetch('/api/network-scan/status');
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
        const response = await fetch('/api/config');
        if (response.ok) {
          const serverConfig = await response.json();
          
          // Ensure we always have a complete config with proper defaults
          const completeConfig = {
            ...initialAppConfig,
            ...serverConfig,
            server: { ...initialAppConfig.server, ...serverConfig.server },
            client: { ...initialAppConfig.client, ...serverConfig.client },
            appearance: { ...initialAppConfig.appearance, ...serverConfig.appearance },
            tree: serverConfig.tree || initialAppConfig.tree
          };
          
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

  // Helper function to count all nested children and their health statuses
  const getNestedNodeStats = useCallback((node: TreeNode): { total: number; online: number; offline: number; checking: number } => {
    let total = 0;
    let online = 0;
    let offline = 0;
    let checking = 0;

    const countNodes = (n: TreeNode) => {
      if (n.children) {
        for (const child of n.children) {
          total++;
          // Get status for this child
          let identifier = child.internalAddress;
          if (!identifier) {
            identifier = child.healthCheckPort && child.ip 
              ? `${child.ip}:${child.healthCheckPort}` 
              : (child.ip || child.url);
          }
          if (identifier) {
            const status = getNodeStatus(identifier);
            if (status.status === 'online') online++;
            else if (status.status === 'offline') offline++;
            else checking++;
          } else {
            checking++;
          }
          // Recurse into grandchildren
          countNodes(child);
        }
      }
    };

    countNodes(node);
    return { total, online, offline, checking };
  }, [getNodeStatus]);

  const handleSaveConfig = async (newConfig: AppConfig) => {
    // Send the config to the server to update the config.json file
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(newConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in again.');
      }
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }

    await response.json();
    
    // After successful save, fetch the updated config from server to ensure sync
    const configResponse = await fetch('/api/config');
    if (configResponse.ok) {
      const updatedConfig = await configResponse.json();
      setCurrentConfig(updatedConfig);
      
      // Clear icon caches when config changes to force reload of icons with new colors/content
      iconImageCache.clear();
      iconSvgCache.clear();
    }
  };

  const handleRestoreConfig = async (newConfig: AppConfig) => {
    // Send the config to the server with replace mode for complete restoration
    const response = await fetch('/api/config?replace=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(newConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in again.');
      }
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Backup restore result:', result);
    
    // After successful restore, fetch the updated config from server to ensure sync
    const configResponse = await fetch('/api/config');
    if (configResponse.ok) {
      const updatedConfig = await configResponse.json();
      setCurrentConfig(updatedConfig);
      
      // Clear icon caches when config changes to force reload of icons with new colors/content
      iconImageCache.clear();
      iconSvgCache.clear();
    }
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
  
  const handleEditNode = async (nodeId: string) => {
    // Authenticate before allowing node editing
    const isAuth = await authenticate();
    if (!isAuth) {
      return; // User denied access or wrong password
    }

    try {
      const node = findNodeById(currentConfig.tree.nodes, nodeId);
      if (node) {
        // Create a deep copy to avoid reference issues
        try {
          const nodeCopy = JSON.parse(JSON.stringify(node));
          setEditingNode(nodeCopy);
        } catch (error) {
          console.error("JSON serialization failed:", error);
          // Fallback to a simpler manual copy
          const basicCopy = {
            ...node,
            children: node.children ? [...node.children] : []
          };
          setEditingNode(basicCopy);
        }
      }
    } catch (error) {
      console.error("Error setting editing node:", error);
      // Fallback: If JSON serialization fails, try basic copy
      const node = findNodeById(currentConfig.tree.nodes, nodeId);
      if (node) {
        setEditingNode({...node, children: node.children ? [...node.children] : []});
      }
    }
  };

  const handleEditChildNode = async (childNode: TreeNode) => {
    // Authenticate before allowing node editing
    const isAuth = await authenticate();
    if (!isAuth) {
      return; // User denied access or wrong password
    }

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
  };

  const handleAddChildNode = async (parentNodeId: string) => {
    // Authenticate first
    const isAuth = await authenticate();
    if (!isAuth) return;

    const newNode: TreeNode = {
      id: `node_${Date.now()}`,
      title: "New Node",
      subtitle: "New subtitle",
      type: "square",
      children: [],
      // Inherit global setting
      disableEmbedded: currentConfig.general?.openNodesAsOverlay === false
    };

    // Add to config
    const newConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep copy
    const parentNode = findNodeById(newConfig.tree.nodes, parentNodeId);
    
    if (parentNode) {
      if (!parentNode.children) {
        parentNode.children = [];
      }
      parentNode.children.push(newNode);
      
      // If parent was collapsed, expand it
      if (collapsedNodeIds.has(parentNodeId)) {
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
        
        // Track newly added node for animation
        setNewlyAddedNodeId(newNode.id);
        // Clear after animation completes
        setTimeout(() => setNewlyAddedNodeId(null), 500);
        
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
  };

  const handleOpenSettings = async () => {
    // Authenticate before allowing settings access
    const isAuth = await authenticate();
    if (!isAuth) {
      return; // User denied access or wrong password
    }
    
    setIsSettingsOpen(true);
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
  const performDeleteNode = async (nodeId: string, skipAnimation = false) => {
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

    // Animate before deletion (only for canvas quick delete, not for editor delete)
    if (!skipAnimation) {
      setDeletingNodeId(nodeId);
      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      setDeletingNodeId(null);
    }

    const newConfig = {
      ...currentConfig,
      tree: {
        ...currentConfig.tree,
        nodes: removeNodeFromTree(currentConfig.tree.nodes, nodeId)
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
        await performDeleteNode(editingNode.id, true); // Skip animation for editor delete
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

  // Direct delete handler for quick delete from canvas
  const handleQuickDeleteNode = async (nodeId: string) => {
    const node = findNodeById(currentConfig.tree.nodes, nodeId);
    if (!node) return;

    const childCount = countDescendants(node);

    const doDelete = async () => {
      try {
        await performDeleteNode(nodeId);
        addToast({
          type: 'success',
          message: `"${node.title}" deleted`,
          duration: 3000
        });
      } catch (error) {
        console.error('Error deleting node:', error);
        addToast({
          type: 'error',
          message: 'Failed to delete node',
          duration: 5000
        });
      }
    };

    if (childCount > 0) {
      // Show confirmation dialog for nodes with children
      setDeleteConfirmation({
        isOpen: true,
        nodeId,
        nodeTitle: node.title,
        childCount,
        onConfirm: async () => {
          await doDelete();
          setDeleteConfirmation(null);
        }
      });
    } else {
      // Delete directly if no children
      await doDelete();
    }
  };

  // Handle creating a starting node when there are no nodes
  const handleCreateStartingNode = async () => {
    // Authenticate before allowing node creation
    const isAuth = await authenticate();
    if (!isAuth) {
      return; // User denied access or wrong password
    }

    try {
      const startingNode = createStartingNode(currentConfig);
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
  };
  
  // Calculate positions for tree nodes in a proper vertical tree layout
  const calculateNodePositions = useCallback((): { nodes: PositionedNode[], connections: Connection[] } => {
    // In edit mode, ignore collapse state to show full tree
    const effectiveCollapsedIds = isEditMode ? new Set<string>() : collapsedNodeIds;
    const visibleTree = getVisibleTree(currentConfig.tree.nodes, effectiveCollapsedIds);
    return calculateTreeLayout(visibleTree);
  }, [currentConfig, collapsedNodeIds, isEditMode]);

  // Function to open node URL with debouncing to prevent double-opens
  const openNodeUrl = useCallback((node: PositionedNode) => {
    const targetUrl = getNodeTargetUrl(node);
    
    if (targetUrl) {
      const now = Date.now();
      const lastOpenKey = `lastOpen_${node.id}`;
      const lastOpenTime = (window as any)[lastOpenKey] || 0;
      if (now - lastOpenTime > 1000) { // 1 second debounce
        (window as any)[lastOpenKey] = now;
        if (currentConfig.general?.openNodesAsOverlay !== false && !node.disableEmbedded) {
          setIframeOverlay({ url: targetUrl, title: node.title || appTitle });
        } else {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      }
    }
    // If no URL or IP with web GUI, do nothing (node is not clickable)
  }, [currentConfig, appTitle]);

  const fitToContent = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Calculate bounding box of all nodes
    const { nodes } = calculateNodePositions();
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });
    
    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Calculate scale to fit content
    const scaleX = container.clientWidth / contentWidth;
    const scaleY = container.clientHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.5); // Max scale of 1.5
    
    // Calculate center position
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const x = container.clientWidth / 2 - centerX * scale;
    const y = container.clientHeight / 2 - centerY * scale;
    
    const newTransform = { x, y, scale };
    setTransform(newTransform);
    
    // Only set initial transform if this is the first initialization
    if (!isInitialized) {
      setInitialTransform(newTransform);
      setIsInitialized(true);
    }
  }, [calculateNodePositions, isInitialized]);

  // Check if user has moved away from initial position
  const hasMovedFromInitial = useCallback(() => {
    if (!isInitialized) return false;
    
    const threshold = 10; // pixels
    const scaleThreshold = 0.1;
    
    return (
      Math.abs(transform.x - initialTransform.x) > threshold ||
      Math.abs(transform.y - initialTransform.y) > threshold ||
      Math.abs(transform.scale - initialTransform.scale) > scaleThreshold
    );
  }, [transform, initialTransform, isInitialized]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the background (not on a node)
    // Nodes stop propagation, so this should be fine
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    
    setTransform(prev => ({
      ...prev,
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // e.preventDefault() is not needed/possible in React synthetic events for passive listeners
    // But we can handle the zoom logic
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, transform.scale * scaleFactor));
    
    // Zoom towards mouse position
    const scaleChange = newScale / transform.scale;
    const newX = mouseX - (mouseX - transform.x) * scaleChange;
    const newY = mouseY - (mouseY - transform.y) * scaleChange;
    
    setTransform({
      x: newX,
      y: newY,
      scale: newScale
    });
  }, [transform]);

  // Auto-fit content on initial load only
  useEffect(() => {
    if (!isInitialized && currentConfig.tree.nodes.length > 0) {
      const timer = setTimeout(() => {
        fitToContent();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isInitialized, fitToContent, currentConfig.tree.nodes.length]);

  // Handle node click in mobile view
  const handleMobileNodeClick = useCallback((node: TreeNode) => {
    const targetUrl = getNodeTargetUrl(node);
    
    if (targetUrl) {
      // Show iframe overlay instead of opening externally
      if (!node.disableEmbedded) {
        setIframeOverlay({ url: targetUrl, title: node.title || appTitle });
      } else {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }, [appTitle]);

  // Effect to test API connectivity when the component mounts
  useEffect(() => {
    const testApiConnectivity = async () => {
      try {
        const response = await fetch('/api/status');
        await response.json();
        // Success is silent - errors will be logged by the error handler
      } catch (error) {
        console.error('API connectivity test failed:', error);
      }
    };
    
    testApiConnectivity();
  }, []);

  const resetView = useCallback(() => {
    fitToContent();
  }, [fitToContent]);

  // Calculate nodes and connections for rendering
  const { nodes, connections } = calculateNodePositions();

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
    }
  }, [currentConfig, addToast]);

  // Drag and drop reorder hook
  const {
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  } = useDragReorder({
    nodes,
    rootNodes: currentConfig.tree.nodes,
    isEditMode,
    onReorder: handleNodeReorder
  });

  // Handle drag start from node
  const handleDragStart = useCallback((node: PositionedNode, clientX: number, clientY: number) => {
    startDrag(node, clientX, clientY);
  }, [startDrag]);

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
    // We check for auth token directly to see if user is logged in as admin
    if (hasAuthToken()) {
      try {
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
          ...currentConfig,
          tree: {
            ...currentConfig.tree,
            nodes: updateNodes(currentConfig.tree.nodes)
          }
        };
        
        // Update local config state to match
        setCurrentConfig(newConfig);
        
        // Save to server
        await handleSaveConfig(newConfig);
      } catch (error) {
        console.error('Failed to save collapse state:', error);
        // We don't revert the UI state because the user still wants it collapsed locally
      }
    }
  };

  // Handle global mouse move for dragging
  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateDrag(e.clientX, e.clientY, transform);
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState.isDragging, updateDrag, endDrag, cancelDrag, transform]);

  // Helper to get status for a node
  const getStatusForNode = (node: PositionedNode) => {
    let originalIdentifier = node.internalAddress;
    if (!originalIdentifier) {
      originalIdentifier = node.healthCheckPort && node.ip 
        ? `${node.ip}:${node.healthCheckPort}` 
        : (node.ip || node.url);
    }
    
    return originalIdentifier 
      ? getNodeStatus(originalIdentifier) 
      : { status: 'checking' as const, lastChecked: new Date().toISOString(), statusChangedAt: new Date().toISOString(), progress: 0 };
  };

  return (
    <div className="w-full h-full relative font-roboto overflow-hidden isolate" ref={containerRef}>
      {/* Background image */}
      <div 
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat pointer-events-none" 
        style={{ 
          backgroundImage: `url(${currentConfig.appearance?.backgroundImage || '/background.png'})`,
          opacity: 0.4 
        }} 
      />
      
      {/* Edit Mode Border Overlay */}
      {isEditMode && (
        <div 
          className="absolute inset-0 z-50 pointer-events-none"
          style={{ 
            boxShadow: `inset 0 0 0 3px ${currentConfig.appearance?.accentColor || '#3b82f6'}`,
            borderRadius: '0px'
          }} 
        />
      )}
      
      {/* Desktop view with DOM-based canvas */}
      {!isMobile && (
        <>
          <div
            className={`w-full h-full absolute inset-0 z-10 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* The "World" container that gets transformed */}
            <div
              style={{
                transform: `translate(${Math.round(transform.x)}px, ${Math.round(transform.y)}px) scale(${transform.scale})`,
                transformOrigin: '0 0',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                // Removed will-change to prevent blurriness
                backfaceVisibility: 'hidden',
              }}
            >
              {/* Connections Layer (SVG) */}
              <svg
                className="absolute top-0 left-0 overflow-visible"
                style={{ width: 1, height: 1, pointerEvents: 'none' }} // Minimal size, overflow visible handles the rest
                shapeRendering="geometricPrecision"
              >
                {connections.map((connection, index) => {
                  const { from, to, isFirstChild, isLastChild } = connection;
                  const startX = from.x + from.width / 2;
                  const startY = from.y + from.height;
                  const endX = to.x + to.width / 2;
                  const endY = to.y;
                  const midY = startY + (endY - startY) / 2;
                  const cornerRadius = 12; // Fixed radius, looks good at all scales

                  // Construct path
                  let d = `M ${startX} ${startY}`;
                  
                  if (startX === endX) {
                    d += ` L ${endX} ${endY}`;
                  } else {
                    const isMovingRight = endX > startX;
                    
                    if (isFirstChild || isLastChild) {
                      d += ` L ${startX} ${midY - cornerRadius}`;
                      d += ` Q ${startX} ${midY} ${startX + (isMovingRight ? cornerRadius : -cornerRadius)} ${midY}`;
                      d += ` L ${endX + (isMovingRight ? -cornerRadius : cornerRadius)} ${midY}`;
                      d += ` Q ${endX} ${midY} ${endX} ${midY + cornerRadius}`;
                      d += ` L ${endX} ${endY}`;
                    } else {
                      d += ` L ${startX} ${midY}`;
                      d += ` L ${endX + (isMovingRight ? -cornerRadius : cornerRadius)} ${midY}`;
                      d += ` Q ${endX} ${midY} ${endX} ${midY + cornerRadius}`;
                      d += ` L ${endX} ${endY}`;
                    }
                  }

                  return (
                    <g key={`conn-${index}`}>
                      {/* Visible connection line */}
                      <path
                        d={d}
                        fill="none"
                        stroke="#6b7280"
                        strokeWidth={4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Invisible wider path for hover detection - only when not in edit mode */}
                      {!isEditMode && (
                        <path
                          d={d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={20}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredConnectionParentId(from.id)}
                          onMouseLeave={() => setHoveredConnectionParentId(null)}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              
              {/* Collapse buttons (shown when hovering over connection) */}
              {!isEditMode && hoveredConnectionParentId && (() => {
                const parentNode = nodes.find(n => n.id === hoveredConnectionParentId);
                if (!parentNode) return null;
                
                const originalNode = findNodeById(currentConfig.tree.nodes, hoveredConnectionParentId);
                const hasChildren = originalNode && originalNode.children && originalNode.children.length > 0;
                const isCollapsed = collapsedNodeIds.has(hoveredConnectionParentId);
                
                if (!hasChildren || isCollapsed) return null;
                
                // Find the first child node to calculate vertical center
                const firstChildId = originalNode!.children![0].id;
                const firstChildNode = nodes.find(n => n.id === firstChildId);
                
                const buttonX = parentNode.x + parentNode.width / 2;
                // Position vertically centered between parent bottom and first child top
                const parentBottom = parentNode.y + parentNode.height;
                const childTop = firstChildNode ? firstChildNode.y : parentBottom + 60;
                const buttonY = parentBottom + (childTop - parentBottom) / 2;
                
                return (
                  <div
                    className="absolute z-30 cursor-pointer transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-white/95 backdrop-blur-sm border border-gray-300 shadow-md hover:bg-gray-50 hover:scale-110 hover:shadow-lg transition-all duration-150"
                    style={{
                      left: buttonX,
                      top: buttonY,
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                    }}
                    onMouseEnter={() => setHoveredConnectionParentId(hoveredConnectionParentId)}
                    onMouseLeave={() => setHoveredConnectionParentId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNodeCollapse(hoveredConnectionParentId, true);
                      setHoveredConnectionParentId(null);
                    }}
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </div>
                );
              })()}

              {/* Drop Position Ghost Placeholder - shows exactly where node will land */}
              <DragGhost 
                dragState={dragState} 
                nodes={nodes} 
                config={currentConfig} 
              />

              {/* Nodes Layer */}
              {nodes.map(node => {
                // Check if this node is being dragged
                const isDraggingThisNode = dragState.isDragging && dragState.draggedNode?.id === node.id;
                
                // Check if this node is a descendant of the dragged node (should also be greyed out)
                // Check if this node is a descendant of the dragged node (should also be greyed out)
                const isDescendantOfDragged = !!(dragState.isDragging && dragState.draggedNode && 
                  dragState.draggedNodeWithChildren?.children && 
                  (() => {
                    const checkDescendant = (children: typeof currentConfig.tree.nodes): boolean => {
                      for (const child of children) {
                        if (child.id === node.id) return true;
                        if (child.children && checkDescendant(child.children)) return true;
                      }
                      return false;
                    };
                    return checkDescendant(dragState.draggedNodeWithChildren.children);
                  })());
                
                // Check if this node should be visually shifted because ghost is taking its place
                // Siblings shift horizontally (translateX), not vertically
                const isShiftedRight = dragState.isDragging && 
                  dragState.dropTarget?.targetNodeId === node.id && 
                  dragState.dropTarget?.position === 'before';
                
                return (
                <React.Fragment key={node.id}>
                  <div
                    style={{
                      transform: isShiftedRight ? `translateX(${NODE_WIDTH + SIBLING_SPACING}px)` : 'none',
                      transition: 'transform 0.2s ease-out'
                    }}
                  >
                  <CanvasNode
                    node={node}
                    status={getStatusForNode(node)}
                    scale={transform.scale}
                    isSelected={false}
                    isEditMode={isEditMode}
                    isNewlyAdded={node.id === newlyAddedNodeId}
                    isExpanding={expandingNodeIds.has(node.id)}
                    isDeleting={node.id === deletingNodeId}
                    isDragging={isDraggingThisNode}
                    isDescendantOfDragged={isDescendantOfDragged}
                    accentColor={currentConfig.appearance?.accentColor || '#3b82f6'}
                    onNodeClick={(n) => {
                      if (dragState.isDragging) return; // Don't handle clicks while dragging
                      if (isEditMode) {
                        handleEditNode(n.id);
                      } else {
                        openNodeUrl(n);
                      }
                    }}
                    onEditClick={(n) => handleEditNode(n.id)}
                    onAddChildClick={(n) => handleAddChildNode(n.id)}
                    onDeleteClick={(n) => handleQuickDeleteNode(n.id)}
                    onDragStart={handleDragStart}
                  />
                </div>
                  
                  {/* Collapse/Expand Button - Hidden in edit mode */}
                  {!isEditMode && (() => {
                    const originalNode = findNodeById(currentConfig.tree.nodes, node.id);
                    const hasChildren = originalNode && originalNode.children && originalNode.children.length > 0;
                    const isCollapsed = collapsedNodeIds.has(node.id);
                    
                    if (!hasChildren) return null;

                    // Calculate position for the placeholder node (where a child would be)
                    // VERTICAL_SPACING is 40 in layoutUtils, assuming similar spacing here
                    const buttonX = node.x + node.width / 2;
                    const buttonY = node.y + node.height + 40; 
                    
                    // Get stats for all nested children
                    const stats = getNestedNodeStats(originalNode!);
                    const total = stats.online + stats.offline + stats.checking;
                    
                    // Calculate pie chart angles
                    const onlineAngle = total > 0 ? (stats.online / total) * 360 : 0;
                    const offlineAngle = total > 0 ? (stats.offline / total) * 360 : 0;
                    
                    // Create donut arc path
                    const createDonutArc = (startAngle: number, endAngle: number, color: string) => {
                      if (endAngle - startAngle === 0) return null;
                      const outerR = 7;
                      const innerR = 4;
                      if (endAngle - startAngle >= 360) {
                        // Full circle donut
                        return (
                          <>
                            <circle cx="8" cy="8" r={outerR} fill={color} />
                            <circle cx="8" cy="8" r={innerR} fill="white" />
                          </>
                        );
                      }
                      const startRad = (startAngle - 90) * Math.PI / 180;
                      const endRad = (endAngle - 90) * Math.PI / 180;
                      const outerX1 = 8 + outerR * Math.cos(startRad);
                      const outerY1 = 8 + outerR * Math.sin(startRad);
                      const outerX2 = 8 + outerR * Math.cos(endRad);
                      const outerY2 = 8 + outerR * Math.sin(endRad);
                      const innerX1 = 8 + innerR * Math.cos(startRad);
                      const innerY1 = 8 + innerR * Math.sin(startRad);
                      const innerX2 = 8 + innerR * Math.cos(endRad);
                      const innerY2 = 8 + innerR * Math.sin(endRad);
                      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
                      return (
                        <path 
                          d={`M ${outerX1} ${outerY1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerX2} ${outerY2} L ${innerX2} ${innerY2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX1} ${innerY1} Z`} 
                          fill={color} 
                        />
                      );
                    };
                    
                    // Only show expand button when collapsed
                    if (!isCollapsed) {
                      return null;
                    }
                    
                    return (
                      <React.Fragment key={`expand-btn-${node.id}`}>
                        {/* Vertical Connecting Line */}
                        <div
                          className="absolute z-20 pointer-events-none"
                          style={{
                            left: node.x + node.width / 2 - 2, // Centered (4px width)
                            top: node.y + node.height,
                            width: 4,
                            height: 40, // Matches vertical spacing
                            backgroundColor: '#9ca3af', // Matches connection line color (gray-400)
                          }}
                        />
                        
                        {/* Expand Button / Placeholder Node */}
                        <div
                          className="absolute z-30 cursor-pointer transform -translate-x-1/2 flex items-center justify-between px-2 bg-white/95 backdrop-blur-sm border shadow-sm hover:shadow-md transform transition-all duration-200 hover:scale-[1.02]"
                          style={{
                            left: buttonX,
                            top: buttonY,
                            width: '200px',
                            height: '48px',
                            borderRadius: '9999px',
                            borderColor: '#e5e7eb', // Default border color
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Get all child node IDs to animate
                            const getChildIds = (n: TreeNode): string[] => {
                              const ids: string[] = [];
                              if (n.children) {
                                for (const child of n.children) {
                                  ids.push(child.id);
                                  ids.push(...getChildIds(child));
                                }
                              }
                              return ids;
                            };
                            const childIds = originalNode ? getChildIds(originalNode) : [];
                            
                            // Set expanding animation for children
                            setExpandingNodeIds(new Set(childIds));
                            
                            // Expand the node
                            toggleNodeCollapse(node.id, false);
                            
                            // Clear animation after it completes
                            setTimeout(() => {
                              setExpandingNodeIds(new Set());
                            }, 300);
                          }}
                        >
                          <div className="flex items-center justify-between w-full px-1">
                            {/* Donut Chart Indicator - Size matched to arrow circle */}
                            <div className="relative w-8 h-8 flex-shrink-0">
                              <svg width="100%" height="100%" viewBox="0 0 16 16" className="transform -rotate-90">
                                <circle cx="8" cy="8" r="7" fill="#e5e7eb" />
                                <circle cx="8" cy="8" r="4" fill="white" />
                                {createDonutArc(0, onlineAngle, '#22c55e')}
                                {createDonutArc(onlineAngle, onlineAngle + offlineAngle, '#ef4444')}
                                {stats.checking > 0 && createDonutArc(onlineAngle + offlineAngle, 360, '#9ca3af')}
                              </svg>
                            </div>
                            
                            {/* Text */}
                            <div className="font-medium text-sm text-gray-600 transition-colors" style={{ color: 'inherit' }}>
                               {stats.total} hidden nodes
                            </div>
                            
                            {/* Arrow Circle */}
                            <div 
                               className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                               style={{ backgroundColor: `${currentConfig.appearance.accentColor}15` }}
                            >
                              <svg 
                                className="w-5 h-5" 
                                style={{ color: currentConfig.appearance.accentColor }}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })()}
                </React.Fragment>
              );
              })}
            </div>
          </div>
          
          {/* Empty nodes fallback for desktop */}
          {currentConfig.tree.nodes.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">
                <EmptyNodesFallback 
                  onCreateStartingNode={handleCreateStartingNode}
                  appConfig={currentConfig}
                  onRestoreConfig={handleLoadConfig}
                />
              </div>
            </div>
          )}
          
          {/* Edit Mode Indicator - Top Center */}
          {isEditMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
              <div 
                className="text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse"
                style={{ backgroundColor: currentConfig.appearance?.accentColor || '#3b82f6' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-sm font-medium">Edit Mode Active</span>
              </div>
            </div>
          )}
          
          {/* Controls - only show when user has moved away from initial position */}
          {hasMovedFromInitial() && (
            <div className="absolute bottom-4 left-4 z-40">
              <button
                onClick={resetView}
                className="bg-white/90 hover:bg-white text-gray-800 px-3 py-2 rounded-lg shadow-md transition-colors text-sm font-medium font-roboto"
              >
                Reset View
              </button>
            </div>
          )}
          
          {/* Edit Mode FAB Button */}
          <div className="absolute bottom-4 right-4 z-40">
            {/* Edit FAB Button */}
            <button
              onClick={async () => {
                if (!isEditMode) {
                  // Authenticate before entering edit mode
                  const isAuth = await authenticate();
                  if (isAuth) {
                    setIsEditMode(true);
                  }
                } else {
                  setIsEditMode(false);
                }
              }}
              className={`h-12 rounded-full shadow-lg flex items-center justify-center gap-2 px-5 transition-all duration-200 ${
                isEditMode 
                  ? 'text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700'
              }`}
              style={isEditMode ? { 
                backgroundColor: currentConfig.appearance?.accentColor || '#3b82f6',
                boxShadow: `0 0 0 4px ${(currentConfig.appearance?.accentColor || '#3b82f6')}33`
              } : undefined}
              title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
            >
              {isEditMode ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-sm">Done</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="font-medium text-sm">Edit</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
      
      {/* Mobile view with vertical list */}
      {isMobile && (
        <div className="h-full relative">
          {/* Background image for mobile view - covers entire screen */}
          <div 
            className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none" 
            style={{ 
              backgroundImage: `url(${currentConfig.appearance?.backgroundImage || '/background.png'})`,
              opacity: 0.3,
              backgroundSize: 'cover'
            }} 
          />
          
          {/* Single scrollable container with status card and nodes */}
          <div className="relative z-10 h-full overflow-auto bg-transparent">
            {currentConfig.tree.nodes.length === 0 ? (
              <div className="flex flex-col h-full">
                {/* Status card for mobile when no nodes - edge to edge */}
                <div>
                  <StatusCard
                    onOpenSettings={handleOpenSettings}
                    appConfig={currentConfig}
                    statuses={statuses}
                    isLoading={isLoading}
                    error={error}
                    isConnected={isConnected}
                    nextCheckCountdown={nextCheckCountdown}
                    totalInterval={totalInterval}
                    isQuerying={isQuerying}
                    isMobile={true}
                  />
                </div>
                
                {/* Empty nodes fallback for mobile */}
                <div className="flex-1 flex items-center justify-center p-4">
                  <EmptyNodesFallback 
                    onCreateStartingNode={handleCreateStartingNode}
                    appConfig={currentConfig}
                    onRestoreConfig={handleLoadConfig}
                  />
                </div>
              </div>
            ) : (
              <MobileNodeList 
                nodes={currentConfig.tree.nodes} 
                statuses={statuses}
                onNodeClick={(node) => {
                  if (isEditMode) {
                    handleEditNode(node.id);
                  } else {
                    handleMobileNodeClick(node);
                  }
                }}
                isEditMode={isEditMode}
                accentColor={currentConfig.appearance?.accentColor || '#3b82f6'}
                appConfig={currentConfig}
                statusCard={
                  <StatusCard
                    onOpenSettings={handleOpenSettings}
                    appConfig={currentConfig}
                    statuses={statuses}
                    isLoading={isLoading}
                    error={error}
                    isConnected={isConnected}
                    nextCheckCountdown={nextCheckCountdown}
                    totalInterval={totalInterval}
                    isQuerying={isQuerying}
                    isMobile={true}
                  />
                }
              />
            )}
          </div>
          
          {/* Mobile Edit Mode Indicator - Top Center */}
          {isEditMode && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40">
              <div 
                className="text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse"
                style={{ backgroundColor: currentConfig.appearance?.accentColor || '#3b82f6' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-sm font-medium">Edit Mode</span>
              </div>
            </div>
          )}
          
          {/* Mobile Edit Mode FAB Button */}
          <div className="absolute bottom-4 right-4 z-40">
            <button
              onClick={async () => {
                if (!isEditMode) {
                  const isAuth = await authenticate();
                  if (isAuth) {
                    setIsEditMode(true);
                  }
                } else {
                  setIsEditMode(false);
                }
              }}
              className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
                isEditMode 
                  ? 'text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700'
              }`}
              style={isEditMode ? { 
                backgroundColor: currentConfig.appearance?.accentColor || '#3b82f6',
                boxShadow: `0 0 0 4px ${(currentConfig.appearance?.accentColor || '#3b82f6')}33`
              } : undefined}
              title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
            >
              {isEditMode ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Status Card - only show on desktop, mobile has it embedded */}
      {!isMobile && (
        <div className="absolute top-4 right-4 z-20">
          <StatusCard 
            onOpenSettings={handleOpenSettings} 
            appConfig={currentConfig}
            statuses={statuses}
            isLoading={isLoading}
            error={error}
            isConnected={isConnected}
            nextCheckCountdown={nextCheckCountdown}
            totalInterval={totalInterval}
            isQuerying={isQuerying}
          />
        </div>
      )}

      {/* Desktop Logo - top left corner */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-20">
          {(currentConfig?.appearance?.logo || currentConfig?.appearance?.favicon) ? (
            <img 
              src={currentConfig.appearance.logo || currentConfig.appearance.favicon} 
              alt={currentConfig.general?.title || 'Logo'}
              className="max-h-20 max-w-32 opacity-90 filter drop-shadow-lg bg-white/20 backdrop-blur-sm rounded-xl p-3 object-contain"
              onError={(e) => {
                // Fallback to default icon
                console.warn('Logo failed to load, trying fallback');
                e.currentTarget.src = '/nautilusIcon.png';
              }}
            />
          ) : (
            <img 
              src="/nautilusIcon.png" 
              alt="Nautilus" 
              className="max-h-20 max-w-32 opacity-90 filter drop-shadow-lg bg-white/20 backdrop-blur-sm rounded-xl p-3 object-contain"
              onError={(e) => {
                // Hide if fallback also fails
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>
      )}

      {/* Settings Modal - Rendered at root level for full page overlay */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setFocusNodeId(undefined);
        }}
        initialConfig={currentConfig}
        onSave={handleSaveConfig}
        focusNodeId={focusNodeId}
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
          appearance={currentConfig.appearance}
        />
      )}

      {/* Iframe Overlay for all devices */}
      {iframeOverlay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-8 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-full max-h-full flex flex-col animate-scale-in">
            {/* Header with title and buttons - reduced height */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h3 className="text-base font-semibold text-gray-900 truncate flex-1 mr-4">
                {iframeOverlay.title}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    window.open(iframeOverlay.url, '_blank', 'noopener,noreferrer');
                    setIframeOverlay(null);
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
                  aria-label="Open in new tab"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  onClick={() => setIframeOverlay(null)}
                  className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Iframe container */}
            <div className="flex-1 relative">
              <iframe
                src={iframeOverlay.url}
                className="w-full h-full border-0 rounded-b-lg"
                title={iframeOverlay.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-forms allow-navigation allow-popups"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}

      {/* Drag Ghost - follows cursor while dragging */}
      {dragState.isDragging && dragState.draggedNode && (
        <div
          className="drag-ghost pointer-events-none"
          style={{
            left: dragState.currentPos.x - 140, // Center on cursor
            top: dragState.currentPos.y - 45,
            width: 280,
            height: 90,
          }}
        >
          {/* Stacked cards behind to show children */}
          {dragState.draggedNodeWithChildren && dragState.draggedNodeWithChildren.children && dragState.draggedNodeWithChildren.children.length > 0 && (
            <>
              <div className="drag-ghost-stacked" style={{ transform: 'translate(8px, 8px)' }} />
              {dragState.draggedNodeWithChildren.children.length > 1 && (
                <div className="drag-ghost-stacked" style={{ transform: 'translate(4px, 4px)' }} />
              )}
            </>
          )}
          
          {/* Main dragged card */}
          <div className="relative w-full h-full bg-white rounded-xl shadow-xl border-2 overflow-hidden"
            style={{ borderColor: currentConfig.appearance?.accentColor || '#3b82f6' }}
          >
            <div className="p-3 h-full flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-gray-800 truncate">
                  {dragState.draggedNode.title}
                </span>
              </div>
              {dragState.draggedNode.subtitle && (
                <div className="text-sm text-gray-500 truncate">
                  {dragState.draggedNode.subtitle}
                </div>
              )}
            </div>
            
            {/* Child count badge */}
            {dragState.draggedNodeWithChildren && dragState.draggedNodeWithChildren.children && dragState.draggedNodeWithChildren.children.length > 0 && (
              <div 
                className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-lg"
                style={{ backgroundColor: currentConfig.appearance?.accentColor || '#3b82f6' }}
              >
                +{countDescendants(dragState.draggedNodeWithChildren)}
              </div>
            )}
          </div>
        </div>
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