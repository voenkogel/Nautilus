import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import * as LucideIcons from 'lucide-react';

// Cache for SVG strings and image objects
export const iconSvgCache = new Map<string, string>();
export const iconImageCache = new Map<string, HTMLImageElement>();

// Helper to convert icon name to PascalCase for Lucide lookup
export const iconNameToPascalCase = (name: string): string => {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
};

// Extract all unique icons from the tree config
export const extractIconsFromConfig = (nodes: any[]): Set<string> => {
  const icons = new Set<string>();
  
  const processNode = (node: any) => {
    if (node.icon) icons.add(node.icon);
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  };
  
  nodes.forEach(processNode);
  return icons;
};

// Generate SVG string using Lucide React components
export const generateIconSvg = (iconName: string, color: string): string => {
  try {
    // Convert icon name to PascalCase for Lucide component lookup
    const pascalCaseIcon = iconNameToPascalCase(iconName);
    const IconComponent = (LucideIcons as any)[pascalCaseIcon];
    
    if (IconComponent) {
      // Use Lucide React to generate SVG
      const iconElement = createElement(IconComponent, {
        size: 24,
        color: color,
        strokeWidth: 2
      });
      
      const svgString = renderToString(iconElement);
      return svgString;
    } else {
      // Fallback to server icon if not found
      const ServerIcon = LucideIcons.Server;
      const fallbackElement = createElement(ServerIcon, {
        size: 24,
        color: color,
        strokeWidth: 2
      });
      return renderToString(fallbackElement);
    }
  } catch (error) {
    console.warn(`Failed to generate SVG for icon "${iconName}":`, error);
    // Ultimate fallback - basic server SVG
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6" y1="6" y2="6"/><line x1="6" x2="6" y1="18" y2="18"/></svg>`;
  }
};

// Get or generate icon SVG with caching
export const getIconSvg = (iconName: string, color: string): string => {
  const cacheKey = `${iconName}-${color}`;
  
  if (iconSvgCache.has(cacheKey)) {
    return iconSvgCache.get(cacheKey)!;
  }
  
  const svgString = generateIconSvg(iconName, color);
  iconSvgCache.set(cacheKey, svgString);
  return svgString;
};

// Create a data URL for an icon
export const getIconDataUrl = (iconName: string, color: string): string => {
  const svgContent = getIconSvg(iconName, color);
  const encodedSvg = encodeURIComponent(svgContent);
  return `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
};

// Fast and reliable icon rendering using preloaded Lucide icons
export const drawIconOnCanvas = (
  ctx: CanvasRenderingContext2D,
  iconName: string,
  centerX: number,
  centerY: number,
  size: number,
  color: string = '#ffffff',
  onIconLoaded?: () => void
) => {
  const cacheKey = `${iconName}-${color}`;
  const cachedImage = iconImageCache.get(cacheKey);
  
  if (cachedImage && cachedImage.complete) {
    // Icon is cached and fully loaded, draw it immediately
    ctx.save();
    const scale = size / 24;
    ctx.translate(centerX - (size / 2), centerY - (size / 2));
    ctx.scale(scale, scale);
    ctx.drawImage(cachedImage, 0, 0, 24, 24);
    ctx.restore();
    return true;
  } else {
    // Icon not in cache, try to load it
    const svgContent = getIconSvg(iconName, color);
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
      iconImageCache.set(cacheKey, img);
      URL.revokeObjectURL(url);
      if (onIconLoaded) {
        onIconLoaded();
      }
    };
    img.onerror = () => {
      // Try fallback to server icon
      console.warn(`Failed to load icon "${iconName}", falling back to server icon`);
      const fallbackSvg = getIconSvg('server', color);
      const fallbackBlob = new Blob([fallbackSvg], { type: 'image/svg+xml' });
      const fallbackUrl = URL.createObjectURL(fallbackBlob);
      
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        iconImageCache.set(cacheKey, fallbackImg); // Cache the fallback
        URL.revokeObjectURL(fallbackUrl);
        if (onIconLoaded) {
          onIconLoaded();
        }
      };
      fallbackImg.onerror = () => {
        URL.revokeObjectURL(fallbackUrl);
      };
      fallbackImg.src = fallbackUrl;
      
      URL.revokeObjectURL(url);
    };
    img.src = url;
    
    // Draw a small loading indicator while icon loads
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    return false; // Icon is loading
  }
};
