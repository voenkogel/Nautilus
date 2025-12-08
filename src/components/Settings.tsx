import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Plus, Trash2, Save, ChevronDown, ChevronRight, LogOut, Network, Download, Upload } from 'lucide-react';
import type { AppConfig, TreeNode } from '../types/config';
import { clearAuthentication, isAuthenticated } from '../utils/auth';
import { downloadConfigBackup, createConfigFileInput } from '../utils/configBackup';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';

import { NodeFormFields } from './NodeFormFields';
import Switch from './Switch';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: AppConfig;
  onSave: (config: AppConfig) => void;
  focusNodeId?: string; // Optional node ID to focus on and expand
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialConfig, onSave, focusNodeId }) => {
  const { addToast } = useToast();
  
  // Use initialConfig as the source of truth, reflecting merged config from env vars and config.json
  const [config, setConfig] = useState<AppConfig>(() => ({
    general: {
      title: initialConfig.general?.title ?? 'Nautilus',
      openNodesAsOverlay: initialConfig.general?.openNodesAsOverlay ?? true,
    },
    server: {
      healthCheckInterval: initialConfig.server?.healthCheckInterval ?? 20000,
      corsOrigins: initialConfig.server?.corsOrigins ?? ['http://localhost:3070']
    },
    client: {
      apiPollingInterval: initialConfig.client?.apiPollingInterval ?? 5000
    },
    appearance: {
      accentColor: initialConfig.appearance?.accentColor ?? '#3b82f6',
      favicon: initialConfig.appearance?.favicon ?? '',
      backgroundImage: initialConfig.appearance?.backgroundImage ?? '',
      logo: initialConfig.appearance?.logo ?? '',
      disableBackground: (initialConfig.appearance as any)?.disableBackground ?? false
    },
    tree: {
      nodes: initialConfig.tree?.nodes ?? []
    },
    webhooks: initialConfig.webhooks ?? {
      statusNotifications: {
        endpoint: '',
        notifyOffline: false,
        notifyOnline: false
      }
    }
  }));
  const [activeTab, setActiveTab] = useState<'general' | 'nodes' | 'appearance' | 'notifications'>('general');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [iconDropdownOpen, setIconDropdownOpen] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<{ favicon?: string; backgroundImage?: string; logo?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showClearNodesConfirm, setShowClearNodesConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreConfig, setPendingRestoreConfig] = useState<AppConfig | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isTestingSend, setIsTestingSend] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    nodeId: string;
    nodeTitle: string;
    childCount: number;
  } | null>(null);

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

  // Handle making backup
  const handleMakeBackup = () => {
    try {
      setBackupError(null);
      downloadConfigBackup(config);
      addToast({
        type: 'success',
        message: 'Backup created and downloaded successfully!',
        duration: 3000
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create backup';
      setBackupError(errorMessage);
      addToast({
        type: 'error',
        message: `Backup creation failed: ${errorMessage}`,
        duration: 5000
      });
    }
  };

  // Handle restoring backup
  const handleRestoreBackup = () => {
    const input = createConfigFileInput(
      (restoredConfig) => {
        setPendingRestoreConfig(restoredConfig);
        setShowRestoreConfirm(true);
        setBackupError(null);
        addToast({
          type: 'info',
          message: 'Backup file loaded successfully. Please confirm to apply changes.',
          duration: 4000
        });
      },
      (error) => {
        setBackupError(error);
        addToast({
          type: 'error',
          message: `Failed to load backup file: ${error}`,
          duration: 6000
        });
      }
    );
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };

  // Confirm and apply restored configuration
  const confirmRestore = () => {
    if (pendingRestoreConfig) {
      setConfig(pendingRestoreConfig);
      setPendingRestoreConfig(null);
      setShowRestoreConfirm(false);
      setBackupError(null);
      addToast({
        type: 'success',
        message: `Configuration restored! Applied ${pendingRestoreConfig.tree.nodes.length} nodes. Remember to save your changes.`,
        duration: 5000
      });
    }
  };

  // Cancel restore operation
  const cancelRestore = () => {
    setPendingRestoreConfig(null);
    setShowRestoreConfirm(false);
    setBackupError(null);
  };

  // Get accent color from configuration
  const accentColor = config.appearance?.accentColor ?? '#3b82f6';

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

  // Ensure config updates always reflect the merged config structure
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

  const updateGeneralConfig = (field: keyof AppConfig['general'], value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      general: {
        ...prev.general,
        [field]: value
      }
    }));
  };

  // Clear all nodes (for "Clear Nodes" button)
  const clearNodes = () => {
    setConfig(prev => ({
      ...prev,
      tree: {
        ...prev.tree,
        nodes: []
      }
    }));
  };

  // Save handler ensures config matches centralized structure
  // ...existing code...
  // Restore handleFileUpload for image uploads
  const handleFileUpload = (file: File, field: 'favicon' | 'backgroundImage' | 'logo') => {
    setFileErrors(prev => ({ ...prev, [field]: undefined })); // Clear previous error

    if (!file) return;

    // Rule 1: Basic type check
    if (!file.type.startsWith('image/')) {
      setFileErrors(prev => ({ ...prev, [field]: 'Invalid file type. Please select an image.' }));
      return;
    }

    // Rule 2: Size limit - Server supports up to 50MB, but reasonable limit for images
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit (reasonable for logo images)
    
    if (file.size > maxSizeBytes) {
      setFileErrors(prev => ({ 
        ...prev, 
        [field]: `File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)} MB. Please compress your image or use a smaller file.` 
      }));
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
        
        // Note: No dimension restrictions for logo field - any size should work
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

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await onSave(config);
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Handle specific error types
      if (errorMessage.includes('PayloadTooLargeError') || errorMessage.includes('413')) {
        errorMessage = 'One or more images are too large. Please use smaller images (under 10MB each).';
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

  const handleSendTestNotification = async () => {
    const endpoint = config.webhooks?.statusNotifications?.endpoint;
    
    if (!endpoint) {
      addToast({
        type: 'error',
        message: 'Please enter a webhook endpoint URL first',
        duration: 4000
      });
      return;
    }

    setIsTestingSend(true);

    try {
      const testPayload = {
        message: "🧪 Test notification from Nautilus",
        timestamp: new Date().toISOString(),
        nodeId: "test-node",
        nodeName: "Test Node",
        status: "test",
        details: "This is a test notification to verify your webhook endpoint is working correctly."
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        addToast({
          type: 'success',
          message: `Test notification sent successfully! (${response.status})`,
          duration: 4000
        });
      } else {
        const errorText = await response.text();
        addToast({
          type: 'error',
          message: `Failed to send test notification: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
          duration: 6000
        });
      }
    } catch (error) {
      console.error('Test notification error:', error);
      addToast({
        type: 'error',
        message: `Failed to send test notification: ${error instanceof Error ? error.message : 'Network error'}`,
        duration: 6000
      });
    } finally {
      setIsTestingSend(false);
    }
  };

  // ...existing code...

  const addNode = () => {
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      title: 'New Node',
      subtitle: 'Description',
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

  // Helper function to count all descendants of a node
  const countDescendants = (node: TreeNode): number => {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
  };

  // Helper function to find a node by ID
  const findNodeById = (nodes: TreeNode[], id: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Core delete function
  const performDeleteNode = (nodeId: string) => {
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

  const deleteNode = (nodeId: string) => {
    const node = findNodeById(config.tree.nodes, nodeId);
    if (!node) return;

    const childCount = countDescendants(node);

    if (childCount > 0) {
      // Show confirmation dialog for nodes with children
      setDeleteConfirmation({
        isOpen: true,
        nodeId,
        nodeTitle: node.title,
        childCount
      });
    } else {
      // Delete directly if no children
      performDeleteNode(nodeId);
    }
  };

  const addChildNode = (parentId: string) => {
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      title: 'New Child Node',
      subtitle: 'Description',
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
              <div className="mt-4">
                <NodeFormFields 
                  node={node} 
                  onChange={(updates) => updateNode(node.id, updates)}
                  appearance={config.appearance}
                />
              </div>
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
      {/* Removed title from appearance tab, now in general tab */}
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
                <p className="text-xs text-gray-500">PNG, JPG, SVG, ICO up to 10MB (recommended: 32x32px)</p>
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
                <p className="text-xs text-gray-500">PNG, JPG, SVG up to 10MB (any size or aspect ratio)</p>
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
                <p className="text-xs text-gray-500">PNG, JPG, SVG up to 10MB (will be used as canvas background)</p>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col animate-slide-up">
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
            min={2000}
            value={config.server.healthCheckInterval}
            onChange={(e) => updateServerConfig('healthCheckInterval', Math.max(2000, parseInt(e.target.value)))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ 
              "--tw-ring-color": `${accentColor}40`,
              borderColor: `${accentColor}` 
            } as React.CSSProperties}
          />
          <p className="text-xs text-gray-500 mt-1">How often to check node status (minimum 2000 ms)</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Title</label>
                <input
                  type="text"
                  value={config.general.title}
                  onChange={(e) => updateGeneralConfig('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                  style={{ 
                    "--tw-ring-color": `${accentColor}40`,
                    borderColor: `${accentColor}` 
                  } as React.CSSProperties}
                />
                <p className="text-xs text-gray-500 mt-1">Displayed in the app header and browser tab</p>
              </div>
              <div className="flex items-center mt-4">
                <Switch
                  id="open-nodes-overlay"
                  checked={config.general.openNodesAsOverlay}
                  onChange={(checked) => updateGeneralConfig('openNodesAsOverlay', checked)}
                  accentColor={accentColor}
                />
                <label htmlFor="open-nodes-overlay" className="ml-2 block text-sm text-gray-700">
                  Open nodes as overlay (recommended)
                </label>
              </div>
                </div>
              </div>

              {/* Backup Management Section */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-6">Backup Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                          <Download size={20} className="text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-800">Make Backup</h4>
                          <p className="text-sm text-gray-600">Create and download a backup of your current configuration</p>
                        </div>
                      </div>
                      <button
                        onClick={handleMakeBackup}
                        className="flex items-center justify-center space-x-2 px-4 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-all transform hover:scale-105"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Download size={16} />
                        <span>Create Backup</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                          <Upload size={20} className="text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-800">Restore Backup</h4>
                          <p className="text-sm text-gray-600">Restore your configuration from a backup file</p>
                        </div>
                      </div>
                      <button
                        onClick={handleRestoreBackup}
                        className="flex items-center justify-center space-x-2 px-4 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-all transform hover:scale-105 bg-blue-600 hover:bg-blue-700"
                      >
                        <Upload size={16} />
                        <span>Choose File</span>
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Warning message moved outside cards for better visibility */}
                <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start space-x-2">
                  <div className="flex-shrink-0 w-5 h-5 text-amber-500 mt-0.5">⚠️</div>
                  <div>
                    <strong>Important:</strong> Restoring a backup will replace your entire current configuration. Make sure to create a backup first if you want to preserve your current settings.
                  </div>
                </div>

                {backupError && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" />
                        <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-red-800 mb-1">Backup Error</h4>
                        <div className="text-sm text-red-600 whitespace-pre-line">{backupError}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'nodes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-800">Node Settings</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowClearNodesConfirm(true)}
                    className="flex items-center space-x-2 px-4 py-2 text-white rounded-md transition-colors bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 size={16} />
                    <span>Clear Nodes</span>
                  </button>
                  <button
                    onClick={async () => {
                      // Require admin authentication before opening scan window
                      const authenticated = await isAuthenticated();
                      if (!authenticated) {
                        alert('Admin authentication required to discover nodes.');
                        return;
                      }
                      if (typeof window !== 'undefined' && window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('openScanWindow'));
                      }
                      // Close settings window if open
                      if (typeof onClose === 'function') onClose();
                    }}
                    className="flex items-center space-x-2 px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors"
                    style={{ backgroundColor: config.appearance?.accentColor || '#3b82f6' }}
                  >
                    <Network size={16} />
                    <span>Discover Nodes</span>
                  </button>
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
              </div>
              <div className="space-y-4">
                {config.tree.nodes.map(node => renderNodeEditor(node))}
              </div>
              {/* Confirmation Modal Overlay */}
              {showClearNodesConfirm && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50">
                  <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full flex flex-col items-center">
                    <Trash2 size={32} className="text-red-600 mb-2" />
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">Clear All Nodes?</h4>
                    <p className="text-sm text-gray-600 mb-6 text-center">This will remove <b>all nodes</b> from the configuration. This action cannot be undone.<br />Are you sure you want to proceed?</p>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setShowClearNodesConfirm(false)}
                        className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          clearNodes();
                          setShowClearNodesConfirm(false);
                        }}
                        className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                      >
                        Yes, Clear All
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Restore Backup Confirmation Modal */}
              {showRestoreConfirm && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50">
                  <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full flex flex-col items-center">
                    <Upload size={32} className="text-amber-600 mb-2" />
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">Restore Backup?</h4>
                    <p className="text-sm text-gray-600 mb-6 text-center">
                      This will <b>replace your entire current configuration</b> with the backup file. 
                      All current settings, nodes, and appearance customizations will be overwritten.
                      <br /><br />
                      Are you sure you want to proceed?
                    </p>
                    <div className="flex gap-4">
                      <button
                        onClick={cancelRestore}
                        className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmRestore}
                        className="px-4 py-2 rounded-md text-white hover:opacity-90"
                        style={{ backgroundColor: accentColor }}
                      >
                        Yes, Restore
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
  // State for clear nodes confirmation modal
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
                    <Switch
                      id="notify-offline"
                      checked={config.webhooks?.statusNotifications?.notifyOffline || false}
                      onChange={(checked) => {
                        setConfig({
                          ...config,
                          webhooks: {
                            ...config.webhooks,
                            statusNotifications: {
                              ...(config.webhooks?.statusNotifications || { endpoint: '', notifyOnline: false }),
                              notifyOffline: checked
                            }
                          }
                        });
                      }}
                      accentColor={accentColor}
                    />
                    <label htmlFor="notify-offline" className="ml-2 block text-sm text-gray-700">
                      Notify when a node goes offline
                    </label>
                  </div>
                  
                  {/* Notify when online */}
                  <div className="flex items-center">
                    <Switch
                      id="notify-online"
                      checked={config.webhooks?.statusNotifications?.notifyOnline || false}
                      onChange={(checked) => {
                        setConfig({
                          ...config,
                          webhooks: {
                            ...config.webhooks,
                            statusNotifications: {
                              ...(config.webhooks?.statusNotifications || { endpoint: '', notifyOffline: false }),
                              notifyOnline: checked
                            }
                          }
                        });
                      }}
                      accentColor={accentColor}
                    />
                    <label htmlFor="notify-online" className="ml-2 block text-sm text-gray-700">
                      Notify when a node comes online
                    </label>
                  </div>
                </div>

                {/* Example Payload */}
                <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">Example Payload</h4>
                    <button
                      onClick={handleSendTestNotification}
                      disabled={isTestingSend || !config.webhooks?.statusNotifications?.endpoint}
                      className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-white rounded-md hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: accentColor }}
                    >
                      {isTestingSend ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Send Test</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
{`{
  "message": "🧪 Test notification from Nautilus",
  "timestamp": "${new Date().toISOString()}",
  "nodeId": "test-node",
  "nodeName": "Test Node",
  "status": "test",
  "details": "This is a test notification..."
}`}
                  </pre>
                  <p className="text-xs text-gray-500 mt-2">
                    ✅ Online notifications include a green checkmark<br/>
                    ❌ Offline notifications include a red X<br/>
                    🧪 Test notifications help verify your webhook endpoint
                  </p>
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
                  <h3 className="text-sm font-medium text-red-800">Error saving settings</h3>
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
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation && (
        <ConfirmDialog
          isOpen={deleteConfirmation.isOpen}
          title="Delete Node with Children"
          message={`"${deleteConfirmation.nodeTitle}" has ${deleteConfirmation.childCount} child node${deleteConfirmation.childCount > 1 ? 's' : ''}. Deleting this node will also delete all its children. This action cannot be undone.`}
          confirmLabel="Delete All"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            performDeleteNode(deleteConfirmation.nodeId);
            setDeleteConfirmation(null);
          }}
          onCancel={() => setDeleteConfirmation(null)}
        />
      )}
    </div>
  );
};

export default Settings;
