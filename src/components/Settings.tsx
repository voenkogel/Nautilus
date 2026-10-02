import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, X, Plus, Trash2, Save, LogOut, Network, Download, Upload, SlidersHorizontal, Palette, Bell, Shield } from 'lucide-react';
import type { AppConfig, TreeNode } from '../types/config';
import { findNodeById, countDescendants, getAllNodes } from '../utils/nodeUtils';
import { clearAuthentication, isAuthenticated, isAuthDisabled } from '../utils/auth';
import { downloadConfigBackup, createConfigFileInput } from '../utils/configBackup';
import { assetUrl } from '../utils/assetUrl';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';

import { SettingsNodeTree } from './settings/SettingsNodeTree';
import { AccountSettings } from './settings/AccountSettings';
import Switch from './Switch';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
  onRestore: (config: AppConfig) => Promise<void>;
  focusNodeId?: string; // Optional node ID to focus on and expand
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialConfig, onSave, onRestore, focusNodeId }) => {
  const { addToast } = useToast();
  
  // Use initialConfig as the source of truth, reflecting merged config from env vars and config.json
  const settingsRef = useRef<HTMLDivElement>(null);
  useFocusTrap(settingsRef, isOpen);
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
      disableBackground: initialConfig.appearance?.disableBackground ?? false
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
  const [activeTab, setActiveTab] = useState<'general' | 'nodes' | 'appearance' | 'notifications' | 'account'>('general');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [iconDropdownOpen, setIconDropdownOpen] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<{ favicon?: string; backgroundImage?: string; logo?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showClearNodesConfirm, setShowClearNodesConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreConfig, setPendingRestoreConfig] = useState<AppConfig | null>(null);
  const [restoreStaged, setRestoreStaged] = useState(false);
  const editingSession = useRef(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isTestingSend, setIsTestingSend] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    nodeId: string;
    nodeTitle: string;
    childCount: number;
  } | null>(null);
  const [versionInfo, setVersionInfo] = useState<{ version: string; sha: string; tag: string | null } | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = await isAuthenticated();
      setIsLoggedIn(authenticated);
    };
    checkAuth();
  }, [isOpen]); // Check when modal opens

  // Fetch version info once when settings opens
  useEffect(() => {
    if (!isOpen || versionInfo) return;
    fetch('api/version')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setVersionInfo(data); })
      .catch(() => {});
  }, [isOpen]);

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
      setRestoreStaged(true);
      setCollapsedNodes(new Set());
      setPendingRestoreConfig(null);
      setShowRestoreConfirm(false);
      setBackupError(null);

    }
  };

  // Cancel restore operation
  const cancelRestore = () => {
    setPendingRestoreConfig(null);
    setShowRestoreConfirm(false);
    setBackupError(null);
  };

  // Get accent color from configuration
  const accentColor = '#65d7e8';

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

  // Refresh between editing sessions; live updates must not overwrite a draft.
  useEffect(() => {
    if (!isOpen || !editingSession.current) {
      setConfig(structuredClone(initialConfig));
      setRestoreStaged(false);
      setPendingRestoreConfig(null);
      setShowRestoreConfirm(false);
      setSaveError(null);
    }
    editingSession.current = isOpen;
  }, [initialConfig, isOpen]);

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
        const fieldLabel = field === 'backgroundImage' ? 'Background image' : field === 'favicon' ? 'Favicon' : 'Logo';
        addToast({ type: 'success', message: `${fieldLabel} updated`, duration: 2000 });
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
      await (restoreStaged ? onRestore(config) : onSave(config));
      addToast({ type: 'success', message: restoreStaged ? 'Backup restored and saved' : 'Settings saved', duration: 2000 });
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

  // findNodeById and countDescendants are imported from utils/nodeUtils

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



  // Node tree extracted to <SettingsNodeTree /> (ARCH-2c)

  const renderAppearanceTab = () => (
    <div className="identity-settings">
      <div className="theme-preview"><span className="theme-preview-orbit" /><div><strong>Deep sea</strong><p>Designed for a clear view of your network, day or night.</p></div></div>
      {(['logo', 'favicon'] as const).map(kind => <section className="identity-upload" key={kind}>
        <div className="identity-artwork">{config.appearance[kind] ? <img src={assetUrl(config.appearance[kind]!)} alt={`${kind} preview`} /> : <Palette size={28} />}</div>
        <div><h4>{kind === 'logo' ? 'Workspace logo' : 'Browser icon'}</h4><p>{kind === 'logo' ? 'Your identity in the navigation bar.' : 'Find your network among your browser tabs.'}</p><small>PNG, JPG, SVG{kind === 'favicon' ? ', ICO' : ''} · Up to 10 MB</small><div className="identity-upload-actions"><label className="upload-button">Upload {kind}<input type="file" className="sr-only" accept={kind === 'favicon' ? 'image/png,image/jpeg,image/svg+xml,image/x-icon' : 'image/png,image/jpeg,image/svg+xml'} onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, kind); }} /></label>{config.appearance[kind] && <button onClick={() => updateAppearanceConfig(kind, '')}>Remove</button>}</div>{fileErrors[kind] && <p role="alert" className="text-negative">{fileErrors[kind]}</p>}</div>
      </section>)}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div ref={settingsRef} onKeyDown={event => { if (event.key === "Escape" && !document.querySelector('[role="alertdialog"]')) { event.stopPropagation(); onClose(); } }} className="settings-workspace" role="dialog" aria-modal="true" aria-label="Settings">
        {/* Header */}
        <div className="settings-heading flex items-center justify-between border-b border-line flex-shrink-0">
          <div className="flex items-center space-x-2">
            <SettingsIcon size={20} className="text-muted" />
            <h2 className="text-xl font-semibold text-ink">Settings</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 text-muted hover:text-muted hover:bg-raised rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="settings-navigation" aria-label="Settings sections">
          {([
            ['general', 'General', 'Preferences & backups', SlidersHorizontal],
            ['nodes', 'Nodes', 'Services & hierarchy', Network],
            ['appearance', 'Appearance', 'Your network identity', Palette],
            ['notifications', 'Notifications', 'Alerts & delivery', Bell],
            ['account', 'Account', 'Access & security', Shield],
          ] as const).map(([id, label, hint, Icon]) => <button key={id} aria-label={label} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}><Icon size={19} /><span>{label}<small>{hint}</small></span></button>)}
        </nav>
        <div className={`settings-content settings-${activeTab}`}>
          <header className="settings-section-title"><h3>{{ general: 'Make Nautilus yours', nodes: 'Manage your network', appearance: 'A familiar identity', notifications: 'Stay ahead of outages', account: 'Control your access' }[activeTab]}</h3><p>{{ general: 'Choose how your network is monitored and how you explore it.', nodes: 'Organize services, edit connections, and keep your topology up to date.', appearance: 'Your name and artwork, across the observatory.', notifications: 'Decide when and where changes in your network reach you.', account: 'Manage the credentials that protect your network.' }[activeTab]}</p></header>
          {activeTab === 'general' && <div className="preference-sections">
            <section className="preference-section"><div><h4>Workspace</h4><p>How you recognize and navigate your network.</p></div><div className="preference-fields">
              <label className="preference-field">App title<input value={config.general.title} onChange={e => updateGeneralConfig('title', e.target.value)} /><small>Appears in the header and browser tab.</small></label>
              <div className="preference-toggle"><div><label htmlFor="open-nodes-overlay">Open services in Nautilus</label><p>Keep the network in reach with an embedded overlay.</p></div><Switch id="open-nodes-overlay" checked={config.general.openNodesAsOverlay} onChange={checked => updateGeneralConfig('openNodesAsOverlay', checked)} accentColor={accentColor} /></div>
            </div></section>
            <section className="preference-section"><div><h4>Monitoring cadence</h4><p>Balance fresh readings with traffic to your services.</p></div><div className="preference-fields"><label className="preference-field">Health check interval<div className="input-unit"><input type="number" min={2000} value={config.server.healthCheckInterval} onChange={e => updateServerConfig('healthCheckInterval', Math.max(2000, Number(e.target.value)))} /><span>ms</span></div><small>Minimum 2,000 ms. Applies to all monitored nodes.</small></label></div></section>
            <section className="preference-section"><div><h4>Configuration backups</h4><p>Keep a copy of your nodes and preferences.</p></div><div className="backup-actions">
              <button onClick={handleMakeBackup}><Download size={20} /><span>Create Backup<small>Download your current configuration</small></span></button>
              <button onClick={handleRestoreBackup}><Upload size={20} /><span>Restore Backup<small>Choose a saved configuration file</small></span></button>
              <p>Restoring replaces the current configuration.</p>{backupError && <p role="alert" className="text-negative">{backupError}</p>}
            </div></section>
          </div>}

          {activeTab === 'nodes' && (
            <div className="space-y-6">
              <div className="settings-node-toolbar">
                <button className="toolbar-primary" onClick={addNode}><Plus size={16} /><span>Add node</span></button>
                <button
                  aria-label="Discover Nodes"
                  onClick={async () => {
                    // Require admin authentication before opening scan window
                    const authenticated = await isAuthenticated();
                    if (!authenticated) {
                      alert('Admin authentication required to discover nodes.');
                      return;
                    }
                    window.dispatchEvent(new CustomEvent('openScanWindow'));
                    onClose();
                  }}
                ><Network size={16} /><span>Discover</span></button>
                <button className="toolbar-danger" onClick={() => setShowClearNodesConfirm(true)} disabled={!config.tree.nodes.length}><Trash2 size={15} /><span>Clear all</span></button>
              </div>
              <div className="settings-node-tree">
                {config.tree.nodes.map(node => (
                  <SettingsNodeTree
                    key={node.id}
                    node={node}
                    collapsedNodes={collapsedNodes}
                    isLoggedIn={isLoggedIn}
                    appearance={config.appearance}
                    onToggleCollapse={toggleNodeCollapse}
                    onAddChild={addChildNode}
                    onDelete={deleteNode}
                    onUpdateNode={updateNode}
                  />
                ))}
              </div>


            </div>

          )}

          {activeTab === 'appearance' && renderAppearanceTab()}

          {activeTab === 'account' && <AccountSettings accentColor={accentColor} />}

          {activeTab === 'notifications' && <div className="preference-sections">
            <section className="preference-section"><div><h4>Delivery destination</h4><p>Send status changes to your automation or notification service.</p></div><div className="preference-fields"><label className="preference-field">Webhook endpoint<input type="url" placeholder="https://example.com/webhook" value={config.webhooks?.statusNotifications?.endpoint || ''} onChange={e => setConfig({ ...config, webhooks: { ...config.webhooks, statusNotifications: { notifyOffline: false, notifyOnline: false, ...config.webhooks?.statusNotifications, endpoint: e.target.value } } })} /><small>Notifications are sent as a JSON POST request.</small></label></div></section>
            <section className="preference-section"><div><h4>When to notify</h4><p>Choose the changes that need your attention.</p></div><div className="preference-fields">
              {(['notifyOffline', 'notifyOnline'] as const).map(key => <div className="preference-toggle" key={key}><div><label htmlFor={key}>{key === 'notifyOffline' ? 'A service goes offline' : 'A service recovers'}</label><p>{key === 'notifyOffline' ? 'Know when a health check fails.' : 'Get confirmation when it is back online.'}</p></div><Switch id={key} checked={config.webhooks?.statusNotifications?.[key] || false} onChange={checked => setConfig({ ...config, webhooks: { ...config.webhooks, statusNotifications: { endpoint: '', notifyOffline: false, notifyOnline: false, ...config.webhooks?.statusNotifications, [key]: checked } } })} accentColor={accentColor} /></div>)}
              {config.webhooks?.statusNotifications?.notifyOffline && <label className="preference-field notification-delay">Wait before alerting<div className="input-unit"><input type="number" min={0} step={30} value={config.webhooks.statusNotifications.notifyAfterSeconds ?? 0} onChange={e => setConfig({ ...config, webhooks: { ...config.webhooks, statusNotifications: { ...config.webhooks!.statusNotifications!, notifyAfterSeconds: Math.max(0, Number(e.target.value)) } } })} /><span>seconds</span></div><small>Use a delay to avoid alerts for brief interruptions.</small></label>}
            </div></section>
            <section className="preference-section"><div><h4>Verify delivery</h4><p>Send a sample notification to check the connection.</p></div><div className="backup-actions"><button disabled={isTestingSend || !config.webhooks?.statusNotifications?.endpoint} onClick={handleSendTestNotification}><Bell size={20} /><span>{isTestingSend ? 'Sending…' : 'Send test notification'}<small>Uses the endpoint entered above</small></span></button></div></section>
          </div>}

        </div>

        {/* Footer */}
        <div className="settings-footer border-t border-line bg-abyss flex-shrink-0">
          {restoreStaged && <div className="restore-pending" role="status"><Upload size={18} /><span><strong>Backup ready to apply</strong><small>{getAllNodes(config.tree.nodes).length} nodes will replace your current network when you save.</small></span></div>}
          {/* Error Display */}
          {saveError && (
            <div className="mb-4 p-3 bg-negative/10 border border-negative/25 rounded-md">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <X className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-negative">Error saving settings</h3>
                  <div className="mt-1 text-sm text-negative">
                    {saveError}
                  </div>
                </div>
                <div className="ml-auto pl-3">
                  <div className="-mx-1.5 -my-1.5">
                    <button
                      onClick={() => setSaveError(null)}
                      aria-label="Dismiss error"
                      className="inline-flex rounded-md bg-negative/10 p-1.5 text-negative hover:bg-negative/15"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="settings-actions">
            {isLoggedIn && !isAuthDisabled() && <button className="settings-logout" onClick={handleLogout}><LogOut size={16} /><span>Log out</span></button>}
            <button className="settings-cancel" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button className="settings-save" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><span className="settings-spinner" aria-hidden="true" /><span>Saving…</span></> : <><Save size={16} /><span>{restoreStaged ? 'Save restored network' : 'Save'}</span></>}
            </button>
          </div>

          {/* Version footer */}
          {versionInfo && (
            <div className="settings-version">
              <span>
                {versionInfo.tag ? (
                  <>{versionInfo.tag} <span className="text-muted">·</span> {versionInfo.sha}</>
                ) : (
                  versionInfo.sha
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {showClearNodesConfirm && <ConfirmDialog isOpen title="Clear all nodes?" message={`This removes all ${getAllNodes(config.tree.nodes).length} nodes from the configuration. Nothing changes until you save.`} confirmLabel="Clear all" cancelLabel="Cancel" variant="danger" onConfirm={() => { clearNodes(); setShowClearNodesConfirm(false); }} onCancel={() => setShowClearNodesConfirm(false)} />}
      {showRestoreConfirm && <ConfirmDialog isOpen title="Restore backup?" message={`Load ${pendingRestoreConfig ? getAllNodes(pendingRestoreConfig.tree.nodes).length : 0} nodes into Settings? Your current network stays unchanged until you save the restored configuration.`} confirmLabel="Restore backup" cancelLabel="Cancel" variant="danger" onConfirm={confirmRestore} onCancel={cancelRestore} />}
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
