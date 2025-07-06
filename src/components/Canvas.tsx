import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TreeNode, AppConfig } from '../types/config';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useAppearance } from '../hooks/useAppearance';
import StatusCard from './StatusCard';
import Settings from './Settings';
import { NodeEditor } from './NodeEditor';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import MobileNodeList from './MobileNodeList';
import { 
  iconImageCache, 
  iconSvgCache, 
  getIconSvg, 
  extractIconsFromConfig,
  drawIconOnCanvas
} from '../utils/iconUtils';

const initialAppConfig: AppConfig = {
  appearance: {
    title: "Nautilus",
    accentColor: "#3b82f6",
    backgroundImage: "",
    favicon: "",
    logo: ""
  },
  tree: {
    nodes: []
  },
  server: {
    port: 3069,
    healthCheckInterval: 20000,
    corsOrigins: ["http://localhost:3070"]
  },
  client: {
    port: 3070,
    host: "localhost",
    apiPollingInterval: 5000
  }
};

interface PositionedNode extends TreeNode {
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

interface Connection {
  from: PositionedNode;
  to: PositionedNode;
}

const Canvas: React.FC = () => {
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(undefined);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [currentConfig, setCurrentConfig] = useState<AppConfig>(initialAppConfig);
  const [iconLoadCounter, setIconLoadCounter] = useState(0); // Track icon loading to trigger redraws
  const [iconsPreloaded, setIconsPreloaded] = useState(false); // Track icon preloading status
  
  // Use refs for values that should not trigger draw function recreation
  const transformRef = useRef(transform);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const hoveredEditButtonNodeIdRef = useRef(hoveredEditButtonNodeId);
  
  // Use device detection
  const { isMobile } = useDeviceDetection();
  
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
  useAppearance(currentConfig.appearance || { title: 'Nautilus', accentColor: '#3b82f6' });

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

    fetchCurrentConfig();
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
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
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
  
  const handleEditNode = (nodeId: string) => {
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

  const handleEditChildNode = (childNode: TreeNode) => {
    // Create a safe copy of the node before setting it
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
  
  // Node dimensions and spacing
  const NODE_WIDTH = 220; // Node width
  const NODE_HEIGHT = 90;  // Node height
  const HORIZONTAL_SPACING = 25; // Reduced horizontal gap between nodes
  const VERTICAL_SPACING = 40;   // Reduced vertical gap between levels

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
    const positionedNodes: PositionedNode[] = [];
    const connections: Connection[] = [];
    
    if (currentConfig.tree.nodes.length === 0) return { nodes: positionedNodes, connections };
    
    // Handle multiple root nodes by treating them as siblings
    const rootNodes = currentConfig.tree.nodes;
    
    // First pass: calculate the width requirement for each subtree
    const calculateSubtreeWidth = (node: TreeNode): number => {
      if (!node.children || node.children.length === 0) {
        return NODE_WIDTH;
      }
      
      // Calculate total width needed for all children
      const childrenWidths = node.children.map(child => calculateSubtreeWidth(child));
      const totalChildrenWidth = childrenWidths.reduce((sum, width) => sum + width, 0);
      const spacingWidth = (node.children.length - 1) * HORIZONTAL_SPACING;
      
      return Math.max(NODE_WIDTH, totalChildrenWidth + spacingWidth);
    };
    
    // Calculate total width needed for all root nodes
    const rootWidths = rootNodes.map(node => calculateSubtreeWidth(node));
    const totalRootWidth = rootWidths.reduce((sum, width) => sum + width, 0);
    const totalRootSpacing = (rootNodes.length - 1) * HORIZONTAL_SPACING;
    const totalRequiredWidth = totalRootWidth + totalRootSpacing;
    
    // Second pass: position all nodes
    const positionNode = (node: TreeNode, centerX: number, y: number, level: number): PositionedNode => {
      // Position this node at the center
      const nodeX = centerX - NODE_WIDTH / 2;
      
      const positionedNode: PositionedNode = {
        ...node,
        x: nodeX,
        y: y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        level
      };
      
      positionedNodes.push(positionedNode);
      
      // Position children if they exist
      if (node.children && node.children.length > 0) {
        const childY = y + NODE_HEIGHT + VERTICAL_SPACING;
        
        // Calculate the total width needed for all children
        const childrenWidths = node.children.map(child => calculateSubtreeWidth(child));
        const totalChildrenWidth = childrenWidths.reduce((sum, width) => sum + width, 0);
        const totalSpacingWidth = (node.children.length - 1) * HORIZONTAL_SPACING;
        const totalRequiredWidth = totalChildrenWidth + totalSpacingWidth;
        
        // Start positioning children from the left edge of the required width, centered under parent
        let currentX = centerX - totalRequiredWidth / 2;
        
        node.children.forEach((child, index) => {
          const childWidth = childrenWidths[index];
          const childCenterX = currentX + childWidth / 2;
          
          // Recursively position this child and its descendants
          const childNode = positionNode(child, childCenterX, childY, level + 1);
          
          // Create connection from parent to child
          connections.push({
            from: positionedNode,
            to: childNode
          });
          
          // Move to next child position
          currentX += childWidth + HORIZONTAL_SPACING;
        });
      }
      
      return positionedNode;
    };
    
    // Position all root nodes horizontally
    let currentX = -totalRequiredWidth / 2;
    rootNodes.forEach((rootNode, index) => {
      const rootWidth = rootWidths[index];
      const rootCenterX = currentX + rootWidth / 2;
      
      // Position this root node and its descendants
      positionNode(rootNode, rootCenterX, 50, 0);
      
      // Move to next root position
      currentX += rootWidth + HORIZONTAL_SPACING;
    });
    
    return { nodes: positionedNodes, connections };
  }, [currentConfig]);

  // Function to check if mouse is over an edit button
  const getEditButtonHover = useCallback((canvasX: number, canvasY: number): string | null => {
    // Don't check for edit button hover on mobile
    if (isMobile) return null;
    
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;
    
    const { nodes } = calculateNodePositions();
    
    // Check each node's edit button area
    for (const node of nodes) {
      if (hoveredNodeId === node.id) { // Only check if node is hovered
        // Calculate edit button position (same logic as in drawNode)
        const titleFontSize = Math.max(14 / transform.scale, 10);
        const textAreaX = node.x + (node.width / 3);
        const titleX = textAreaX + 10;
        
        // Temporarily create canvas context to measure title
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
          const titleWidth = tempCtx.measureText(node.title).width;
          
          const editIconSize = Math.max(14 / transform.scale, 12);
          const editIconX = titleX + titleWidth + 8;
          const editIconY = node.y + 8 + titleFontSize / 2 - editIconSize / 2;
          
          // Check if mouse is within edit button bounds (with some padding for easier hover)
          if (worldX >= editIconX - 2 && 
              worldX <= editIconX + editIconSize + 2 && 
              worldY >= editIconY - 2 && 
              worldY <= editIconY + editIconSize + 2) {
            return node.id;
          }
        }
      }
    }
    
    return null;
  }, [transform, calculateNodePositions, hoveredNodeId, isMobile]);

  // Function to check if a point is inside a node
  const getNodeAtPosition = useCallback((canvasX: number, canvasY: number): PositionedNode | null => {
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;
    
    const { nodes } = calculateNodePositions();
    
    // Find the node that contains this point
    for (const node of nodes) {
      if (
        worldX >= node.x &&
        worldX <= node.x + node.width &&
        worldY >= node.y &&
        worldY <= node.y + node.height
      ) {
        return node;
      }
    }
    
    return null;
  }, [transform, calculateNodePositions]);

  // Function to open node URL with debouncing to prevent double-opens
  const openNodeUrl = useCallback((node: PositionedNode) => {
    if (node.url) {
      // Use the URL as-is if it already has a protocol, otherwise add https://
      const url = node.url.includes('://') ? node.url : `https://${node.url}`;
      
      // Simple debouncing: check if we already opened this URL recently
      const now = Date.now();
      const lastOpenKey = `lastOpen_${node.id}`;
      const lastOpenTime = (window as any)[lastOpenKey] || 0;
      
      if (now - lastOpenTime > 1000) { // 1 second debounce
        (window as any)[lastOpenKey] = now;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
    // If no URL, do nothing (node is not clickable)
  }, []);

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
  const drawNode = (ctx: CanvasRenderingContext2D, node: PositionedNode, scale: number, _config: AppConfig, isHovered: boolean = false, isEditButtonHovered: boolean = false, isMobile: boolean = false) => {
    const { x, y, width, type, title, subtitle, ip, url } = node;
    
    // Adjust height for mobile - make it slightly shorter
    const height = isMobile ? node.height - 10 : node.height;
    
    // Pre-calculate layout values
    const circleAreaWidth = width / 3;
    const textAreaWidth = (width * 2) / 3;
    const textAreaX = x + circleAreaWidth;
    const titleFontSize = Math.max(14 / scale, 10);
    const subtitleFontSize = Math.max(11 / scale, 8);
    const detailFontSize = Math.max(10 / scale, 7);
    const titleX = textAreaX + 10;
    const titleY = y + 8;
    
    // Calculate edit button coordinates (positioned after title text)
    ctx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
    const titleWidth = ctx.measureText(title).width;
    
    const editIconSize = Math.max(14 / scale, 12); // Smaller grey edit button
    const editIconX = titleX + titleWidth + 8; // 8px gap after title
    const editIconY = titleY + titleFontSize / 2 - editIconSize / 2; // Vertically centered with title
    
    // Determine border radius based on node type
    const borderRadius = type === 'circular' ? height / 2 : (type === 'angular' ? 0 : 12); // Perfect pill for circular, no radius for angular, normal radius for square
    
    // Get the current status for this node (use IP if available, otherwise URL)
    const originalIdentifier = ip || url;
    
    // Get status using the original identifier to match the API response format
    const nodeStatus = originalIdentifier 
      ? getNodeStatus(originalIdentifier) 
      : { status: 'offline' as const, lastChecked: new Date().toISOString(), progress: 0 };
    
    // Check if node has web GUI disabled
    const hasWebGuiDisabled = node.hasWebGui === false;

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
    
    // Calculate layout: 1/3 for circle, 2/3 for text
    // Use the pre-calculated values from the top of the function
    
    // Draw status circle with equal padding on left, top, and bottom
    const padding = 10; // Reduced padding for better fit with smaller height
    const maxCircleSize = Math.min(circleAreaWidth - padding, height - (padding * 2));
    const circleRadius = maxCircleSize * 0.5; // Increased from 0.45 back to 0.5 for slightly larger circle
    const circleCenterX = x + padding + (circleAreaWidth - padding) / 2;
    const circleCenterY = y + height / 2; // Centered vertically
    
    // Set circle color based on node status - gray if no IP/URL provided or hasWebGui is disabled
    let circleColor = '#6b7280'; // Default gray for checking or no identifier
    let circleOpacity = 1.0; // Default full opacity
    
    if (hasWebGuiDisabled || !originalIdentifier) {
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
    
    // Draw icon in the center of the circle
    if (node.icon) {
      const iconSize = circleRadius * 1.2; // Icon size relative to circle
      drawIconOnCanvas(ctx, node.icon, circleCenterX, circleCenterY, iconSize, '#ffffff', handleIconLoaded);
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
    
    // Draw edit button (wrench icon) only on hover and not on mobile
    if (isHovered && !isMobile) {
      const iconSize = editIconSize;
      const iconCenterX = editIconX + iconSize/2;
      const iconCenterY = editIconY + iconSize/2;
      
      // Draw edit button (wrench icon) only on hover
      if (isEditButtonHovered) {
        ctx.fillStyle = '#f3f4f6';
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1 / scale;
        drawRoundedRect(ctx, editIconX - 2, editIconY - 2, iconSize + 4, iconSize + 4, 4);
        ctx.fill();
        ctx.stroke();
      }
      
      // Draw wrench icon in grey color using regular icon system for better performance
      drawIconOnCanvas(ctx, 'wrench', iconCenterX, iconCenterY, iconSize, '#6b7280', handleIconLoaded);
    }
    
    // Draw subtitle
    ctx.fillStyle = '#6b7280';
    ctx.font = `400 ${subtitleFontSize}px Roboto, sans-serif`;
    
    const subtitleX = textAreaX + 10;
    const subtitleY = titleY + titleFontSize + 4;
    ctx.fillText(subtitle, subtitleX, subtitleY);
    
    let currentY = subtitleY + subtitleFontSize + 8;
    const iconSize = Math.max(16 / scale, 12); // Larger minimum size, scales better with zoom
    
    // Draw IP with network icon (only if IP is provided, otherwise show "No IP" if URL exists)
    if (ip || url) {
      // Calculate vertical center alignment
      const textHeight = detailFontSize;
      const iconCenterY = currentY + textHeight / 2;
      
      // Draw network icon using regular icon system for better performance and reliability
      drawIconOnCanvas(ctx, 'network', textAreaX + 10 + iconSize/2, iconCenterY, iconSize * 0.8, '#6b7280', handleIconLoaded);
      
      // Draw IP text or "No IP" if only URL is available
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 ${detailFontSize}px Roboto, sans-serif`;
      const displayText = ip || 'No IP';
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
  };

  const drawConnection = (ctx: CanvasRenderingContext2D, connection: Connection, scale: number) => {
    const { from, to } = connection;
    
    // Calculate connection points (bottom center of parent to top center of child)
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height;
    const endX = to.x + to.width / 2;
    const endY = to.y;
    
    // Draw connection line with a slight curve - thicker line, no arrowhead
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = Math.max(5 / scale, 3); // Increased thickness with minimum of 3px
    ctx.setLineDash([]);
    
    const midY = startY + (endY - startY) / 2;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX, midY);
    ctx.lineTo(endX, midY);
    ctx.lineTo(endX, endY);
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
    if (backgroundLoaded && backgroundImageRef.current && !currentConfig.appearance?.disableBackground) {
      const img = backgroundImageRef.current;
      const canvasAspect = canvas.width / canvas.height;
      const imgAspect = img.width / img.height;
      
      let drawWidth, drawHeight, drawX, drawY;
      
      // Object-fit: cover behavior - scale image to completely fill canvas
      if (canvasAspect > imgAspect) {
        // Canvas is wider than image - scale to fill width, crop top/bottom
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        // Canvas is taller than image - scale to fill height, crop left/right
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
      drawNode(ctx, node, transform.scale, currentConfig, isNodeHovered, isEditButtonHovered, isMobile);
    });
    
    // Restore context state
    ctx.restore();
  }, [backgroundLoaded, calculateNodePositions, getNodeStatus, iconLoadCounter, currentConfig, transform]);

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
    setIsHoveringNode(!!hoveredNode && !!hoveredNode.url); // Only show pointer cursor if node has URL
    setHoveredNodeId(hoveredNode ? hoveredNode.id : null); // Track which node is hovered for edit button
    
    // Check if hovering over an edit button specifically
    const editButtonHovered = getEditButtonHover(canvasX, canvasY);
    setHoveredEditButtonNodeId(editButtonHovered);
    
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
      // Check for edit button click first - only if we're hovering a node
      if (hoveredNodeId) {
        const hoveredNode = getNodeAtPosition(canvasX, canvasY);
        if (hoveredNode && hoveredNode.id === hoveredNodeId) {
          // Calculate edit button bounds for the hovered node
          const worldX = (canvasX - transform.x) / transform.scale;
          const worldY = (canvasY - transform.y) / transform.scale;
          
          // Recalculate edit button position (same logic as in drawNode)
          const titleFontSize = Math.max(14 / transform.scale, 10);
          const textAreaX = hoveredNode.x + (hoveredNode.width / 3);
          const titleX = textAreaX + 10;
          
          // Temporarily create canvas context to measure title
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
            const titleWidth = tempCtx.measureText(hoveredNode.title).width;
            
            const editIconSize = Math.max(14 / transform.scale, 12); // Match the drawing function
            const editIconX = titleX + titleWidth + 8;
            const editIconY = hoveredNode.y + 8 + titleFontSize / 2 - editIconSize / 2; // Match the drawing function
            
            // Check if click is within edit button bounds (without background padding)
            if (worldX >= editIconX && 
                worldX <= editIconX + editIconSize && 
                worldY >= editIconY && 
                worldY <= editIconY + editIconSize) {
              // Edit button clicked!
              handleEditNode(hoveredNode.id);
              return;
            }
          }
        }
      }
      
      // Check for regular node click
      const clickedNode = getNodeAtPosition(canvasX, canvasY);
      if (clickedNode) {
        openNodeUrl(clickedNode);
      }
    }
    
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setIsHoveringNode(false);
    setHoveredNodeId(null);
    setHoveredEditButtonNodeId(null);
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
    if (node.url) {
      const url = node.url.includes('://') ? node.url : `https://${node.url}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

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
          {/* Background image for mobile view - covers entire screen - only show if not disabled */}
          {!currentConfig.appearance?.disableBackground && (
            <div 
              className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none" 
              style={{ 
                backgroundImage: `url(${currentConfig.appearance?.backgroundImage || '/background.png'})`,
                opacity: 0.3,
                backgroundSize: 'cover'
              }} 
            />
          )}
          {/* Fallback background in case the first one fails - only show if not disabled */}
          {!currentConfig.appearance?.disableBackground && !backgroundLoaded && (
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
            <MobileNodeList 
              nodes={currentConfig.tree.nodes} 
              statuses={statuses}
              onNodeClick={handleMobileNodeClick}
              appConfig={currentConfig}
              statusCard={
                <StatusCard
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  appConfig={currentConfig}
                  statuses={statuses}
                  isLoading={isLoading}
                  error={error}
                  isConnected={isConnected}
                  nextCheckCountdown={nextCheckCountdown}
                  totalInterval={totalInterval}
                  isQuerying={isQuerying}
                />
              }
            />
          </div>
        </div>
      )}
      
      {/* Status Card - only show on desktop, mobile has it embedded */}
      {!isMobile && (
        <div className="absolute top-4 right-4 z-20">
          <StatusCard 
            onOpenSettings={() => setIsSettingsOpen(true)} 
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
              alt={currentConfig.appearance.title || 'Logo'} 
              className="w-24 h-24 opacity-90 filter drop-shadow-lg bg-white/20 backdrop-blur-sm rounded-xl p-3"
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
              className="w-24 h-24 opacity-90 filter drop-shadow-lg bg-white/20 backdrop-blur-sm rounded-xl p-3"
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

      {/* Mobile Node List - Shown only on mobile devices */}
      {/* {isMobile && currentConfig.tree.nodes.length > 0 && (
        <div className="absolute inset-0 z-10 p-4 pointer-events-none">
          <MobileNodeList nodes={currentConfig.tree.nodes} />
        </div>
      )} */}
    </div>
  );
};

export default Canvas;