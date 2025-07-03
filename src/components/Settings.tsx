import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Plus, Trash2, Save, ChevronDown, ChevronRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { AppConfig, TreeNode } from '../types/config';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: AppConfig;
  onSave: (config: AppConfig) => void;
  focusNodeId?: string; // Optional node ID to focus on and expand
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialConfig, onSave, focusNodeId }) => {
  const [config, setConfig] = useState<AppConfig>(() => JSON.parse(JSON.stringify(initialConfig)));
  const [activeTab, setActiveTab] = useState<'general' | 'nodes' | 'appearance'>('general');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [iconDropdownOpen, setIconDropdownOpen] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<{ favicon?: string; backgroundImage?: string; logo?: string }>({});

  // Simple list of common/popular icons for suggestions (optional)
  const commonIcons = [
    'server', 'monitor', 'tv', 'clapperboard', 'smartphone', 'tablet', 'laptop',
    'hard-drive', 'database', 'wifi', 'globe', 'cloud', 'shield', 'lock', 'key',
    'users', 'user', 'settings', 'wrench', 'tool', 'cpu', 'activity', 'zap',
    'play', 'pause', 'stop', 'power', 'camera', 'video', 'mic', 'headphones',
    'printer', 'phone', 'mail', 'bell', 'clock', 'calendar', 'file', 'folder',
    'download', 'upload', 'github', 'chrome', 'firefox', 'home', 'building'
  ];

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

  // Function to render shape preview icons
  const renderShapePreview = (shapeType: 'square' | 'circular' | 'angular') => {
    const commonProps = {
      className: "w-8 h-8 bg-gray-100 border border-gray-300 flex items-center justify-center"
    };

    switch (shapeType) {
      case 'square':
        return (
          <div {...commonProps} style={{ borderRadius: '6px' }}>
            <div className="w-4 h-4 bg-gray-400 rounded-sm"></div>
          </div>
        );
      case 'circular':
        return (
          <div {...commonProps} style={{ borderRadius: '16px' }}>
            <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
          </div>
        );
      case 'angular':
        return (
          <div {...commonProps} style={{ 
            borderRadius: '0px',
            clipPath: 'polygon(12% 0%, 88% 0%, 100% 25%, 100% 75%, 88% 100%, 12% 100%, 0% 75%, 0% 25%)'
          }}>
            <div className="w-4 h-4 bg-gray-400" style={{
              clipPath: 'polygon(20% 0%, 80% 0%, 100% 30%, 100% 70%, 80% 100%, 20% 100%, 0% 70%, 0% 30%)'
            }}></div>
          </div>
        );
      default:
        return null;
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

  const handleSave = () => {
    onSave(config);
    onClose();
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

  const updateClientConfig = (field: keyof AppConfig['client'], value: number | string) => {
    setConfig(prev => ({
      ...prev,
      client: {
        ...prev.client,
        [field]: value
      }
    }));
  };

  const updateAppearanceConfig = (field: keyof AppConfig['appearance'], value: string) => {
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
                        {renderShapePreview('square')}
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
                        {renderShapePreview('circular')}
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
                        {renderShapePreview('angular')}
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
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'nodes'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Nodes
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'appearance'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Appearance
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Server Settings */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-4">Server Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Server Port</label>
                    <input
                      type="number"
                      value={config.server.port}
                      onChange={(e) => updateServerConfig('port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Health Check Interval (ms)</label>
                    <input
                      type="number"
                      value={config.server.healthCheckInterval}
                      onChange={(e) => updateServerConfig('healthCheckInterval', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Client Settings */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-4">Client Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Port</label>
                    <input
                      type="number"
                      value={config.client.port}
                      onChange={(e) => updateClientConfig('port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Polling Interval (ms)</label>
                    <input
                      type="number"
                      value={config.client.apiPollingInterval}
                      onChange={(e) => updateClientConfig('apiPollingInterval', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                    <input
                      type="text"
                      value={config.client.host}
                      onChange={(e) => updateClientConfig('host', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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

          {activeTab === 'appearance' && (
            <div className="space-y-8">
              <h3 className="text-lg font-medium text-gray-800 mb-6">Appearance Settings</h3>
              
              {/* Basic Settings - Two Column Layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* Page Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Page Title</label>
                  <input
                    type="text"
                    value={config.appearance?.title || 'Nautilus'}
                    onChange={(e) => updateAppearanceConfig('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter page title"
                  />
                  <p className="text-xs text-gray-500 mt-1">This will appear in the browser tab</p>
                </div>

                {/* Accent Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={config.appearance?.accentColor || '#3b82f6'}
                      onChange={(e) => updateAppearanceConfig('accentColor', e.target.value)}
                      className="w-12 h-10 border border-gray-300 rounded-md cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.appearance?.accentColor || '#3b82f6'}
                      onChange={(e) => updateAppearanceConfig('accentColor', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="#3b82f6"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Used for buttons and interactive elements</p>
                </div>
              </div>

              {/* File Uploads Section */}
              <div className="space-y-6">
                <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">File Uploads</h4>
                
                <div className="grid grid-cols-1 gap-6">
                  {/* Favicon Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
                    
                    {/* Current Favicon Preview */}
                    {config.appearance?.favicon && (
                      <div className="mb-3 flex items-center space-x-3">
                        <img 
                          src={config.appearance.favicon} 
                          alt="Current favicon" 
                          className="w-8 h-8 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => updateAppearanceConfig('favicon', '')}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-300 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    
                    {/* Drag and Drop Area */}
                    <div
                      onClick={() => document.getElementById('favicon-upload')?.click()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        handleFileUpload(file, 'favicon');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={(e) => e.preventDefault()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    >
                      <div className="space-y-2">
                        <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                        </div>
                        <p className="text-xs text-gray-500">Recommended: up to 128x128 (max 5MB)</p>
                      </div>
                      <input
                        id="favicon-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'favicon');
                        }}
                        className="hidden"
                      />
                    </div>
                    {fileErrors.favicon && (
                      <p className="text-xs text-red-600 mt-2">{fileErrors.favicon}</p>
                    )}
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Logo (fallback to favicon if empty)</label>
                    
                    {/* Current Logo Preview */}
                    {config.appearance?.logo && (
                      <div className="mb-3 flex items-center space-x-3">
                        <img 
                          src={config.appearance.logo} 
                          alt="Current logo" 
                          className="w-12 h-12 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => updateAppearanceConfig('logo', '')}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-300 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    
                    {/* Drag and Drop Area */}
                    <div
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        handleFileUpload(file, 'logo');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={(e) => e.preventDefault()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    >
                      <div className="space-y-2">
                        <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                        </div>
                        <p className="text-xs text-gray-500">Recommended: square format, 256x256 or larger (max 5MB)</p>
                      </div>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'logo');
                        }}
                        className="hidden"
                      />
                    </div>
                    {fileErrors.logo && (
                      <p className="text-xs text-red-600 mt-2">{fileErrors.logo}</p>
                    )}
                  </div>

                  {/* Background Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Background Image</label>
                    
                    {/* Current Background Preview */}
                    {config.appearance?.backgroundImage && (
                      <div className="mb-3 relative">
                        <img 
                          src={config.appearance.backgroundImage} 
                          alt="Current background" 
                          className="w-full h-24 object-cover border border-gray-300 rounded-md"
                        />
                        <button
                          onClick={() => updateAppearanceConfig('backgroundImage', '')}
                          className="absolute top-2 right-2 px-2 py-1 text-xs text-red-600 bg-white hover:bg-red-50 border border-red-300 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    
                    {/* Drag and Drop Area */}
                    <div
                      onClick={() => document.getElementById('background-upload')?.click()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        handleFileUpload(file, 'backgroundImage');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={(e) => e.preventDefault()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    >
                      <div className="space-y-2">
                        <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                        </div>
                        <p className="text-xs text-gray-500">Background image for the canvas (max 5MB)</p>
                      </div>
                      <input
                        id="background-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'backgroundImage');
                        }}
                        className="hidden"
                      />
                    </div>
                    {fileErrors.backgroundImage && (
                        <p className="text-xs text-red-600 mt-2">{fileErrors.backgroundImage}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors"
            style={{ 
              backgroundColor: config.appearance?.accentColor || '#3b82f6',
            }}
          >
            <Save size={16} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
