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
  iconSvgCache, 
  getIconSvg, 
  extractIconsFromConfig,
  drawIconOnCanvas
} from '../utils/iconUtils';
import { 
  calculateTreeLayout, 
  type PositionedNode, 
  type Connection
} from '../utils/layoutUtils';
import { getNodeTargetUrl } from '../utils/nodeUtils';

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

// Utility function to format time duration since status change
const formatTimeSince = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m`;
  } else {
    // For anything less than a minute, show "<1m" instead of seconds
    return `<1m`;
  }
};

const Canvas: React.FC = () => {
  const { addToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  
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
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });
  const [isHoveringNode, setIsHoveringNode] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEditButtonNodeId, setHoveredEditButtonNodeId] = useState<string | null>(null);
  const [hoveredAddButtonNodeId, setHoveredAddButtonNodeId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Check for recent scan results on initialization (only for authenticated users)
  const [isScanWindowOpen, setIsScanWindowOpen] = useState(false);
  
  const [scanActive, setScanActive] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authAttemptedForCurrentScan, setAuthAttemptedForCurrentScan] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(undefined);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [currentConfig, setCurrentConfig] = useState<AppConfig>(initialAppConfig);
  const [iconLoadCounter, setIconLoadCounter] = useState(0); // Track icon loading to trigger redraws
  const [iconsPreloaded, setIconsPreloaded] = useState(false); // Track icon preloading status
  const [tooltip, setTooltip] = useState<{text: string, x: number, y: number} | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [hoveredLineParentId, setHoveredLineParentId] = useState<string | null>(null);
  
  // Use refs for values that should not trigger draw function recreation
  const transformRef = useRef(transform);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const hoveredEditButtonNodeIdRef = useRef(hoveredEditButtonNodeId);
  const hoveredAddButtonNodeIdRef = useRef(hoveredAddButtonNodeId);
  
  // Sync refs with state changes
  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId;
  }, [hoveredNodeId]);
  
  useEffect(() => {
    hoveredEditButtonNodeIdRef.current = hoveredEditButtonNodeId;
  }, [hoveredEditButtonNodeId]);

  useEffect(() => {
    hoveredAddButtonNodeIdRef.current = hoveredAddButtonNodeId;
  }, [hoveredAddButtonNodeId]);
  
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  
  // Use device detection
  const { isMobile, isTablet } = useDeviceDetection();
  const isTouch = isMobile || isTablet;
  
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
    getNodeStatus 
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

  // Preload all icons used in the config on component mount
  useEffect(() => {
    const preloadIcons = async () => {
      const requiredIcons = extractIconsFromConfig(currentConfig.tree.nodes);
      const accentColor = currentConfig.appearance?.accentColor || '#3b82f6';
      
      // Preload all required icons
      const preloadPromises = Array.from(requiredIcons).map(iconName => {
        return new Promise<void>((resolve) => {
          const cacheKey = `${iconName}-${accentColor}`;
          const cachedImage = iconImageCache.get(cacheKey);
          
          if (cachedImage && cachedImage.complete) {
            resolve();
            return;
          }
          
          const svgContent = getIconSvg(iconName, accentColor);
          const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          const img = new Image();
          img.onload = () => {
            iconImageCache.set(cacheKey, img);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(); // Continue even if an icon fails to load
          };
          img.src = url;
        });
      });
      
      await Promise.all(preloadPromises);
      setIconsPreloaded(true);
    };
    
    preloadIcons();
  }, [currentConfig.tree.nodes, currentConfig.appearance?.accentColor]);

  // Debug: Log preload status
  useEffect(() => {
    if (iconsPreloaded) {

    }
  }, [iconsPreloaded]);

  // Icon loading callback to trigger redraws
  const handleIconLoaded = useCallback(() => {
    setIconLoadCounter(prev => prev + 1);
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
      setIconsPreloaded(false);
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
      setIconsPreloaded(false);
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
      
      // Open the edit window for the newly created node
      setEditingNode(startingNode);
    } catch (error) {
      console.error('Error creating starting node:', error);
      // Error will be shown in the UI by handleSaveConfig
    }
  };
  
  // Load background image from config
  useEffect(() => {
    // Always try to load a background image (use default if config is empty)
    const configBackgroundImage = currentConfig.appearance?.backgroundImage;
    const backgroundImageToUse = configBackgroundImage || '/background.png';
    
    // Try multiple approaches to load the background image
    const tryLoadImage = (imagePath: string) => {
      // Create a new image
      const img = new Image();
      img.crossOrigin = "anonymous"; // Try with CORS
      
      // Set up onload handler
      img.onload = () => {
        backgroundImageRef.current = img;
        setBackgroundLoaded(true);
      };
      
      // Set up error handler
      img.onerror = () => {
        console.warn('Failed to load background image from:', imagePath);
      };
      
      // Start loading the image
      img.src = imagePath;
      
      // Return the image for immediate check
      return img;
    };
    
    // List of paths to try, in order of preference
    const imagePaths = [
      backgroundImageToUse, // Either config image or default
      window.location.origin + backgroundImageToUse, // Absolute URL
      '/background.png', // Fallback to default
      window.location.origin + '/background.png', // Absolute URL of default
      'public/background.png', // Try public folder directly
      'public/nautilusIcon.png' // Last resort, try icon instead
    ];
    
    // Try each path in sequence, with a small delay between attempts
    let index = 0;
    
    const tryNextPath = () => {
      if (index >= imagePaths.length) {
        console.error('All attempts to load background image failed');
        setBackgroundLoaded(false);
        backgroundImageRef.current = null;
        return;
      }
      
      const img = tryLoadImage(imagePaths[index]);
      
      // Check if already loaded (happens with cached images)
      if (img.complete && img.naturalHeight !== 0) {
        backgroundImageRef.current = img;
        setBackgroundLoaded(true);
      } else {
        // Try next path after a short delay
        index++;
        setTimeout(tryNextPath, 300);
      }
    };
    
    tryNextPath();
  }, [currentConfig.appearance?.backgroundImage]);

  // Aggressive icon preloading on config change
  useEffect(() => {
    iconImageCache.clear();
    
    // Collect all icons that need to be preloaded
    const iconsToPreload = new Set<string>();
    
    // Essential UI icons
    ['network', 'globe', 'wrench'].forEach(icon => {
      iconsToPreload.add(`${icon}-#6b7280`);
    });
    
    // Node icons (both white for main circle and grey for UI elements)
    const processNodes = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.icon) {
          iconsToPreload.add(`${node.icon}-#ffffff`); // White for node circles
          iconsToPreload.add(`${node.icon}-#6b7280`); // Grey for UI elements
        }
        if (node.children) {
          processNodes(node.children);
        }
      });
    };
    
    processNodes(currentConfig.tree.nodes);
    
    // Preload all icons immediately
    const preloadPromises = Array.from(iconsToPreload).map(cacheKey => {
      return new Promise<void>((resolve) => {
        const [iconName, color] = cacheKey.split('-');
        const svgContent = getIconSvg(iconName, color);
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.onload = () => {
          iconImageCache.set(cacheKey, img);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(); // Resolve even on error to not block
        };
        img.src = url;
      });
    });
    
    // Trigger a redraw once all icons are loaded
    Promise.all(preloadPromises).then(() => {
      setIconLoadCounter(prev => prev + 1);
    });
    
  }, [currentConfig, handleIconLoaded]);

  // Calculate positions for tree nodes in a proper vertical tree layout
  const calculateNodePositions = useCallback((): { nodes: PositionedNode[], connections: Connection[] } => {
    const visibleTree = getVisibleTree(currentConfig.tree.nodes, collapsedNodeIds);
    return calculateTreeLayout(visibleTree);
  }, [currentConfig, collapsedNodeIds]);

  // Function to check if mouse is over a status circle for editing
  const getEditButtonHover = useCallback((canvasX: number, canvasY: number): string | null => {
    // Don't check for edit circle hover on mobile/touch
    if (isTouch) return null;
    
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;
    
    const { nodes } = calculateNodePositions();
    
    // Check each node's status circle area
    for (const node of nodes) {
      if (hoveredNodeId === node.id) { // Only check if node is hovered
        // Calculate circle position (same logic as in drawNode)
        const circlePadding = 15; // Consistent padding for circle
        const maxCircleSize = Math.min(node.height - (circlePadding * 2), 60); // Max circle diameter of 60px
        const circleRadius = maxCircleSize * 0.5;
        const circleCenterX = node.x + circlePadding + circleRadius; // Center based on consistent padding
        const circleCenterY = node.y + node.height / 2;
        
        // Check if mouse is within circle bounds
        const distance = Math.sqrt(
          Math.pow(worldX - circleCenterX, 2) + 
          Math.pow(worldY - circleCenterY, 2)
        );
        
        if (distance <= circleRadius) {
          return node.id;
        }
      }
    }
    
    return null;
  }, [transform, calculateNodePositions, hoveredNodeId, isTouch]);

  const getAddButtonHover = useCallback((canvasX: number, canvasY: number): string | null => {
    // Don't check for add button hover on mobile/touch
    if (isTouch) return null;
    
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;
    
    const { nodes } = calculateNodePositions();
    
    // Check each node's add button area
    for (const node of nodes) {
      if (hoveredNodeId === node.id) { // Only check if node is hovered
        const buttonRadius = Math.max(12 / transform.scale, 10);
        const buttonX = node.x + node.width / 2;
        const buttonY = node.y + node.height;
        
        // Check if mouse is within button bounds
        const distance = Math.sqrt(
          Math.pow(worldX - buttonX, 2) + 
          Math.pow(worldY - buttonY, 2)
        );
        
        if (distance <= buttonRadius) {
          return node.id;
        }
      }
    }
    
    return null;
  }, [transform, calculateNodePositions, hoveredNodeId, isTouch]);

  // Function to check if a point is inside a node
  const getNodeAtPosition = useCallback((canvasX: number, canvasY: number): PositionedNode | null => {
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;
    
    const { nodes } = calculateNodePositions();
    
    // Find the node that contains this point
    for (const node of nodes) {
      // Check main node body
      if (
        worldX >= node.x &&
        worldX <= node.x + node.width &&
        worldY >= node.y &&
        worldY <= node.y + node.height
      ) {
        return node;
      }

      // Check add button area (bottom edge)
      // Only if not mobile
      if (!isTouch) {
        const buttonRadius = Math.max(12 / transform.scale, 10);
        const buttonX = node.x + node.width / 2;
        const buttonY = node.y + node.height;
        
        const distance = Math.sqrt(
          Math.pow(worldX - buttonX, 2) + 
          Math.pow(worldY - buttonY, 2)
        );
        
        if (distance <= buttonRadius) {
          return node;
        }
      }
    }
    
    return null;
  }, [transform, calculateNodePositions]);

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

  // ...existing code...

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Function to draw a perfect pill shape with circular ends
  const drawPillShape = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    const radius = height / 2;
    ctx.beginPath();
    // Left semicircle
    ctx.arc(x + radius, y + radius, radius, Math.PI / 2, 3 * Math.PI / 2);
    // Top line
    ctx.lineTo(x + width - radius, y);
    // Right semicircle
    ctx.arc(x + width - radius, y + radius, radius, 3 * Math.PI / 2, Math.PI / 2);
    // Bottom line
    ctx.lineTo(x + radius, y + height);
    ctx.closePath();
  };

  // Function to draw an angular shape with diamond-like sides
  const drawAngularShape = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    const cornerSize = Math.min(width * 0.1, height * 0.3); // Diamond corner size
    ctx.beginPath();
    // Start from top-left corner
    ctx.moveTo(x + cornerSize, y);
    // Top edge
    ctx.lineTo(x + width - cornerSize, y);
    // Top-right diamond corner
    ctx.lineTo(x + width, y + cornerSize);
    ctx.lineTo(x + width, y + height - cornerSize);
    // Bottom-right diamond corner
    ctx.lineTo(x + width - cornerSize, y + height);
    // Bottom edge
    ctx.lineTo(x + cornerSize, y + height);
    // Bottom-left diamond corner
    ctx.lineTo(x, y + height - cornerSize);
    ctx.lineTo(x, y + cornerSize);
    // Top-left diamond corner
    ctx.lineTo(x + cornerSize, y);
    ctx.closePath();
  };

  // Draw node (single node drawing)
  const drawNode = (ctx: CanvasRenderingContext2D, node: PositionedNode, scale: number, _config: AppConfig, isHovered: boolean = false, isEditButtonHovered: boolean = false, isMobile: boolean = false, isAddButtonHovered: boolean = false) => {
    const { x, y, width, type, title, subtitle, ip, url } = node;
    
    // Adjust height for mobile - make it slightly shorter
    const height = isMobile ? node.height - 10 : node.height;
    
    // Pre-calculate layout values with consistent circle padding
    const circlePadding = 15; // Consistent padding for circle on left, top, and bottom
    const maxCircleSize = Math.min(height - (circlePadding * 2), 60); // Max circle diameter of 60px
    const circleRadius = maxCircleSize * 0.5;
    const circleCenterX = x + circlePadding + circleRadius; // Center based on consistent padding
    const circleCenterY = y + height / 2; // Centered vertically
    
    // Text area starts after circle with some spacing
    const textAreaX = circleCenterX + circleRadius + 10; // 10px gap after circle
    const textAreaWidth = width - (textAreaX - x);
    
    // Calculate font sizes with clamping to prevent overflow when zoomed out
    // We want text to stay readable (inverse to scale) but not grow larger than the node can handle
    // Max sizes ensure text fits within the node width (280px) and height (90px)
    const maxTitleSize = 24; 
    const maxSubtitleSize = 18;
    const maxDetailSize = 16;
    
    const titleFontSize = Math.min(Math.max(14 / scale, 10), maxTitleSize);
    const subtitleFontSize = Math.min(Math.max(11 / scale, 8), maxSubtitleSize);
    const detailFontSize = Math.min(Math.max(10 / scale, 7), maxDetailSize);
    
    const titleX = textAreaX + 10;
    const titleY = y + 8;
    
    // Calculate title coordinates and measurements
    ctx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
    
    // Determine border radius based on node type
    const borderRadius = type === 'circular' ? height / 2 : (type === 'angular' ? 0 : 12); // Perfect pill for circular, no radius for angular, normal radius for square
    
    // Get the current status for this node (use NEW ARCHITECTURE: internalAddress or legacy ip:healthCheckPort format)
    let originalIdentifier = node.internalAddress;
    if (!originalIdentifier) {
      originalIdentifier = node.healthCheckPort && node.ip 
        ? `${node.ip}:${node.healthCheckPort}` 
        : (ip || url);
    }
    
    // Get status using the original identifier to match the API response format
    const nodeStatus = originalIdentifier 
      ? getNodeStatus(originalIdentifier) 
      : { status: 'checking' as const, lastChecked: new Date().toISOString(), statusChangedAt: new Date().toISOString(), progress: 0 };
    
    // Check if node has health monitoring disabled
    const isExplicitlyDisabled = node.disableHealthCheck;
    // For missing config, check if we have internalAddress OR (ip + healthCheckPort)
    const isMissingConfig = !node.internalAddress && !node.healthCheckPort;
    const isMonitoringDisabled = isExplicitlyDisabled || isMissingConfig;

    // Apply soft shadow using blur (save context to restore after shadow drawing)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Draw node background with shadow (normal styling regardless of hasWebGui)
    ctx.fillStyle = '#ffffff';
    if (type === 'circular') {
      drawPillShape(ctx, x, y, width, height);
    } else if (type === 'angular') {
      drawAngularShape(ctx, x, y, width, height);
    } else {
      drawRoundedRect(ctx, x, y, width, height, borderRadius);
    }
    ctx.fill();
    
    // Reset shadow
    ctx.restore();

    // Draw node border (normal styling regardless of hasWebGui)
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1 / scale;
    if (type === 'circular') {
      drawPillShape(ctx, x, y, width, height);
    } else if (type === 'angular') {
      drawAngularShape(ctx, x, y, width, height);
    } else {
      drawRoundedRect(ctx, x, y, width, height, borderRadius);
    }
    ctx.stroke();
    
    // Use the pre-calculated circle values from the top of the function
    
    // Set circle color based on node status - gray if no IP/URL provided or monitoring is disabled
    let circleColor = '#6b7280'; // Default gray for checking or no identifier
    let circleOpacity = 1.0; // Default full opacity
    
    if (isExplicitlyDisabled || isMissingConfig || !originalIdentifier) {
      // Gray circle for disabled nodes or nodes without IP/URL
      circleColor = '#6b7280';
    } else if (nodeStatus.status === 'online') {
      circleColor = '#10b981'; // Green for online
    } else if (nodeStatus.status === 'offline') {
      circleColor = '#ef4444'; // Red for offline
    } else if (nodeStatus.status === 'checking') {
      // Create subtle shimmer effect for loading state
      const time = Date.now() / 1000; // Get current time in seconds
      const pulseSpeed = 1.2; // Medium speed animation - 1.2 cycles per second
      const minOpacity = 0.55; // Lower minimum opacity for more noticeable effect
      const maxOpacity = 0.8; // Higher maximum opacity for more pronounced effect
      const pulse = Math.sin(time * pulseSpeed * Math.PI * 2) * 0.5 + 0.5; // Normalized sine wave (0-1)
      circleOpacity = minOpacity + (maxOpacity - minOpacity) * pulse;
    }
    
    ctx.save();
    ctx.globalAlpha = circleOpacity;
    ctx.fillStyle = circleColor;
    ctx.beginPath();
    ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Draw normal node icon first
    if (node.icon) {
      const iconSize = circleRadius * 1.2; // Icon size relative to circle
      drawIconOnCanvas(ctx, node.icon, circleCenterX, circleCenterY, iconSize, '#ffffff', handleIconLoaded);
    }
    
    // Draw edit overlay when hovering over the node (not just the circle)
    if (isHovered && !isMobile) {
      // Dark transparent overlay
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Smaller pencil icon on top
      const pencilIconSize = circleRadius * 0.8; // Smaller than the normal icon
      drawIconOnCanvas(ctx, 'pencil', circleCenterX, circleCenterY, pencilIconSize, '#ffffff', handleIconLoaded);
      
      // Additional hover ring when specifically hovering over the circle
      if (isEditButtonHovered) {
        ctx.strokeStyle = '#3b82f6'; // Blue edit hover color
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.arc(circleCenterX, circleCenterY, circleRadius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    
    // Set font for text (Roboto)
    // Use the pre-calculated font sizes from the top of the function
    
    // Draw title in the right 2/3 area
    ctx.fillStyle = '#1f2937';
    ctx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Use the pre-calculated titleX and titleY values
    ctx.fillText(title, titleX, titleY);
    
    // Draw status duration badge next to title - only for nodes with monitoring enabled
    if (nodeStatus && (nodeStatus.statusChangedAt || nodeStatus.lastChecked) && !isMonitoringDisabled && originalIdentifier) {
      const duration = formatTimeSince(nodeStatus.statusChangedAt || nodeStatus.lastChecked);
      const statusText = `${nodeStatus.status} for ${duration}`;
      
      // Calculate badge position next to title
      const titleWidth = ctx.measureText(title).width;
      const badgeMargin = Math.max(8 / scale, 6);
      const badgeX = titleX + titleWidth + badgeMargin;
      
      // Badge styling
      const badgeFontSize = Math.min(Math.max(9 / scale, 7), 14);
      const badgePadding = Math.min(Math.max(4 / scale, 2), 6);
      const badgeHeight = badgeFontSize + (badgePadding * 2);
      
      ctx.font = `500 ${badgeFontSize}px Roboto, sans-serif`;
      const badgeTextWidth = ctx.measureText(statusText).width;
      const badgeWidth = badgeTextWidth + (badgePadding * 2);
      
      // Align badge vertically with title
      const badgeY = titleY + (titleFontSize - badgeHeight) / 2;
      
      // Badge colors based on status - using same colors as mobile for consistency
      const badgeColors = {
        online: { bg: '#bbf7d0', text: '#166534' }, // Light green (green-200), dark green text (green-800)
        offline: { bg: '#fecaca', text: '#991b1b' }, // Light red (red-200), dark red text (red-800)
        checking: { bg: '#e5e7eb', text: '#4b5563' } // Light gray (gray-200), dark gray text (gray-600)
      };
      
      const colors = badgeColors[nodeStatus.status] || badgeColors.checking;
      
      // Draw badge background with rounded corners
      ctx.fillStyle = colors.bg;
      ctx.beginPath();
      const badgeRadius = Math.min(badgeHeight / 2, 6);
      ctx.moveTo(badgeX + badgeRadius, badgeY);
      ctx.lineTo(badgeX + badgeWidth - badgeRadius, badgeY);
      ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + badgeRadius);
      ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - badgeRadius);
      ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - badgeRadius, badgeY + badgeHeight);
      ctx.lineTo(badgeX + badgeRadius, badgeY + badgeHeight);
      ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - badgeRadius);
      ctx.lineTo(badgeX, badgeY + badgeRadius);
      ctx.quadraticCurveTo(badgeX, badgeY, badgeX + badgeRadius, badgeY);
      ctx.fill();
      
      // Draw badge text
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
      
      // Reset text alignment
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
    
    // Draw subtitle
    ctx.fillStyle = '#6b7280';
    ctx.font = `400 ${subtitleFontSize}px Roboto, sans-serif`;
    
    const subtitleX = textAreaX + 10;
    const subtitleY = titleY + titleFontSize + 4;
    ctx.fillText(subtitle, subtitleX, subtitleY);
    
    let currentY = subtitleY + subtitleFontSize + 8;
    const iconSize = Math.min(Math.max(16 / scale, 12), 24); // Larger minimum size, scales better with zoom
    
    // Draw Minecraft Player Count if available - Prominently on the right
    if ('players' in nodeStatus && nodeStatus.players) {
      // Position on the right side of the card
      const rightPadding = 25;
      const rightX = x + width - rightPadding;
      const centerY = y + height / 2;
      
      // Draw "X / Y" large
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#dc2626'; // Red color as per mockup (or maybe just dark? Mockup had red circle, text was red)
      // Wait, the mockup had red text "1/20 players". I'll use a prominent color.
      // The user said "make the toggles... adhere to accent color". Maybe this should too?
      // But the mockup had red. I'll stick to a dark color or accent color.
      // Actually, the mockup text "1/20 players" was written in red marker by the user on the screenshot, not the UI itself.
      // The UI text should probably be standard dark text.
      ctx.fillStyle = '#1f2937'; 
      
      // Use a large font, but scale it
      const largeFontSize = Math.min(Math.max(28 / scale, 18), 36);
      ctx.font = `700 ${largeFontSize}px Roboto, sans-serif`; // Bold
      
      const countText = `${nodeStatus.players.online}/${nodeStatus.players.max}`;
      ctx.fillText(countText, rightX, centerY + 2); 
      
      // Draw "players" small below
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#6b7280'; // Gray text
      const labelFontSize = Math.min(Math.max(12 / scale, 9), 16);
      ctx.font = `500 ${labelFontSize}px Roboto, sans-serif`;
      ctx.fillText('players', rightX, centerY + 4);
      
      // Reset alignment
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      // Don't increment currentY so the IP address stays below the subtitle
    }
    
    // Draw IP with network icon (only if IP is provided, otherwise show "No IP" if URL exists)
    // For Minecraft nodes, we always want to show the address if available
    const showAddress = ip || url || (node.healthCheckType === 'minecraft' && node.internalAddress);
    
    if (showAddress) {
      // Calculate vertical center alignment
      const textHeight = detailFontSize;
      const iconCenterY = currentY + textHeight / 2;
      
      // Draw network icon using regular icon system for better performance and reliability
      drawIconOnCanvas(ctx, 'network', textAreaX + 10 + iconSize/2, iconCenterY, iconSize * 0.8, '#6b7280', handleIconLoaded);
      
      // Draw IP text with port (if healthCheckPort available) or "No IP" if only URL is available
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 ${detailFontSize}px Roboto, sans-serif`;
      
      let displayText = 'No IP';
      if (node.healthCheckType === 'minecraft' && node.internalAddress) {
        displayText = node.internalAddress;
      } else if (ip) {
        displayText = node.healthCheckPort ? `${ip}:${node.healthCheckPort}` : ip;
      }
      
      ctx.fillText(displayText, textAreaX + 10 + iconSize + 6, currentY); // Increased gap to 6px
      
      currentY += detailFontSize + 6;
    }
    
    // Draw URL with globe icon (only if URL is provided)
    if (url) {
      // Calculate vertical center alignment
      const textHeight = detailFontSize;
      const iconCenterY = currentY + textHeight / 2;
      
      // Draw globe icon using regular icon system for better performance and reliability
      drawIconOnCanvas(ctx, 'globe', textAreaX + 10 + iconSize/2, iconCenterY, iconSize * 0.8, '#6b7280', handleIconLoaded);
      
      // Draw URL text (truncate if too long)
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 ${detailFontSize}px Roboto, sans-serif`;
      
      const maxUrlWidth = textAreaWidth - 20 - iconSize - 2; // Account for increased gap
      let displayUrl = url;
      
      // Simple URL truncation
      if (ctx.measureText(displayUrl).width > maxUrlWidth) {
        while (ctx.measureText(displayUrl + '...').width > maxUrlWidth && displayUrl.length > 10) {
          displayUrl = displayUrl.slice(0, -1);
        }
        displayUrl += '...';
      }
      
      ctx.fillText(displayUrl, textAreaX + 10 + iconSize + 6, currentY); // Increased gap to 6px
    }

    // Draw Add Child button on hover (bottom edge)
    if (isHovered && !isMobile) {
      const buttonRadius = Math.max(12 / scale, 10); // Scale the button size, but keep min size
      const buttonX = x + width / 2;
      const buttonY = y + height; // On the bottom edge
      
      // Draw button background
      ctx.beginPath();
      ctx.arc(buttonX, buttonY, buttonRadius, 0, Math.PI * 2);
      ctx.fillStyle = isAddButtonHovered ? '#3b82f6' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1 / scale;
      ctx.stroke();
      
      // Draw plus icon
      const iconSize = buttonRadius * 0.5;
      ctx.beginPath();
      ctx.moveTo(buttonX - iconSize, buttonY);
      ctx.lineTo(buttonX + iconSize, buttonY);
      ctx.moveTo(buttonX, buttonY - iconSize);
      ctx.lineTo(buttonX, buttonY + iconSize);
      ctx.strokeStyle = isAddButtonHovered ? '#ffffff' : '#6b7280';
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }
  };

  const drawConnection = (ctx: CanvasRenderingContext2D, connection: Connection, scale: number) => {
    const { from, to, isFirstChild, isLastChild } = connection;
    
    // Calculate connection points (bottom center of parent to top center of child)
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height;
    const endX = to.x + to.width / 2;
    const endY = to.y;
    
    // Draw connection line with proper T-junction and X-crossing corner rounding
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = Math.min(Math.max(5 / scale, 3), 12);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const midY = startY + (endY - startY) / 2;
    const cornerRadius = Math.min(Math.max(6 / scale, 3), 20);
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    
    if (startX === endX) {
      // Straight down - no horizontal component, no rounding needed
      ctx.lineTo(endX, endY);
    } else {
      // We have a turn - only round corners that are truly "inside" corners
      const isMovingRight = endX > startX;
      
      // Only round corners for edge children (first or last), and only the corners
      // that don't interfere with potential sibling connections
      if (isFirstChild || isLastChild) {
        // For edge children, we can safely round both corners since there's no 
        // interference with sibling connections on the "outside" of the turn
        
        // Draw vertical line down to turn point
        ctx.lineTo(startX, midY - cornerRadius);
        
        // Round the corner where we turn horizontally
        if (isMovingRight) {
          ctx.arcTo(startX, midY, startX + cornerRadius, midY, cornerRadius);
        } else {
          ctx.arcTo(startX, midY, startX - cornerRadius, midY, cornerRadius);
        }
        
        // Draw horizontal line
        ctx.lineTo(endX + (isMovingRight ? -cornerRadius : cornerRadius), midY);
        
        // Round the corner where we turn down to child
        ctx.arcTo(endX, midY, endX, midY + cornerRadius, cornerRadius);
        
        // Draw final vertical line to child
        ctx.lineTo(endX, endY);
      } else {
        // For middle children, we're creating a T-junction where the vertical line
        // from the parent continues through to other siblings. We should NOT round
        // the corner at the parent's vertical line (that would break the T-junction),
        // but we CAN round the corner where we turn down to the child.
        
        // Draw straight vertical line to horizontal level (no rounding here)
        ctx.lineTo(startX, midY);
        
        // Draw horizontal line to child position, but leave space for corner rounding
        ctx.lineTo(endX + (isMovingRight ? -cornerRadius : cornerRadius), midY);
        
        // Round only the corner where we turn down to the child
        ctx.arcTo(endX, midY, endX, midY + cornerRadius, cornerRadius);
        
        // Draw final vertical line to child
        ctx.lineTo(endX, endY);
      }
    }
    
    ctx.stroke();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw static background image (not affected by transform) with cover behavior
    // Only draw if background is not disabled
    if (backgroundLoaded && backgroundImageRef.current) {
      const img = backgroundImageRef.current;
      const canvasAspect = canvas.width / canvas.height;
      const imgAspect = img.width / img.height;
      let drawWidth, drawHeight, drawX, drawY;
      // Object-fit: cover behavior - scale image to completely fill canvas
      if (canvasAspect > imgAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgAspect;
        drawY = 0;
        drawX = (canvas.width - drawWidth) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }
    
    // Save context state for transformed content
    ctx.save();
    
    // Apply transform only to content (nodes and connections), not background
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    
    // Calculate node positions and connections
    const { nodes, connections } = calculateNodePositions();
    
    // Draw connections first (so they appear behind the nodes)
    connections.forEach(connection => {
      drawConnection(ctx, connection, transform.scale);
    });
    
    // Draw the nodes
    nodes.forEach(node => {
      const isNodeHovered = hoveredNodeIdRef.current === node.id;
      const isEditButtonHovered = hoveredEditButtonNodeIdRef.current === node.id;
      const isAddButtonHovered = hoveredAddButtonNodeIdRef.current === node.id;
      drawNode(ctx, node, transform.scale, currentConfig, isNodeHovered, isEditButtonHovered, isTouch, isAddButtonHovered);

      // Draw collapse/expand buttons
      const isCollapsed = collapsedNodeIds.has(node.id);
      const originalNode = findNodeById(currentConfig.tree.nodes, node.id);
      const hasChildren = originalNode && originalNode.children && originalNode.children.length > 0;
      
      if (hasChildren) {
        // Mobile/Touch: Draw permanent button on the left side
        if (isTouch) {
          const buttonSize = 36 / transform.scale;
          const buttonX = node.x; // Left edge of node
          const buttonY = node.y + node.height / 2;
          
          // Draw circle button (half overlapping)
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#e5e7eb'; // Light gray border
          ctx.lineWidth = 1 / transform.scale;
          
          // Add shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
          ctx.shadowBlur = 4 / transform.scale;
          ctx.shadowOffsetY = 2 / transform.scale;

          ctx.beginPath();
          ctx.arc(buttonX, buttonY, buttonSize/2, 0, Math.PI * 2); // Full circle
          ctx.fill();
          
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.stroke();
          
          // Draw Icon (Chevron Left/Right or Minus/Plus)
          const iconSize = buttonSize * 0.4;
          const iconX = buttonX; // Center of button
          const iconY = buttonY;
          
          ctx.beginPath();
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = 2 / transform.scale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          if (isCollapsed) {
            // Chevron Right (Expand)
            ctx.moveTo(iconX - iconSize/4, iconY - iconSize/2);
            ctx.lineTo(iconX + iconSize/4, iconY);
            ctx.lineTo(iconX - iconSize/4, iconY + iconSize/2);
          } else {
            // Chevron Left (Collapse)
            ctx.moveTo(iconX + iconSize/4, iconY - iconSize/2);
            ctx.lineTo(iconX - iconSize/4, iconY);
            ctx.lineTo(iconX + iconSize/4, iconY + iconSize/2);
          }
          ctx.stroke();
        } 
        // Desktop: Draw hover buttons on the line
        else {
          const buttonSize = Math.min(Math.max(20 / transform.scale, 16), 30);
          const buttonX = node.x + node.width / 2;
          const buttonY = node.y + node.height + (12 / transform.scale);
          
          if (isCollapsed) {
            // Draw Expand Button
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1 / transform.scale;
            
            const childCount = originalNode!.children!.length;
            const countText = `${childCount} hidden nodes`;
            ctx.font = `500 ${12 / transform.scale}px Roboto, sans-serif`;
            const textWidth = ctx.measureText(countText).width;
            const padding = 12 / transform.scale;
            const pillWidth = textWidth + buttonSize + padding;
            const pillHeight = Math.max(24 / transform.scale, 20);
            
            // Draw pill background with shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 4 / transform.scale;
            ctx.shadowOffsetY = 2 / transform.scale;
            
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(buttonX - pillWidth/2, buttonY, pillWidth, pillHeight, pillHeight/2);
            } else {
              // Fallback for older browsers
              ctx.moveTo(buttonX - pillWidth/2 + pillHeight/2, buttonY);
              ctx.lineTo(buttonX + pillWidth/2 - pillHeight/2, buttonY);
              ctx.arc(buttonX + pillWidth/2 - pillHeight/2, buttonY + pillHeight/2, pillHeight/2, -Math.PI/2, Math.PI/2);
              ctx.lineTo(buttonX - pillWidth/2 + pillHeight/2, buttonY + pillHeight);
              ctx.arc(buttonX - pillWidth/2 + pillHeight/2, buttonY + pillHeight/2, pillHeight/2, Math.PI/2, -Math.PI/2);
            }
            ctx.fill();
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.stroke();
            
            // Draw Chevron Down
            const iconX = buttonX - pillWidth/2 + pillHeight/2;
            const iconY = buttonY + pillHeight/2;
            const iconSize = pillHeight * 0.4;
            
            ctx.beginPath();
            ctx.moveTo(iconX - iconSize/2, iconY - iconSize/4);
            ctx.lineTo(iconX, iconY + iconSize/4);
            ctx.lineTo(iconX + iconSize/2, iconY - iconSize/4);
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 2 / transform.scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            
            // Draw Count
            ctx.fillStyle = '#4b5563';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(countText, iconX + iconSize/2 + (6/transform.scale), iconY);
            
          } else if (hoveredLineParentId === node.id) {
            // Draw Collapse Button (Chevron Up)
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1 / transform.scale;
            
            // Add shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 4 / transform.scale;
            ctx.shadowOffsetY = 2 / transform.scale;
            
            ctx.beginPath();
            ctx.arc(buttonX, buttonY + buttonSize/2, buttonSize/2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.stroke();
            
            // Draw Chevron Up
            const iconX = buttonX;
            const iconY = buttonY + buttonSize/2;
            const iconSize = buttonSize * 0.5;
            
            ctx.beginPath();
            ctx.moveTo(iconX - iconSize/2, iconY + iconSize/4);
            ctx.lineTo(iconX, iconY - iconSize/4);
            ctx.lineTo(iconX + iconSize/2, iconY + iconSize/4);
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 2 / transform.scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
        }
      }
    });
    
    // Restore context state
    ctx.restore();
  }, [backgroundLoaded, calculateNodePositions, getNodeStatus, iconLoadCounter, currentConfig, transform, hoveredNodeId, hoveredEditButtonNodeId, collapsedNodeIds, hoveredLineParentId]);

  // Use requestAnimationFrame for smooth redraws with simple throttling
  const animationFrameRef = useRef<number | null>(null);
  
  const requestDraw = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return; // Already have a pending animation frame
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      draw();
    });
  }, [draw]);
  
  // Simple ref updates (no redraw triggers needed since draw depends on state)
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  
  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId;
  }, [hoveredNodeId]);
  
  useEffect(() => {
    hoveredEditButtonNodeIdRef.current = hoveredEditButtonNodeId;
  }, [hoveredEditButtonNodeId]);

  const resetView = useCallback(() => {
    // Reset to the initial calculated transform
    setTransform(initialTransform);
  }, [initialTransform]);

  const fitToContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
    const scaleX = canvas.width / contentWidth;
    const scaleY = canvas.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.5); // Max scale of 1.5
    
    // Calculate center position
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const x = canvas.width / 2 - centerX * scale;
    const y = canvas.height / 2 - centerY * scale;
    
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    setMouseDownPos({ x: canvasX, y: canvasY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Check if hovering over a node for cursor management
    const hoveredNode = getNodeAtPosition(canvasX, canvasY);
    setHoveredNodeId(hoveredNode ? hoveredNode.id : null); // Track which node is hovered for edit button
    
    // Check if hovering over an edit button specifically
    const editButtonHovered = getEditButtonHover(canvasX, canvasY);
    setHoveredEditButtonNodeId(editButtonHovered);

    // Check if hovering over an add button specifically
    const addButtonHovered = getAddButtonHover(canvasX, canvasY);
    setHoveredAddButtonNodeId(addButtonHovered);
    
    // Update cursor state
    setIsHoveringNode((!!hoveredNode && !!hoveredNode.url) || !!editButtonHovered || !!addButtonHovered);
    
    // Handle tooltip for edit circle hover
    if (editButtonHovered && !isTouch) {
      setTooltip({
        text: 'Edit node',
        x: e.clientX + 10,
        y: e.clientY - 30
      });
    } else if (addButtonHovered && !isTouch) {
      setTooltip({
        text: 'Add child node',
        x: e.clientX + 10,
        y: e.clientY - 30
      });
    } else {
      setTooltip(null);
    }

    // Check for hover on collapse/expand buttons or lines
    if (!isDragging && !isTouch) {
      const worldX = (canvasX - transform.x) / transform.scale;
      const worldY = (canvasY - transform.y) / transform.scale;
      
      const { nodes } = calculateNodePositions();
      let foundHoveredLine = null;
      
      for (const node of nodes) {
        const originalNode = findNodeById(currentConfig.tree.nodes, node.id);
        if (!originalNode || !originalNode.children || originalNode.children.length === 0) continue;
        
        // Check area below node where line/button is
        const buttonX = node.x + node.width / 2;
        // Hit area for the line/button
        const hitWidth = 40 / transform.scale;
        const hitHeight = 40 / transform.scale;
        
        if (
          worldX >= buttonX - hitWidth/2 &&
          worldX <= buttonX + hitWidth/2 &&
          worldY >= node.y + node.height &&
          worldY <= node.y + node.height + hitHeight
        ) {
          foundHoveredLine = node.id;
          break;
        }
      }
      
      setHoveredLineParentId(foundHoveredLine);
    }
    
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

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return; // Prevent handling if not dragging
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Check if this was a click (minimal movement) vs a drag
    const dragDistance = Math.sqrt(
      Math.pow(canvasX - mouseDownPos.x, 2) + 
      Math.pow(canvasY - mouseDownPos.y, 2)
    );
    
    const wasClick = dragDistance < 5; // Less than 5 pixels movement = click
    
    if (wasClick) {
      // Check for collapse/expand button click
      const worldX = (canvasX - transform.x) / transform.scale;
      const worldY = (canvasY - transform.y) / transform.scale;
      
      const { nodes } = calculateNodePositions();
      let buttonClicked = false;
      
      for (const node of nodes) {
        const originalNode = findNodeById(currentConfig.tree.nodes, node.id);
        if (!originalNode || !originalNode.children || originalNode.children.length === 0) continue;
        
        let hit = false;
        
        if (isTouch) {
          // Mobile/Touch: Check side button
          const buttonSize = 36 / transform.scale;
          const buttonX = node.x;
          const buttonY = node.y + node.height / 2;
          
          // Check circle hit area
          const dist = Math.sqrt(Math.pow(worldX - buttonX, 2) + Math.pow(worldY - buttonY, 2));
          if (dist <= buttonSize/2) {
            hit = true;
          }
        } else {
          // Desktop: Check bottom button
          const buttonX = node.x + node.width / 2;
          const hitWidth = 40 / transform.scale;
          const hitHeight = 40 / transform.scale;
          
          // Expand hit area for the wider "hidden nodes" button if collapsed
          const isCollapsed = collapsedNodeIds.has(node.id);
          const effectiveHitWidth = isCollapsed ? 120 / transform.scale : hitWidth;
          
          if (
            worldX >= buttonX - effectiveHitWidth/2 &&
            worldX <= buttonX + effectiveHitWidth/2 &&
            worldY >= node.y + node.height &&
            worldY <= node.y + node.height + hitHeight
          ) {
            hit = true;
          }
        }
        
        if (hit) {
          buttonClicked = true;
          
          setCollapsedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }
            return next;
          });
          
          break; 
        }
      }
      
      if (!buttonClicked) {
        // Check for add button click
        if (!isTouch && hoveredAddButtonNodeId) {
          handleAddChildNode(hoveredAddButtonNodeId);
          setIsDragging(false);
          return;
        }

        // If we clicked elsewhere on mobile, clear the hover state (though less relevant now with permanent buttons)
        if (isTouch) {
          setHoveredLineParentId(null);
        }

        // Check for edit circle click first - only if we're hovering a node
        if (hoveredNodeId) {
          const hoveredNode = getNodeAtPosition(canvasX, canvasY);
          if (hoveredNode && hoveredNode.id === hoveredNodeId) {
            // Calculate circle bounds for the hovered node
            const worldX = (canvasX - transform.x) / transform.scale;
            const worldY = (canvasY - transform.y) / transform.scale;
            
            // Calculate circle position (same logic as in drawNode)
            const circlePadding = 15; // Consistent padding for circle
            const maxCircleSize = Math.min(hoveredNode.height - (circlePadding * 2), 60); // Max circle diameter of 60px
            const circleRadius = maxCircleSize * 0.5;
            const circleCenterX = hoveredNode.x + circlePadding + circleRadius; // Center based on consistent padding
            const circleCenterY = hoveredNode.y + hoveredNode.height / 2;
            
            // Check if click is within circle bounds
            const distance = Math.sqrt(
              Math.pow(worldX - circleCenterX, 2) + 
              Math.pow(worldY - circleCenterY, 2)
            );
            
            if (distance <= circleRadius) {
              // Circle clicked - open edit dialog!
              handleEditNode(hoveredNode.id);
              setIsDragging(false); // Ensure we reset dragging state
              return;
            }
          }
        }
        
        // Check for regular node click
        const clickedNode = getNodeAtPosition(canvasX, canvasY);
        if (clickedNode) {
          openNodeUrl(clickedNode);
        }
      }
    }
    
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setIsHoveringNode(false);
    setHoveredNodeId(null);
    setHoveredEditButtonNodeId(null);
    setTooltip(null);
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      requestDraw();
    };

    // Add wheel event listener manually to avoid passive event listener issues
    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [requestDraw, handleWheel]);

  // Only redraw on essential changes, not on every draw function recreation
  useEffect(() => {
    requestDraw();
  }, [backgroundLoaded, iconLoadCounter, currentConfig, requestDraw]);

  // Continuous animation for shimmer effect when nodes are checking
  useEffect(() => {
    let animationId: number | null = null;
    
    const checkForLoadingNodes = () => {
      // Check if any nodes are in checking state
      const { nodes } = calculateNodePositions();
      const hasCheckingNodes = nodes.some(node => {
        // Use the original identifier (not normalized) to match API response format
        const nodeIdentifier = node.ip || node.url;
        if (!nodeIdentifier) return false;
        
        // Use the original identifier directly to match API response
        const status = getNodeStatus(nodeIdentifier);
        return status.status === 'checking';
      });
      
      if (hasCheckingNodes) {
        requestDraw();
        animationId = requestAnimationFrame(checkForLoadingNodes);
      }
    };
    
    // Start the animation loop
    checkForLoadingNodes();
    
       
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [calculateNodePositions, getNodeStatus, requestDraw]);

  // Auto-fit content on initial load only
  useEffect(() => {
    if (backgroundLoaded && !isInitialized) {
      const timer = setTimeout(() => {
        fitToContent();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [backgroundLoaded, isInitialized, fitToContent]);

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

  return (
    <div className="w-full h-full relative font-roboto" ref={containerRef}>
      {/* Fallback background image as CSS - will be visible if canvas background doesn't load */}
      {!backgroundLoaded && currentConfig.appearance?.backgroundImage && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat" 
          style={{ 
            backgroundImage: `url(${currentConfig.appearance.backgroundImage})`,
            opacity: 0.3 
          }} 
        />
      )}
      
      {/* Desktop view with canvas */}
      {!isMobile && (
        <>
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${isHoveringNode ? 'cursor-pointer' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
          
          {/* Empty nodes fallback for desktop */}
          {currentConfig.tree.nodes.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <EmptyNodesFallback 
                onCreateStartingNode={handleCreateStartingNode}
                appConfig={currentConfig}
                onRestoreConfig={handleLoadConfig}
              />
            </div>
          )}
          
          {/* Controls - only show when user has moved away from initial position */}
          {hasMovedFromInitial() && (
            <div className="absolute bottom-4 left-4">
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
          {/* Fallback background in case the first one fails */}
          {!backgroundLoaded && (
            <div 
              className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none" 
              style={{ 
                backgroundImage: 'url(/background.png)',
                opacity: 0.3 
              }} 
            />
          )}
          
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

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-800 text-white text-sm px-2 py-1 rounded shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Mobile Node List - Shown only on mobile devices */}
      {/* {isMobile && currentConfig.tree.nodes.length > 0 && (
        <div className="absolute inset-0 z-10 p-4 pointer-events-none">
          <MobileNodeList nodes={currentConfig.tree.nodes} />
        </div>
      )} */}

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