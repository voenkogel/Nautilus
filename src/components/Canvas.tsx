import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TreeNode, AppConfig } from '../types/config';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getVisibleTree } from '../utils/nodeUtils';
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
import { 
  calculateTreeLayout, 
  type PositionedNode, 
  type Connection
} from '../utils/layoutUtils';
import { getNodeTargetUrl } from '../utils/nodeUtils';
import CanvasNode from './CanvasNode';

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

  // Wrapper function to handle authentication with state tracking
  const authenticateWithState = async (): Promise<boolean> => {
    if (isAuthenticating) {
      console.log('🔄 Authentication already in progress, skipping');
      return false;
    }
    
    setIsAuthenticating(true);
    try {
      const result = await authenticate();
      return result;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Fetch current config from server on mount
  useEffect(() => {
    const fetchCurrentConfig = async () => {
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
        } else {
          console.warn('Failed to fetch config from server, using default');
          setCurrentConfig(initialAppConfig);
        }
      } catch (error) {
        console.warn('Failed to fetch config from server, using default:', error);
        setCurrentConfig(initialAppConfig);
      }
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
  }, []);

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
      children: []
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
      await handleSaveConfig(newConfig);
      
      // Trigger immediate status check for the new node
      forceRefresh();
      
      // Open editor for the new node
      setEditingNode(newNode);
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
    } catch (error) {
      console.error('Error saving node:', error);
      // The error will be handled by the component that calls this
    }
  };

  const handleDeleteNode = async () => {
    if (!editingNode) return;

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
        nodes: removeNodeFromTree(currentConfig.tree.nodes, editingNode.id)
      }
    };

    try {
      await handleSaveConfig(newConfig);
      setEditingNode(null);
      // Trigger immediate status check to update removed node
      forceRefresh();
    } catch (error) {
      console.error('Error deleting node:', error);
      // The error will be handled by the component that calls this
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
  };
  
  // Calculate positions for tree nodes in a proper vertical tree layout
  const calculateNodePositions = useCallback((): { nodes: PositionedNode[], connections: Connection[] } => {
    const visibleTree = getVisibleTree(currentConfig.tree.nodes, collapsedNodeIds);
    return calculateTreeLayout(visibleTree);
  }, [currentConfig, collapsedNodeIds]);

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
    setTransform(initialTransform);
  }, [initialTransform]);

  // Calculate nodes and connections for rendering
  const { nodes, connections } = calculateNodePositions();

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
                className="absolute top-0 left-0 overflow-visible pointer-events-none"
                style={{ width: 1, height: 1 }} // Minimal size, overflow visible handles the rest
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
                    <path
                      key={`conn-${index}`}
                      d={d}
                      fill="none"
                      stroke="#6b7280"
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>

              {/* Nodes Layer */}
              {nodes.map(node => (
                <React.Fragment key={node.id}>
                  <CanvasNode
                    node={node}
                    status={getStatusForNode(node)}
                    scale={transform.scale}
                    isSelected={false}
                    onNodeClick={(n) => openNodeUrl(n)}
                    onEditClick={(n) => handleEditNode(n.id)}
                    onAddChildClick={(n) => handleAddChildNode(n.id)}
                  />
                  
                  {/* Collapse/Expand Button */}
                  {(() => {
                    const originalNode = findNodeById(currentConfig.tree.nodes, node.id);
                    const hasChildren = originalNode && originalNode.children && originalNode.children.length > 0;
                    const isCollapsed = collapsedNodeIds.has(node.id);
                    
                    if (!hasChildren) return null;

                    const buttonX = node.x + node.width / 2;
                    const buttonY = node.y + node.height + 12;
                    
                    return (
                      <div
                        className="absolute z-30 cursor-pointer transform -translate-x-1/2 flex items-center justify-center bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
                        style={{
                          left: buttonX,
                          top: buttonY,
                          borderRadius: isCollapsed ? '9999px' : '50%',
                          padding: isCollapsed ? '4px 12px' : '4px',
                          minWidth: isCollapsed ? 'auto' : '24px',
                          height: '24px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedNodeIds(prev => {
                            const next = new Set(prev);
                            if (next.has(node.id)) {
                              next.delete(node.id);
                            } else {
                              next.add(node.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {isCollapsed ? (
                          <div className="flex items-center gap-2 text-xs font-medium text-gray-600 whitespace-nowrap">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span>{originalNode!.children!.length} hidden nodes</span>
                          </div>
                        ) : (
                          <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    );
                  })()}
                </React.Fragment>
              ))}
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
                onNodeClick={handleMobileNodeClick}
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-8">
          <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-full max-h-full flex flex-col">
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
    </div>
  );
};

export default Canvas;