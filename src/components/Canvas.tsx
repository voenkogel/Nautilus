import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import configData from '../../config.json';
import type { TreeNode, AppConfig } from '../types/config';
import { useNodeStatus } from '../hooks/useNodeStatus';
import StatusCard from './StatusCard';
import * as LucideIcons from 'lucide-react';

const appConfig = configData as AppConfig;

// Function to get a Lucide icon component by name
const getLucideIcon = (iconName: string) => {
  // Convert kebab-case to PascalCase for component names
  const componentName = iconName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Try to get the icon component
  const iconComponent = (LucideIcons as any)[componentName];
  
  if (iconComponent) {
    console.log(`Found Lucide icon component: ${componentName} for ${iconName}`);
    return iconComponent;
  } else {
    console.warn(`Lucide icon component not found: ${componentName} for ${iconName}, using Server as fallback`);
    return LucideIcons.Server;
  }
};

// Cache for rendered icon SVGs to avoid re-rendering
const iconSvgCache = new Map<string, string>();

// Function to extract SVG content from a Lucide React icon
const extractIconSvg = async (iconName: string, color: string = '#ffffff'): Promise<string> => {
  const cacheKey = `${iconName}-${color}`;
  
  if (iconSvgCache.has(cacheKey)) {
    return iconSvgCache.get(cacheKey)!;
  }

  return new Promise((resolve) => {
    try {
      // Create a temporary container
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.width = '24px';
      tempContainer.style.height = '24px';
      tempContainer.style.visibility = 'hidden';
      document.body.appendChild(tempContainer);

      // Get the icon component
      const IconComponent = getLucideIcon(iconName);
      
      // Render the icon using React with a longer timeout for complex icons
      const root = createRoot(tempContainer);
      root.render(
        React.createElement(IconComponent, {
          size: 24,
          color: color,
          strokeWidth: 2,
          fill: 'none',
          stroke: color
        })
      );

      // Wait longer for render and extract SVG
      setTimeout(() => {
        try {
          const svgElement = tempContainer.querySelector('svg');
          if (svgElement) {
            // Clone the SVG to avoid issues with the original
            const clonedSvg = svgElement.cloneNode(true) as SVGElement;
            
            // Ensure all necessary attributes are set
            clonedSvg.setAttribute('width', '24');
            clonedSvg.setAttribute('height', '24');
            clonedSvg.setAttribute('viewBox', '0 0 24 24');
            clonedSvg.setAttribute('fill', 'none');
            clonedSvg.setAttribute('stroke', color);
            clonedSvg.setAttribute('stroke-width', '2');
            clonedSvg.setAttribute('stroke-linecap', 'round');
            clonedSvg.setAttribute('stroke-linejoin', 'round');
            
            const svgContent = new XMLSerializer().serializeToString(clonedSvg);
            iconSvgCache.set(cacheKey, svgContent);
            console.log(`Successfully extracted icon: ${iconName}`, svgContent);
            resolve(svgContent);
          } else {
            console.warn(`No SVG found for icon: ${iconName}, using fallback`);
            const fallbackSvg = getFallbackSvg(iconName, color);
            iconSvgCache.set(cacheKey, fallbackSvg);
            resolve(fallbackSvg);
          }
        } catch (extractError) {
          console.error(`Error extracting SVG for ${iconName}:`, extractError);
          const fallbackSvg = getFallbackSvg(iconName, color);
          iconSvgCache.set(cacheKey, fallbackSvg);
          resolve(fallbackSvg);
        }
        
        // Clean up
        try {
          root.unmount();
          if (document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
          }
        } catch (cleanupError) {
          console.warn('Error during cleanup:', cleanupError);
        }
      }, 50); // Increased timeout to 50ms
    } catch (error) {
      console.error(`Error in extractIconSvg for ${iconName}:`, error);
      const fallbackSvg = getFallbackSvg(iconName, color);
      iconSvgCache.set(cacheKey, fallbackSvg);
      resolve(fallbackSvg);
    }
  });
};

// Fallback SVGs for when extraction fails
const getFallbackSvg = (iconName: string, color: string): string => {
  const fallbackSvgs: Record<string, string> = {
    server: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6" y1="6" y2="6"/><line x1="6" x2="6" y1="18" y2="18"/></svg>`,
    clapperboard: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20.2 6-3-3H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14l3-3"/><path d="m7 4 3 3-3 3"/><path d="M4 8h8"/><path d="M4 12h8"/></svg>`,
    tv: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17,2 12,7 7,2"/></svg>`
  };
  
  return fallbackSvgs[iconName] || fallbackSvgs.server;
};

// Function to draw Lucide icons on canvas using actual SVG paths
// Cache for rendered icon images to avoid re-rendering
const iconImageCache = new Map<string, HTMLImageElement>();

// Function to preload all icons used in the configuration
const preloadIcons = async () => {
  const iconPromises = appConfig.tree.nodes.map(async (node) => {
    if (node.icon) {
      const cacheKey = `${node.icon}-#ffffff`;
      if (!iconImageCache.has(cacheKey)) {
        try {
          const svgContent = await extractIconSvg(node.icon, '#ffffff');
          const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              iconImageCache.set(cacheKey, img);
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error(`Failed to load icon: ${node.icon}`));
            };
            img.src = url;
          });
        } catch (error) {
          console.warn(`Failed to preload icon ${node.icon}:`, error);
        }
      }
    }
  });
  
  await Promise.all(iconPromises);
};

// Function to draw Lucide icons on canvas using preloaded images
const drawIconOnCanvas = (
  ctx: CanvasRenderingContext2D,
  iconName: string,
  centerX: number,
  centerY: number,
  size: number,
  color: string = '#ffffff'
) => {
  const cacheKey = `${iconName}-${color}`;
  const cachedImage = iconImageCache.get(cacheKey);
  
  if (cachedImage) {
    ctx.save();
    
    // Scale and position the icon
    const scale = size / 24;
    ctx.translate(centerX - (size / 2), centerY - (size / 2));
    ctx.scale(scale, scale);
    
    ctx.drawImage(cachedImage, 0, 0, 24, 24);
    ctx.restore();
  } else {
    // Fallback: draw a simple circle if icon not loaded
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    // Try to load the icon asynchronously for next time
    extractIconSvg(iconName, color).then(svgContent => {
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.onload = () => {
        iconImageCache.set(cacheKey, img);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }).catch(error => {
      console.warn(`Failed to load icon ${iconName}:`, error);
    });
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
  
  // Use the status monitoring hook
  const { getNodeStatus } = useNodeStatus();
  
  // Node dimensions and spacing
  const NODE_WIDTH = 200; // Decreased from 240
  const NODE_HEIGHT = 80; // Decreased from 100
  const HORIZONTAL_SPACING = 60;
  const VERTICAL_SPACING = 80;

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      backgroundImageRef.current = img;
      setBackgroundLoaded(true);
    };
    img.src = '/src/assets/ChatGPT Image Jun 29, 2025, 10_39_29 AM.png';
  }, []);

  // Preload all icons
  useEffect(() => {
    // Clear caches to ensure fresh icon extraction
    iconSvgCache.clear();
    iconImageCache.clear();
    
    preloadIcons().then(() => {
      console.log('Icons preloaded successfully');
    }).catch(error => {
      console.warn('Failed to preload some icons:', error);
    });
  }, []);

  // Calculate positions for tree nodes in a proper vertical tree layout
  const calculateNodePositions = useCallback((): { nodes: PositionedNode[], connections: Connection[] } => {
    const positionedNodes: PositionedNode[] = [];
    const connections: Connection[] = [];
    
    if (appConfig.tree.nodes.length === 0) return { nodes: positionedNodes, connections };
    
    // Start with the single root node
    const rootNode = appConfig.tree.nodes[0];
    
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
    
    // Calculate the total width of the root subtree for positioning
    calculateSubtreeWidth(rootNode);
    
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
    
    // Start positioning from the root
    positionNode(rootNode, 0, 50, 0);
    
    return { nodes: positionedNodes, connections };
  }, []);

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

  const drawIcon = (ctx: CanvasRenderingContext2D, iconType: 'link' | 'globe', x: number, y: number, size: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (iconType === 'link') {
      // Draw chain link icon
      const linkSize = size * 0.8;
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      
      // First link
      ctx.beginPath();
      ctx.arc(centerX - linkSize * 0.2, centerY - linkSize * 0.2, linkSize * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      
      // Second link
      ctx.beginPath();
      ctx.arc(centerX + linkSize * 0.2, centerY + linkSize * 0.2, linkSize * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      
      // Connecting line
      ctx.beginPath();
      ctx.moveTo(centerX - linkSize * 0.1, centerY - linkSize * 0.1);
      ctx.lineTo(centerX + linkSize * 0.1, centerY + linkSize * 0.1);
      ctx.stroke();
    } else if (iconType === 'globe') {
      // Draw globe icon
      const globeSize = size * 0.8;
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      const radius = globeSize * 0.3;
      
      // Outer circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();
      
      // Horizontal lines
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.stroke();
      
      // Curved lines for globe effect
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const drawNode = (ctx: CanvasRenderingContext2D, node: PositionedNode, scale: number) => {
    const { x, y, width, height, title, subtitle, ip, url } = node;
    const borderRadius = 12;
    
    // Get the current status for this node
    const nodeStatus = getNodeStatus(ip);
    
    // Draw node shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    drawRoundedRect(ctx, x + 2, y + 2, width, height, borderRadius);
    ctx.fill();
    
    // Draw node background (white)
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, x, y, width, height, borderRadius);
    ctx.fill();
    
    // Draw node border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1 / scale;
    drawRoundedRect(ctx, x, y, width, height, borderRadius);
    ctx.stroke();
    
    // Calculate layout: 1/3 for circle, 2/3 for text
    const circleAreaWidth = width / 3;
    const textAreaWidth = (width * 2) / 3;
    const textAreaX = x + circleAreaWidth;
    
    // Draw status circle with equal padding on left, top, and bottom
    const padding = 12; // Equal padding for left, top, bottom
    const maxCircleSize = Math.min(circleAreaWidth - padding, height - (padding * 2));
    const circleRadius = maxCircleSize * 0.4; // Increased from 0.25 to 0.4 for larger circle
    const circleCenterX = x + padding + (circleAreaWidth - padding) / 2;
    const circleCenterY = y + height / 2; // Centered vertically
    
    // Set circle color based on node status
    let circleColor = '#6b7280'; // Default gray for checking
    if (nodeStatus.status === 'online') {
      circleColor = '#10b981'; // Green for online
    } else if (nodeStatus.status === 'offline') {
      circleColor = '#ef4444'; // Red for offline
    }
    
    ctx.fillStyle = circleColor;
    ctx.beginPath();
    ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw icon in the center of the circle
    if (node.icon) {
      const iconSize = circleRadius * 1.2; // Icon size relative to circle
      drawIconOnCanvas(ctx, node.icon, circleCenterX, circleCenterY, iconSize, '#ffffff');
    }
    
    // Add a subtle pulse effect for checking status
    if (nodeStatus.status === 'checking') {
      ctx.strokeStyle = circleColor;
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(circleCenterX, circleCenterY, circleRadius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Set font for text (Roboto)
    const titleFontSize = Math.max(14 / scale, 10);
    const subtitleFontSize = Math.max(11 / scale, 8);
    const detailFontSize = Math.max(10 / scale, 7);
    
    // Draw title in the right 2/3 area
    ctx.fillStyle = '#1f2937';
    ctx.font = `500 ${titleFontSize}px Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const titleX = textAreaX + 10;
    const titleY = y + 8;
    ctx.fillText(title, titleX, titleY);
    
    // Draw subtitle
    ctx.fillStyle = '#6b7280';
    ctx.font = `400 ${subtitleFontSize}px Roboto, sans-serif`;
    
    const subtitleX = textAreaX + 10;
    const subtitleY = titleY + titleFontSize + 4;
    ctx.fillText(subtitle, subtitleX, subtitleY);
    
    // Draw IP with link icon
    const ipY = subtitleY + subtitleFontSize + 8;
    const iconSize = 12 / scale;
    
    // Draw link icon
    drawIcon(ctx, 'link', textAreaX + 10, ipY - 1, iconSize, '#6b7280');
    
    // Draw IP text
    ctx.fillStyle = '#6b7280';
    ctx.font = `400 ${detailFontSize}px Roboto, sans-serif`;
    ctx.fillText(ip, textAreaX + 10 + iconSize + 4, ipY);
    
    // Draw URL with globe icon
    const urlY = ipY + detailFontSize + 6;
    
    // Draw globe icon
    drawIcon(ctx, 'globe', textAreaX + 10, urlY - 1, iconSize, '#6b7280');
    
    // Draw URL text (truncate if too long)
    ctx.fillStyle = '#6b7280';
    ctx.font = `400 ${detailFontSize}px Roboto, sans-serif`;
    
    const maxUrlWidth = textAreaWidth - 20 - iconSize;
    let displayUrl = url;
    
    // Simple URL truncation
    if (ctx.measureText(displayUrl).width > maxUrlWidth) {
      while (ctx.measureText(displayUrl + '...').width > maxUrlWidth && displayUrl.length > 10) {
        displayUrl = displayUrl.slice(0, -1);
      }
      displayUrl += '...';
    }
    
    ctx.fillText(displayUrl, textAreaX + 10 + iconSize + 4, urlY);
  };

  const drawConnection = (ctx: CanvasRenderingContext2D, connection: Connection, scale: number) => {
    const { from, to } = connection;
    
    // Calculate connection points (bottom center of parent to top center of child)
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height;
    const endX = to.x + to.width / 2;
    const endY = to.y;
    
    // Draw connection line with a slight curve - thick line, no arrowhead
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 3 / scale;
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
    
    // Draw static background image (not affected by transform)
    if (backgroundLoaded && backgroundImageRef.current) {
      const img = backgroundImageRef.current;
      const canvasAspect = canvas.width / canvas.height;
      const imgAspect = img.width / img.height;
      
      let drawWidth, drawHeight, drawX, drawY;
      
      if (canvasAspect > imgAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawWidth = canvas.height * imgAspect;
        drawHeight = canvas.height;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
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
      drawNode(ctx, node, transform.scale);
    });
    
    // Restore context state
    ctx.restore();
  }, [transform, backgroundLoaded, calculateNodePositions, getNodeStatus]);

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
    setIsHoveringNode(!!hoveredNode);
    
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
  };

  const handleWheel = (e: React.WheelEvent) => {
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
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Auto-fit content on initial load only
  useEffect(() => {
    if (backgroundLoaded && !isInitialized) {
      const timer = setTimeout(() => {
        fitToContent();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [backgroundLoaded, isInitialized, fitToContent]);

  return (
    <div className="w-full h-full relative font-roboto" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isHoveringNode ? 'cursor-pointer' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
      
      {/* Controls - only show when user has moved away from initial position */}
      {hasMovedFromInitial() && (
        <div className="absolute top-4 left-4">
          <button
            onClick={fitToContent}
            className="bg-white/90 hover:bg-white text-gray-800 px-3 py-2 rounded-lg shadow-lg transition-colors text-sm font-medium font-roboto"
          >
            Fit to Content
          </button>
        </div>
      )}
      
      {/* Status Card */}
      <div className="absolute top-4 right-4">
        <StatusCard />
      </div>
      
      {/* Info */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg text-sm font-roboto">
        Zoom: {Math.round(transform.scale * 100)}% | Pan: ({Math.round(transform.x)}, {Math.round(transform.y)})
      </div>
    </div>
  );
};

export default Canvas;