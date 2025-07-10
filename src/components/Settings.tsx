import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Plus, Trash2, Save, ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { AppConfig, TreeNode } from '../types/config';
import { clearAuthentication, isAuthenticated } from '../utils/auth';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: AppConfig;
  onSave: (config: AppConfig) => void;
  focusNodeId?: string; // Optional node ID to focus on and expand
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialConfig, onSave, focusNodeId }) => {
  const [config, setConfig] = useState<AppConfig>(() => JSON.parse(JSON.stringify(initialConfig)));
  const [activeTab, setActiveTab] = useState<'general' | 'nodes' | 'appearance' | 'notifications'>('general');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [iconDropdownOpen, setIconDropdownOpen] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<{ favicon?: string; backgroundImage?: string; logo?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = await isAuthenticated();
      setIsLoggedIn(authenticated);
    };
    
    checkAuth();
  }, [isOpen]); // Check when modal opens

  // Handle logout
  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await clearAuthentication();
      setIsLoggedIn(false);
      onClose(); // Close settings modal after logout
    }
  };

  // Simple list of common/popular icons for suggestions (optional)
  const commonIcons = [
    'server', 'monitor', 'tv', 'clapperboard', 'smartphone', 'tablet', 'laptop',
    'hard-drive', 'database', 'wifi', 'globe', 'cloud', 'shield', 'lock', 'key',
    'users', 'user', 'settings', 'wrench', 'tool', 'cpu', 'activity', 'zap',
    'play', 'pause', 'stop', 'power', 'camera', 'video', 'mic', 'headphones',
    'printer', 'phone', 'mail', 'bell', 'clock', 'calendar', 'file', 'folder',
    'download', 'upload', 'github', 'chrome', 'firefox', 'home', 'building'
  ];

  // Get accent color from configuration
  const accentColor = config.appearance?.accentColor || '#3b82f6';

  // Helper function to convert kebab-case to PascalCase for icon component names
  const kebabToPascal = (kebabCase: string): string => {
    return kebabCase
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  // Function to check if an icon exists and render it
  const renderIconPreview = (iconName: string, size: number = 16, useDefault: boolean = true) => {
    if (!iconName) {
      if (useDefault) {
        return <LucideIcons.Server size={size} />;
      } else {
        return <div className="text-gray-400 text-xs">No icon</div>;
      }
    }
    
    const pascalCaseName = kebabToPascal(iconName);
    const IconComponent = (LucideIcons as any)[pascalCaseName];
    
    if (IconComponent) {
      return <IconComponent size={size} />;
    } else {
      // Show a fallback icon if the specified icon doesn't exist
      return <LucideIcons.HelpCircle size={size} className="text-gray-400" />;
    }
  };

  // Initialize collapsed state for all nodes when opening settings
  useEffect(() => {
    if (isOpen) {
      const nodeIds = new Set<string>();
      const collectNodeIds = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          nodeIds.add(node.id);
          if (node.children) {
            collectNodeIds(node.children);
          }
        });
      };
      collectNodeIds(initialConfig.tree.nodes);
      
      // If focusNodeId is provided, expand that node and switch to nodes tab
      if (focusNodeId) {
        nodeIds.delete(focusNodeId);
        setActiveTab('nodes');
      }
      
      setCollapsedNodes(nodeIds);
    }
  }, [isOpen, initialConfig, focusNodeId]);

  // Clear file errors when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setFileErrors({});
    }
  }, [isOpen]);

  // Close icon dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (iconDropdownOpen && !(event.target as Element).closest('.icon-dropdown')) {
        setIconDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [iconDropdownOpen]);

  // Update local config when initialConfig changes, ensuring a deep copy
  useEffect(() => {
    setConfig(JSON.parse(JSON.stringify(initialConfig)));
  }, [initialConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await onSave(config);
      onClose();
    } catch (error) {
      console.error('Error saving configuration:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Handle specific error types
      if (errorMessage.includes('PayloadTooLargeError') || errorMessage.includes('413')) {
        errorMessage = 'One or more images are too large. Please use smaller images (under 5MB each).';
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (errorMessage.includes('Server responded with')) {
        // Extract server error messages more cleanly
        const match = errorMessage.match(/Server responded with \d+: (.+)/);
        if (match) {
          errorMessage = `Server error: ${match[1]}`;
        }
      }
      
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const updateServerConfig = (field: keyof AppConfig['server'], value: number) => {
    setConfig(prev => ({
      ...prev,
      server: {
        ...prev.server,
        [field]: value
      }
    }));
  };

  const updateAppearanceConfig = (field: keyof AppConfig['appearance'], value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [field]: value
      }
    }));
  };

  const handleFileUpload = (file: File, field: 'favicon' | 'backgroundImage' | 'logo') => {
    setFileErrors(prev => ({ ...prev, [field]: undefined })); // Clear previous error

    if (!file) return;

    // Rule 1: Basic type check
    if (!file.type.startsWith('image/')) {
      setFileErrors(prev => ({ ...prev, [field]: 'Invalid file type. Please select an image.' }));
      return;
    }

    // Rule 2: Size limit
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setFileErrors(prev => ({ ...prev, [field]: 'File size exceeds 5MB limit.' }));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (!base64) {
        setFileErrors(prev => ({ ...prev, [field]: 'Could not read the file.' }));
        return;
      }

      // Rule 3: Validate it's a real image by loading it
      const img = new Image();
      img.src = base64;

      img.onload = () => {
        // Optional: Dimension check for favicon
        if (field === 'favicon' && (img.width > 128 || img.height > 128)) {
          setFileErrors(prev => ({ ...prev, [field]: 'Favicon dimensions should not exceed 128x128 pixels.' }));
          return;
        }
        // All checks passed, update config
        updateAppearanceConfig(field, base64);
      };

      img.onerror = () => {
        setFileErrors(prev => ({ ...prev, [field]: 'The selected file is not a valid or supported image.' }));
      };
    };

    reader.onerror = () => {
      setFileErrors(prev => ({ ...prev, [field]: 'An error occurred while reading the file.' }));
    };
  };

  const addNode = () => {
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      title: 'New Node',
      subtitle: 'Description',
      ip: 'localhost:3000',
      url: 'localhost:3000',
      icon: 'server',
      type: 'square',
      children: []
    };

    setConfig(prev => ({
      ...prev,
      tree: {
        ...prev.tree,
        nodes: [...prev.tree.nodes, newNode]
      }
    }));
  };

  const updateNode = (nodeId: string, updatedNode: Partial<TreeNode>) => {
    const updateNodeRecursive = (nodes: TreeNode[], currentPath: number[]): TreeNode[] => {
      return nodes.map((node, index) => {
        const newPath = [...currentPath, index];
        
        if (node.id === nodeId) {
          return { ...node, ...updatedNode };
        }
        
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: updateNodeRecursive(node.children, newPath)
          };
        }
        
        return node;
      });
    };

    setConfig(prev => ({
      ...prev,
      tree: {
        ...prev.tree,
        nodes: updateNodeRecursive(prev.tree.nodes, [])
      }
    }));
  };

  const deleteNode = (nodeId: string) => {
    const deleteNodeRecursive = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter(node => node.id !== nodeId)
        .map(node => ({
          ...node,
          children: node.children ? deleteNodeRecursive(node.children) : []
        }));
    };

    setConfig(prev => ({
      ...prev,
      tree: {
        ...prev.tree,
        nodes: deleteNodeRecursive(prev.tree.nodes)
      }
    }));
  };

  const addChildNode = (parentId: string) => {
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      title: 'New Child Node',
      subtitle: 'Description',
      ip: 'localhost:3000',
      url: 'localhost:3000',
      icon: 'server',
      type: 'square',
      children: []
    };

    const addChildRecursive = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newNode]
          };
        }
        
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: addChildRecursive(node.children)
          };
        }
        
        return node;
      });
    };

    setConfig(prev => ({
      ...prev,
      tree: {
        ...prev.tree,
        nodes: addChildRecursive(prev.tree.nodes)
      }
    }));
  };

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const renderIconInput = (nodeId: string, currentIcon: string) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center space-x-3">
          {/* Icon Preview */}
          <div className="flex items-center justify-center w-10 h-10 border border-gray-300 rounded-md bg-gray-50">
            {renderIconPreview(currentIcon, 20, false)}
          </div>
          
          {/* Icon Name Input */}
          <div className="flex-1">
            <input
              type="text"
              value={currentIcon}
              onChange={(e) => updateNode(nodeId, { icon: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter icon name (e.g., server, monitor, wifi)"
            />
          </div>
        </div>
        
        {/* Common Icons Quick Select */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 mb-1 w-full">Quick select:</span>
          {commonIcons.slice(0, 12).map((iconName) => (
            <button
              key={iconName}
              type="button"
              onClick={() => updateNode(nodeId, { icon: iconName })}
              className={`flex items-center space-x-1 px-2 py-1 text-xs border rounded-md hover:bg-gray-100 transition-colors ${
                currentIcon === iconName ? 'border-2' : 'border-gray-300'
              }`}
              style={{
                backgroundColor: currentIcon === iconName ? `${config.appearance.accentColor}15` : undefined,
                borderColor: currentIcon === iconName ? config.appearance.accentColor : undefined,
                color: currentIcon === iconName ? config.appearance.accentColor : undefined
              }}
              title={iconName}
            >
              {renderIconPreview(iconName, 12)}
              <span className="capitalize">{iconName}</span>
            </button>
          ))}
        </div>
        
        {/* Help Text */}
        <div className="text-xs text-gray-500">
          Enter any Lucide icon name. Visit{' '}
          <a 
            href="https://lucide.dev/icons/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            lucide.dev/icons
          </a>{' '}
          to browse all available icons.
        </div>
      </div>
    );
  };

  const renderNodeEditor = (node: TreeNode, level: number = 0): React.ReactNode => {
    const isCollapsed = collapsedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    
    return (
      <div key={node.id} className="relative">
        <div 
          className="border border-gray-200 rounded-lg bg-white shadow-sm mb-2"
          style={{ 
            width: level > 0 ? `calc(100% - ${level * 24}px)` : '100%',
            marginLeft: level > 0 ? `${level * 24}px` : '0'
          }}
        >
          <div className="p-3">
            <div 
              className={`flex items-center justify-between cursor-pointer ${isCollapsed ? '' : 'mb-2'}`}
              onClick={() => toggleNodeCollapse(node.id)}
            >
              <div className="flex items-center space-x-2">
                {/* Always show expand/collapse button for better tree navigation */}
                <button
                  className="p-1 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  title={isCollapsed ? "Expand node details" : "Collapse node details"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeCollapse(node.id);
                  }}
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                <h4 className="font-medium text-gray-800">
                  {node.title}
                </h4>
              </div>
              <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                {isLoggedIn && (
                  <>
                    <button
                      onClick={() => addChildNode(node.id)}
                      className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                      title="Add child node"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => deleteNode(node.id)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                      title="Delete node"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {/* Show detailed form only when expanded */}
            {!isCollapsed && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={node.title}
                      onChange={(e) => updateNode(node.id, { title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={node.subtitle}
                      onChange={(e) => updateNode(node.id, { subtitle: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                    <input
                      type="text"
                      value={node.ip}
                      onChange={(e) => updateNode(node.id, { ip: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="localhost:3000"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="text"
                      value={node.url}
                      onChange={(e) => updateNode(node.id, { url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="example.com"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Shape</label>
                    <div className="grid grid-cols-3 gap-3 w-full">
                      <div 
                        className={`flex flex-col items-center p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${
                          (!node.type || !['square', 'circular', 'angular'].includes(node.type) || node.type === 'square') 
                            ? `border-2 shadow-sm` 
                            : 'border border-gray-300'
                        }`}
                        style={{
                          borderColor: (!node.type || !['square', 'circular', 'angular'].includes(node.type) || node.type === 'square') ? config.appearance.accentColor : undefined,
                          backgroundColor: (!node.type || !['square', 'circular', 'angular'].includes(node.type) || node.type === 'square') ? `${config.appearance.accentColor}08` : undefined
                        }}
                        onClick={() => updateNode(node.id, { type: 'square' })}
                      >
                        <div className="w-8 h-8 bg-gray-100 border border-gray-300 flex items-center justify-center rounded-md">
                          <div className="w-4 h-4 bg-gray-400 rounded-sm"></div>
                        </div>
                        <div className="text-center mt-2">
                          <div className="text-sm font-medium text-gray-900">Square</div>
                          <div className="text-xs text-gray-500">Normal rectangular cards</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`flex flex-col items-center p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${
                          node.type === 'circular' 
                            ? `border-2 shadow-sm` 
                            : 'border border-gray-300'
                        }`}
                        style={{
                          borderColor: node.type === 'circular' ? config.appearance.accentColor : undefined,
                          backgroundColor: node.type === 'circular' ? `${config.appearance.accentColor}08` : undefined
                        }}
                        onClick={() => updateNode(node.id, { type: 'circular' })}
                      >
                        <div className="w-8 h-8 bg-gray-100 border border-gray-300 flex items-center justify-center rounded-full">
                          <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
                        </div>
                        <div className="text-center mt-2">
                          <div className="text-sm font-medium text-gray-900">Circular</div>
                          <div className="text-xs text-gray-500">Pill-shaped cards</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`flex flex-col items-center p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${
                          node.type === 'angular' 
                            ? `border-2 shadow-sm` 
                            : 'border border-gray-300'
                        }`}
                        style={{
                          borderColor: node.type === 'angular' ? config.appearance.accentColor : undefined,
                          backgroundColor: node.type === 'angular' ? `${config.appearance.accentColor}08` : undefined
                        }}
                        onClick={() => updateNode(node.id, { type: 'angular' })}
                      >
                        <div className="w-8 h-8 bg-gray-100 border border-gray-300 flex items-center justify-center" style={{ clipPath: 'polygon(12% 0%, 88% 0%, 100% 25%, 100% 75%, 88% 100%, 12% 100%, 0% 75%, 0% 25%)' }}>
                          <div className="w-4 h-4 bg-gray-400" style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 30%, 100% 70%, 80% 100%, 20% 100%, 0% 70%, 0% 30%)' }}></div>
                        </div>
                        <div className="text-center mt-2">
                          <div className="text-sm font-medium text-gray-900">Angular</div>
                          <div className="text-xs text-gray-500">Diamond-sided cards</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                    {renderIconInput(node.id, node.icon || '')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Render children with tighter spacing */}
        {hasChildren && (
          <div className="space-y-1">
            {node.children!.map((child) => (
              <div key={child.id}>
                {renderNodeEditor(child, level + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAppearanceTab = () => (
    <div className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Page Title
        </label>
        <input
          type="text"
          id="title"
          value={config.appearance.title}
          onChange={(e) => updateAppearanceConfig('title', e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div>
        <label htmlFor="accentColor" className="block text-sm font-medium text-gray-700">
          Accent Color
        </label>
        <input
          type="color"
          id="accentColor"
          value={config.appearance.accentColor}
          onChange={(e) => updateAppearanceConfig('accentColor', e.target.value)}
          className="mt-1 block w-full h-10 px-1 py-1 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Favicon
        </label>
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            {config.appearance.favicon ? (
              <img 
                src={config.appearance.favicon} 
                alt="Favicon Preview" 
                className="w-16 h-16 rounded-lg object-contain border-2 border-gray-200 bg-white p-2"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <span className="text-xs text-gray-400">No Favicon</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="favicon-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a favicon</span>
                    <input 
                      id="favicon-upload" 
                      name="favicon-upload" 
                      type="file" 
                      className="sr-only"
                      accept="image/png, image/jpeg, image/svg+xml, image/x-icon"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'favicon');
                      }}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, SVG, ICO up to 5MB (recommended: 32x32px)</p>
              </div>
            </div>
            {config.appearance.favicon && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => updateAppearanceConfig('favicon', '')}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Remove favicon
                </button>
              </div>
            )}
            {fileErrors.favicon && (
              <p className="mt-2 text-sm text-red-600">{fileErrors.favicon}</p>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Logo
        </label>
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            {config.appearance.logo ? (
              <img 
                src={config.appearance.logo} 
                alt="Logo Preview" 
                className="w-24 h-16 rounded-lg object-contain border-2 border-gray-200 bg-white p-2"
              />
            ) : (
              <div className="w-24 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <span className="text-xs text-gray-400">No Logo</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="logo-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a logo</span>
                    <input 
                      id="logo-upload" 
                      name="logo-upload" 
                      type="file" 
                      className="sr-only"
                      accept="image/png, image/jpeg, image/svg+xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'logo');
                      }}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, SVG up to 5MB (recommended: 256x256px)</p>
              </div>
            </div>
            {config.appearance.logo && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => updateAppearanceConfig('logo', '')}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Remove logo
                </button>
              </div>
            )}
            {fileErrors.logo && (
              <p className="mt-2 text-sm text-red-600">{fileErrors.logo}</p>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Background Image</label>
        
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            {config.appearance?.backgroundImage ? (
              <img
                src={config.appearance.backgroundImage}
                alt="Current background"
                className="w-32 h-20 rounded-lg object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-32 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <span className="text-xs text-gray-400">No Background</span>
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="background-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a background</span>
                    <input 
                      id="background-upload" 
                      name="background-upload" 
                      type="file" 
                      className="sr-only"
                      accept="image/png, image/jpeg, image/svg+xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'backgroundImage');
                      }}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, SVG up to 5MB (will be used as canvas background)</p>
              </div>
            </div>
            
            {config.appearance?.backgroundImage && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => updateAppearanceConfig('backgroundImage', '')}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Remove background image
                </button>
              </div>
            )}
            
            {fileErrors.backgroundImage && (
              <p className="mt-2 text-sm text-red-600">{fileErrors.backgroundImage}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <SettingsIcon size={20} className="text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-800">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-b-2 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{
              borderColor: activeTab === 'general' ? accentColor : 'transparent',
              color: activeTab === 'general' ? accentColor : undefined
            }}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'nodes'
                ? 'border-b-2 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{
              borderColor: activeTab === 'nodes' ? accentColor : 'transparent',
              color: activeTab === 'nodes' ? accentColor : undefined
            }}
          >
            Nodes
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'appearance'
                ? 'border-b-2 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{
              borderColor: activeTab === 'appearance' ? accentColor : 'transparent',
              color: activeTab === 'appearance' ? accentColor : undefined
            }}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'border-b-2 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{
              borderColor: activeTab === 'notifications' ? accentColor : 'transparent',
              color: activeTab === 'notifications' ? accentColor : undefined
            }}
          >
            Notifications
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-4">General Settings</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Health Check Interval (ms)</label>
                  <input
                    type="number"
                    value={config.server.healthCheckInterval}
                    onChange={(e) => updateServerConfig('healthCheckInterval', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                    style={{ 
                      "--tw-ring-color": `${accentColor}40`,
                      borderColor: `${accentColor}` 
                    } as React.CSSProperties}
                  />
                  <p className="text-xs text-gray-500 mt-1">How often to check node status (in milliseconds)</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'nodes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-800">Node Configuration</h3>
                <button
                  onClick={addNode}
                  className="flex items-center space-x-2 px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors"
                  style={{ 
                    backgroundColor: config.appearance?.accentColor || '#3b82f6',
                  }}
                >
                  <Plus size={16} />
                  <span>Add Root Node</span>
                </button>
              </div>
              
              <div className="space-y-4">
                {config.tree.nodes.map(node => renderNodeEditor(node))}
              </div>
            </div>
          )}

          {activeTab === 'appearance' && renderAppearanceTab()}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Status Notification Webhooks</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Configure webhooks to receive notifications when node status changes.
                </p>

                {/* Webhook Endpoint */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Endpoint URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/webhook"
                    value={config.webhooks?.statusNotifications?.endpoint || ''}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        webhooks: {
                          ...config.webhooks,
                          statusNotifications: {
                            ...(config.webhooks?.statusNotifications || { notifyOffline: false, notifyOnline: false }),
                            endpoint: e.target.value
                          }
                        }
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                    style={{ 
                      "--tw-ring-color": `${accentColor}40`,
                      borderColor: `${accentColor}` 
                    } as React.CSSProperties}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The URL where status notifications will be sent via POST request with JSON payload.
                  </p>
                </div>

                {/* Notification Options */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-gray-800">Notification Triggers</h4>
                  
                  {/* Notify when offline */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="notify-offline"
                      checked={config.webhooks?.statusNotifications?.notifyOffline || false}
                      onChange={(e) => {
                        setConfig({
                          ...config,
                          webhooks: {
                            ...config.webhooks,
                            statusNotifications: {
                              ...(config.webhooks?.statusNotifications || { endpoint: '', notifyOnline: false }),
                              notifyOffline: e.target.checked
                            }
                          }
                        });
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      style={{ 
                        accentColor: accentColor
                      }}
                    />
                    <label htmlFor="notify-offline" className="ml-2 block text-sm text-gray-700">
                      Notify when a node goes offline
                    </label>
                  </div>
                  
                  {/* Notify when online */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="notify-online"
                      checked={config.webhooks?.statusNotifications?.notifyOnline || false}
                      onChange={(e) => {
                        setConfig({
                          ...config,
                          webhooks: {
                            ...config.webhooks,
                            statusNotifications: {
                              ...(config.webhooks?.statusNotifications || { endpoint: '', notifyOffline: false }),
                              notifyOnline: e.target.checked
                            }
                          }
                        });
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      style={{ 
                        accentColor: accentColor
                      }}
                    />
                    <label htmlFor="notify-online" className="ml-2 block text-sm text-gray-700">
                      Notify when a node comes online
                    </label>
                  </div>
                </div>

                {/* Example Payload */}
                <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Example Payload</h4>
                  <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
{`{
  "message": "❌ Node name has gone offline",
  "timestamp": "${new Date().toISOString()}"
}`}
                  </pre>
                  <p className="text-xs text-gray-500 mt-2">✅ Online notifications include a green checkmark<br/>❌ Offline notifications include a red X</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          {/* Error Display */}
          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <X className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error saving configuration</h3>
                  <div className="mt-1 text-sm text-red-700">
                    {saveError}
                  </div>
                </div>
                <div className="ml-auto pl-3">
                  <div className="-mx-1.5 -my-1.5">
                    <button
                      onClick={() => setSaveError(null)}
                      className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex items-center justify-between w-full">
            {/* Left side - Logout button */}
            <div>
              {isLoggedIn && (
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 hover:border-red-400 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              )}
            </div>
            
            {/* Right side - Cancel and Save buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center space-x-2 px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: config.appearance?.accentColor || '#3b82f6',
                }}
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
