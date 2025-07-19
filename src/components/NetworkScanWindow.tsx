import React, { useState, useEffect, useRef } from 'react';
import type { TreeNode, AppConfig } from '../types/config';
import { getAuthHeaders } from '../utils/auth';
import ReactDOM from 'react-dom';

// Helper function to generate unique IDs for nodes
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Stepper Component
interface StepperProps {
  currentPhase: string;
  accentColor: string;
}

const Stepper: React.FC<StepperProps> = ({ currentPhase, accentColor }) => {
  const steps = [
    { id: 'ping', label: 'Discover Hosts', description: 'Finding active devices' },
    { id: 'port', label: 'Scan Ports', description: 'Identifying open ports' },
    { id: 'probe', label: 'Find Web GUIs', description: 'Detecting web interfaces' }
  ];

  const getStepStatus = (stepId: string) => {
    const stepIndex = steps.findIndex(step => step.id === stepId);
    const currentIndex = steps.findIndex(step => step.id === currentPhase);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="mb-6">
      <div className="flex items-center w-full">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center w-full">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                    status === 'completed'
                      ? 'border-green-500 bg-green-500 text-white'
                      : status === 'active'
                      ? 'border-2 text-white'
                      : 'border-gray-300 bg-gray-100 text-gray-400'
                  }`}
                  style={{
                    borderColor: status === 'active' ? accentColor : undefined,
                    backgroundColor: status === 'active' ? accentColor : undefined,
                  }}
                >
                  {status === 'completed' ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : status === 'active' ? (
                    <svg className="animate-spin w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-0" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v2a6 6 0 00-6 6H4z" />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <div className="text-center mt-2">
                  <div className={`text-sm font-semibold ${status === 'active' ? 'text-gray-800' : status === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
                    {step.label}
                  </div>
                  <div className={`text-xs ${status === 'active' ? 'text-gray-600' : 'text-gray-400'}`}>
                    {step.description}
                  </div>
                </div>
              </div>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-4 mt-5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      getStepStatus(steps[index + 1].id) === 'completed' || 
                      (getStepStatus(steps[index + 1].id) === 'active' && status === 'completed')
                        ? 'bg-green-500'
                        : getStepStatus(steps[index + 1].id) === 'active'
                        ? 'bg-gray-300'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      backgroundColor: getStepStatus(steps[index + 1].id) === 'active' && status === 'completed' ? accentColor : undefined
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ...existing state/utility declarations...
// Polling logic for scan progress
interface NetworkScanWindowProps {
  appConfig?: any;
  scanActive?: boolean;
  setScanActive?: (active: boolean) => void;
  initialProgress?: number;
  initialLogs?: string[];
}

const NetworkScanWindow: React.FC<NetworkScanWindowProps> = ({ appConfig, scanActive, setScanActive, initialProgress = 0, initialLogs = [] }) => {
  // --- State and handlers ---
  const [isScanning, setIsScanning] = useState(scanActive ?? false);
  const [logs, setLogs] = useState<string[]>(initialLogs);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(initialProgress);
  const [currentPhase, setCurrentPhase] = useState<string>('idle');
  const [showLogs, setShowLogs] = useState(false);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  
  // Scan results state
  const [scanCompleted, setScanCompleted] = useState(false);
  const [activeHosts, setActiveHosts] = useState<string[]>([]);
  const [openPorts, setOpenPorts] = useState<{[host: string]: string[]}>({});
  const [webGuis, setWebGuis] = useState<{[host: string]: {protocol: string, host: string, port: string, url: string, status?: number, reason?: string, title?: string}[]}>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'web-devices' | 'web' | 'devices' | 'all'>('web-devices');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  // Enhanced progress tracking for large subnets
  const [totalExpectedHosts, setTotalExpectedHosts] = useState<number>(0);
  const [totalHostsScanned, setTotalHostsScanned] = useState<number>(0);
  const [currentChunk, setCurrentChunk] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);

  // Effect to handle auto-selection when scan completes
  useEffect(() => {
    if (scanCompleted && Object.keys(webGuis).length > 0) {
      // Ensure we have a small delay for state stabilization
      setTimeout(() => {
        autoSelectItemsForFilter(filterMode);
      }, 100);
    }
  }, [scanCompleted, webGuis, filterMode]);
  useEffect(() => {
    (async () => {
      // const authenticated = await isAuthenticated();
      // Auth modal logic removed as unused
    })();
  }, []);
  const [ip, setIp] = useState(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    return lastSubnet.split('/')[0];
  });
  const [cidr, setCidr] = useState(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    return lastSubnet.split('/')[1] || '16';
  });
  const [ipError, setIpError] = useState<string | null>(null);
  const [cidrError, setCidrError] = useState<string | null>(null);
  const accentColor = appConfig?.appearance?.accentColor || '#3b82f6';
  const validateIp = (value: string): boolean => {
    return /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(value.trim());
  };
  const validateCidr = (value: string): boolean => {
    const num = Number(value);
    return /^\d{1,2}$/.test(value) && num >= 1 && num <= 32;
  };
  const estimateScanTime = (cidrValue: string): string => {
    if (!validateCidr(cidrValue)) return '';
    const cidrNum = parseInt(cidrValue, 10);
    const hosts = Math.max(2 ** (32 - cidrNum) - 2, 1);
    const seconds = Math.ceil(hosts / 20);
    if (seconds < 60) return '<1 min';
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
    return `${Math.ceil(seconds / 3600)} hr`;
  };
  const [scanEstimate, setScanEstimate] = useState<string>(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    const cidr = lastSubnet.split('/')[1] || '16';
    return estimateScanTime(cidr);
  });
  const handleIpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIp(value);
    if (!validateIp(value)) {
      setIpError('Invalid IPv4 address');
    } else {
      setIpError(null);
    }
  };
  const handleCidrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCidr(value);
    if (!validateCidr(value)) {
      setCidrError('CIDR must be between 1 and 32');
      setScanEstimate('');
    } else {
      setCidrError(null);
      setScanEstimate(estimateScanTime(value));
    }
  };
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof scanActive === 'boolean') {
      setIsScanning(scanActive);
      setShowLogs(scanActive); // Show logs if scan is active on mount/refresh
      
      // If scan is active on mount/refresh, immediately fetch current state
      if (scanActive) {
        const fetchCurrentState = async () => {
          try {
            const res = await fetch('/api/network-scan/progress', {
              headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
            if (typeof data.progress === 'number') setProgress(data.progress);
            if (data.currentPhase) setCurrentPhase(data.currentPhase);
            // Note: Don't process completion state here, let the polling handle that
          } catch (err) {
            console.warn('Failed to fetch initial scan state:', err);
          }
        };
        fetchCurrentState();
      }
    }
  }, [scanActive]);
  
  // Auto-scroll logs to bottom when new logs are added
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);
  
  useEffect(() => {
    // Start polling when scanning becomes active (handles both new scans and page refresh during active scan)
    if (isScanning) {
      pollProgress();
    } else {
      // Clean up polling when scanning stops
      stopPolling();
    }
    
    return () => {
      // Cleanup on unmount
      stopPolling();
    };
  }, [isScanning]);
  // Polling logic for scan progress
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef<boolean>(false);
  
  const pollProgress = async () => {
    // Prevent multiple polling loops
    if (isPollingRef.current) {
      return;
    }
    
    isPollingRef.current = true;
    
    const poll = async () => {
      try {
        const res = await fetch('/api/network-scan/progress', {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.logs) setLogs(data.logs);
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.currentPhase) setCurrentPhase(data.currentPhase);
        
        // Update enhanced progress tracking
        if (typeof data.totalExpectedHosts === 'number') setTotalExpectedHosts(data.totalExpectedHosts);
        if (typeof data.totalHostsScanned === 'number') setTotalHostsScanned(data.totalHostsScanned);
        if (typeof data.currentChunk === 'number') setCurrentChunk(data.currentChunk);
        if (typeof data.totalChunks === 'number') setTotalChunks(data.totalChunks);
        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          setIsScanning(false);
          isPollingRef.current = false;
          
          // If scan completed successfully, capture results and show post-scan interface
          if (data.status === 'completed') {
            setScanCompleted(true);
            setActiveHosts(data.activeHosts || []);
            setOpenPorts(data.openPorts || {});
            
            // Safely process webGuis data structure
            const safeWebGuis = data.webGuis || {};
            // Ensure each host's webGuis is an array
            const processedWebGuis: {[host: string]: {protocol: string, host: string, port: string, url: string, status?: number, reason?: string, title?: string}[]} = {};
            for (const [host, guis] of Object.entries(safeWebGuis)) {
              if (Array.isArray(guis)) {
                processedWebGuis[host] = guis;
              } else {
                console.warn(`Invalid webGuis data for host ${host}:`, guis);
                processedWebGuis[host] = [];
              }
            }
            setWebGuis(processedWebGuis);
            
            setLogsCollapsed(true); // Auto-collapse details
            // Initialize with recommended filter selection
            setFilterMode('web-devices');
            // Auto-selection will be handled by the useEffect when scan completes
          }
        }
      } catch (err) {
        setError('Error fetching scan progress.');
        setIsScanning(false);
        isPollingRef.current = false;
      }
      
      // Continue polling only if still scanning and polling is active
      if (isPollingRef.current) {
        pollingRef.current = setTimeout(poll, 2000);
      }
    };
    
    poll();
  };
  
  const stopPolling = () => {
    isPollingRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Helper functions for post-scan results
  const generateListItems = () => {
    const items: {id: string, label: string, type: 'device' | 'port' | 'web', hasEmbeddedGui?: boolean}[] = [];
    
    try {
      // First, analyze web interfaces by host to identify single GUI hosts
      const webInterfacesByHost = new Map<string, {protocol: string, host: string, port: string, url: string, status?: number, reason?: string, title?: string}[]>();
      
      for (const host of activeHosts) {
        const hostWebGuis = webGuis[host] || [];
        if (hostWebGuis.length > 0) {
          webInterfacesByHost.set(host, hostWebGuis);
        }
      }
      
      // Identify hosts with single GUIs that should be merged with devices
      const singleGuiHosts = new Set<string>();
      for (const [host, guis] of webInterfacesByHost.entries()) {
        if (guis.length === 1) {
          singleGuiHosts.add(host);
        }
      }
      
      for (const host of activeHosts) {
        const hostPorts = openPorts[host] || [];
        const hostWebGuis = webGuis[host] || [];
        
        // Always include the device itself
        // For single GUI hosts, mark as having embedded GUI for badge display
        const hasEmbeddedGui = singleGuiHosts.has(host);
        
        items.push({
          id: `device-${host}`,
          label: host,
          type: 'device',
          hasEmbeddedGui: hasEmbeddedGui
        });
        
        // Add ports
        for (const port of hostPorts) {
          items.push({
            id: `port-${host}-${port}`,
            label: `${host}:${port}`,
            type: 'port'
          });
        }
        
        // Add ALL web interfaces, including single GUIs for the web-only filter
        for (const webGui of hostWebGuis) {
          if (webGui && typeof webGui === 'object' && webGui.url) {
            const webId = `web-${webGui.url}`;
            if (!items.some(item => item.id === webId)) {
              // Use title with IP in brackets if available, otherwise fall back to URL
              let label;
              if (webGui.title && webGui.title.trim()) {
                label = `${webGui.title} (${host})`;
              } else {
                label = webGui.url;
              }
              
              items.push({
                id: webId,
                label: label,
                type: 'web'
              });
            }
          } else {
            console.warn('Invalid webGui object:', webGui);
          }
        }
      }
    } catch (error) {
      console.error('Error generating list items:', error);
    }
    
    return items;
  };

  const getFilteredItems = () => {
    const allItems = generateListItems();
    
    switch (filterMode) {
      case 'web-devices':
        // Web interfaces and devices (recommended) - includes web services and device IPs
        // For this mode, exclude single GUI web interfaces since they're embedded in devices
        return allItems.filter(item => {
          if (item.type === 'device') return true;
          if (item.type === 'web') {
            // Check if this web interface should be embedded (single GUI)
            const webUrl = item.id.replace('web-', '');
            const urlMatch = webUrl.match(/^https?:\/\/([^:]+):/);
            if (urlMatch) {
              const host = urlMatch[1];
              const hostWebGuis = webGuis[host] || [];
              // Only include web interfaces from hosts with multiple GUIs
              return hostWebGuis.length > 1;
            }
          }
          return false;
        });
      case 'web':
        // Web interfaces only - show ALL web interfaces including single GUIs
        return allItems.filter(item => item.type === 'web');
      case 'devices':
        // Devices only - exclude devices with embedded web GUIs (show only pure device IPs)
        return allItems.filter(item => {
          if (item.type === 'device') {
            // Only include devices that don't have embedded GUIs
            return !item.hasEmbeddedGui;
          }
          return false;
        });
      case 'all':
        // All open ports - includes everything but still respects embedding for web-devices
        return allItems.filter(item => {
          if (item.type === 'device' || item.type === 'port') return true;
          if (item.type === 'web') {
            // For 'all' mode, include all web interfaces regardless of embedding
            return true;
          }
          return false;
        });
      default:
        return allItems;
    }
  };

  // Helper function to auto-select items for a given filter mode
  const autoSelectItemsForFilter = (mode: 'web-devices' | 'web' | 'devices' | 'all') => {
    // Get the current filtered items based on the mode
    const allItems = generateListItems();
    let filteredItems: typeof allItems = [];
    
    switch (mode) {
      case 'web-devices':
        filteredItems = allItems.filter(item => {
          if (item.type === 'device') return true;
          if (item.type === 'web') {
            // Check if this web interface should be embedded (single GUI)
            const webUrl = item.id.replace('web-', '');
            const urlMatch = webUrl.match(/^https?:\/\/([^:]+):/);
            if (urlMatch) {
              const host = urlMatch[1];
              const hostWebGuis = webGuis[host] || [];
              // Only include web interfaces from hosts with multiple GUIs
              return hostWebGuis.length > 1;
            }
          }
          return false;
        });
        break;
      case 'web':
        filteredItems = allItems.filter(item => item.type === 'web');
        break;
      case 'devices':
        filteredItems = allItems.filter(item => {
          if (item.type === 'device') {
            // Only include devices that don't have embedded GUIs
            return !item.hasEmbeddedGui;
          }
          return false;
        });
        break;
      case 'all':
        filteredItems = allItems.filter(item => {
          if (item.type === 'device' || item.type === 'port') return true;
          if (item.type === 'web') {
            // For 'all' mode, include all web interfaces regardless of embedding
            return true;
          }
          return false;
        });
        break;
      default:
        filteredItems = allItems;
    }
    
    // Select all filtered items by default
    const newSelection = new Set(filteredItems.map(item => item.id));
    setSelectedItems(newSelection);
  };

  const handleFilterSelect = (mode: 'web-devices' | 'web' | 'devices' | 'all') => {
    setFilterMode(mode);
    // Use a small delay to ensure the filter mode state is updated
    setTimeout(() => {
      autoSelectItemsForFilter(mode);
    }, 50);
  };

  // Helper function to create nodes from selected items
  const createNodesFromSelection = (): TreeNode[] => {
    const selectedItemIds = Array.from(selectedItems);
    const nodes: TreeNode[] = [];
    const deviceMap = new Map<string, TreeNode>();

    // First pass: create device nodes for all unique host IPs
    const allHosts = new Set<string>();
    for (const itemId of selectedItemIds) {
      if (itemId.startsWith('device-')) {
        const host = itemId.replace('device-', '');
        allHosts.add(host);
      } else if (itemId.startsWith('port-')) {
        const match = itemId.match(/^port-([^-]+)-(.+)$/);
        if (match) allHosts.add(match[1]);
      } else if (itemId.startsWith('web-')) {
        const webUrl = itemId.replace('web-', '');
        const urlMatch = webUrl.match(/^https?:\/\/([^:]+):/);
        if (urlMatch) allHosts.add(urlMatch[1]);
      }
    }

    // Check for devices that should get embedded GUI
    const devicesWithEmbeddedGui = new Map<string, string>();
    
    // Look for devices that should have embedded GUIs based on filter mode and selection
    for (const host of allHosts) {
      const deviceSelected = selectedItemIds.some(id => id === `device-${host}`);
      
      if (deviceSelected) {
        const hostWebGuis = webGuis[host] || [];
        
        // If this host has exactly one web GUI, it should be embedded in the device
        if (hostWebGuis.length === 1 && hostWebGuis[0]?.url) {
          devicesWithEmbeddedGui.set(host, hostWebGuis[0].url);
        } 
        // Also handle the case where multiple GUIs exist but none are explicitly selected
        // (this can happen when filtering or bulk selecting)
        else if (hostWebGuis.length > 0) {
          const hasSelectedWebGuis = selectedItemIds.some(id => 
            id.startsWith('web-') && id.includes(`://${host}:`)
          );
          
          // If no web GUIs are explicitly selected for this host, 
          // and we're in a filter mode that hides them, embed the first one
          if (!hasSelectedWebGuis && filterMode === 'web-devices') {
            devicesWithEmbeddedGui.set(host, hostWebGuis[0].url);
          }
        }
      }
    }

    // Create device nodes for all hosts that have selected children
    for (const host of allHosts) {
      const embeddedGuiUrl = devicesWithEmbeddedGui.get(host);
      
      // For devices with embedded GUIs, try to use the GUI title as the device name
      let deviceTitle = `Device (${host})`;
      if (embeddedGuiUrl) {
        const hostWebGuis = webGuis[host] || [];
        const embeddedGui = hostWebGuis.find(gui => gui.url === embeddedGuiUrl);
        if (embeddedGui?.title) {
          deviceTitle = embeddedGui.title;
        }
      }
      
      const deviceNode: TreeNode = {
        id: `device-${host}-${generateUniqueId()}`,
        title: deviceTitle,
        subtitle: '',
        ip: host,
        icon: 'server',
        type: 'square', // Will be updated based on embedded GUI status
        children: []
      };
      
      // Set hasWebGui property and card type based on whether this device has an embedded GUI
      if (embeddedGuiUrl) {
        deviceNode.hasWebGui = true;
        deviceNode.type = 'square'; // Device-web combos get square cards
        // DO NOT set url field for auto-generated nodes - only ip field
        // url field is reserved for manually created/edited nodes
      } else {
        // Pure devices get square cards (keeping current behavior)
        deviceNode.hasWebGui = false;
        deviceNode.type = 'square';
      }
      
      deviceMap.set(host, deviceNode);
      nodes.push(deviceNode);
    }

    // Second pass: create port and web nodes and attach to parent devices
    for (const itemId of selectedItemIds) {
      if (itemId.startsWith('port-')) {
        const match = itemId.match(/^port-([^-]+)-(.+)$/);
        if (match) {
          const [, host, port] = match;
          const portNode: TreeNode = {
            id: `port-${host}-${port}-${generateUniqueId()}`,
            title: `Open Port (${host}:${port})`,
            subtitle: '',
            ip: `${host}:${port}`, // Include port in IP field for health checking
            icon: 'network',
            type: 'angular', // Port cards without web GUI get angular cards
            hasWebGui: false // Port nodes should not have web GUI status checking
          };

          // Always add as child to parent device
          const parentDevice = deviceMap.get(host);
          if (parentDevice) {
            parentDevice.children!.push(portNode);
          }
        }
      } else if (itemId.startsWith('web-')) {
        const webUrl = itemId.replace('web-', '');
        const urlMatch = webUrl.match(/^(https?):\/\/([^:]+):(\d+)$/);
        if (urlMatch) {
          const [, , host, port] = urlMatch;
          
          // Skip creating web node if this URL is already embedded in the parent device
          const parentDevice = deviceMap.get(host);
          const embeddedGuiUrl = devicesWithEmbeddedGui.get(host);
          if (parentDevice && parentDevice.hasWebGui && embeddedGuiUrl === webUrl) {
            // This web interface is already embedded in the parent device, skip creating separate node
            continue;
          }
          
          // Find the corresponding webGui data to get the title
          const hostWebGuis = webGuis[host] || [];
          const webGuiData = hostWebGuis.find(gui => gui.url === webUrl);
          const webTitle = webGuiData?.title;
          
          // Use title if available, otherwise default format
          const nodeTitle = webTitle ? webTitle : `Web Interface (${host}:${port})`;
          
          const webNode: TreeNode = {
            id: `web-${webUrl}-${generateUniqueId()}`,
            title: nodeTitle,
            subtitle: '',
            ip: `${host}:${port}`, // Include port in IP field for health checking
            // DO NOT set url field - it's reserved for manual nodes/proxies
            icon: 'globe',
            type: 'circular', // Web GUIs get circular cards
            hasWebGui: true // Web nodes should have web GUI status checking enabled
          };

          // Always add as child to parent device
          if (parentDevice) {
            parentDevice.children!.push(webNode);
            // Note: Do not set hasWebGui here - only devices with embedded GUIs should have it
          }
        }
      }
    }

    // Remove any devices that have no children and weren't explicitly selected
    const finalNodes = nodes.filter(node => {
      if (node.id.startsWith('device-')) {
        // Extract host from the new ID format: device-{host}-{uniqueId}
        // The unique ID is alphanumeric, so we need a more flexible regex
        const hostMatch = node.id.match(/^device-([^-]+(?:\.[^-]+)*)-[a-z0-9]+$/);
        if (hostMatch) {
          const host = hostMatch[1];
          // Check if there's a device selection for this host (simple format: device-{host})
          const wasExplicitlySelected = selectedItemIds.some(id => id === `device-${host}`);
          const hasChildren = node.children && node.children.length > 0;
          return wasExplicitlySelected || hasChildren;
        }
      }
      return true;
    });

    return finalNodes;
  };

  // Function to save nodes to config
  const handleConfirmSelection = async () => {
    try {
      // Create nodes from selection
      const newNodes = createNodesFromSelection();
      
      if (newNodes.length === 0) {
        setError('No valid nodes could be created from the current selection. Please check your selection and try again.');
        return;
      }
      
      if (newNodes.length === 0) {
        setError('No items selected to import. Please select at least one item from the list.');
        return;
      }

      // Get current config
      const response = await fetch('/api/config', {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error('Failed to fetch current configuration');
      }
      const currentConfig: AppConfig = await response.json();

      // Add new nodes to existing tree
      const updatedConfig = {
        ...currentConfig,
        tree: {
          ...currentConfig.tree,
          nodes: [...currentConfig.tree.nodes, ...newNodes]
        }
      };

      // Save updated config
      const saveResponse = await fetch('/api/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedConfig),
      });

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        if (saveResponse.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(`Failed to save configuration: ${errorText}`);
      }

      // Close the scan window and notify parent
      if (setScanActive) setScanActive(false);
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('closeScanWindow'));
        // Trigger config reload to refresh the canvas
        window.dispatchEvent(new CustomEvent('configUpdated'));
        // Also trigger canvas refresh specifically
        window.dispatchEvent(new CustomEvent('refreshCanvas'));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import selected items');
    }
  };

  const handleCancelWithConfirm = () => {
    if (scanCompleted) {
      setShowCancelConfirm(true);
    } else {
      // Normal cancel behavior when not in results view
      setShowLogs(false);
      setLogs([]);
      setProgress(0);
      setCurrentPhase('idle');
      setLogsCollapsed(false);
      
      // Reset enhanced progress tracking state
      setTotalExpectedHosts(0);
      setTotalHostsScanned(0);
      setCurrentChunk(0);
      setTotalChunks(0);
      
      if (setScanActive) setScanActive(false);
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('closeScanWindow'));
      }
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };
  // Handler to start scan
  const handleStartScan = async () => {
    if (!validateIp(ip) || !validateCidr(cidr)) {
      setError('Please enter a valid IP and CIDR before scanning.');
      return;
    }
    setError(null);
    setIsScanning(true);
    setCurrentPhase('ping');
    if (setScanActive) setScanActive(true);
    setLogs(["Scan started..."]);
    setShowLogs(true);
    
    // Reset enhanced progress tracking state
    setTotalExpectedHosts(0);
    setTotalHostsScanned(0);
    setCurrentChunk(0);
    setTotalChunks(0);
    
    // Store the subnet for next time
    const subnet = `${ip}/${cidr}`;
    localStorage.setItem('lastSubnet', subnet);
    
    try {
      await fetch('/api/network-scan/start', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ subnet }),
      });
    } catch (err) {
      setError('Failed to start scan.');
      setIsScanning(false);
      setShowLogs(false);
      return;
    }
    // Polling will be started automatically by the useEffect when isScanning becomes true
  };
  // ...existing code...
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl p-8 relative" style={{ zIndex: 1001 }}>
        <p>
          Scan your local network to discover devices and populate nodes. This process uses nmap and may take a few minutes depending on network size.
        </p>
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Subnet to scan</label>
          <div className="flex items-center gap-2">
            <input
              id="ip-input"
              type="text"
              className={`border rounded px-3 py-2 text-sm flex-1 ${
                ipError ? 'border-red-400' : 'border-gray-300'
              } ${isScanning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
              value={ip}
              onChange={handleIpChange}
              disabled={isScanning}
              placeholder="IPv4 address (e.g. 10.20.148.0)"
              style={{ '--accent-color': accentColor } as React.CSSProperties}
            />
            <span className="text-gray-500">/</span>
            <input
              id="cidr-input"
              type="text"
              className={`border rounded px-3 py-2 text-sm w-20 text-center ${
                cidrError ? 'border-red-400' : 'border-gray-300'
              } ${isScanning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
              value={cidr}
              onChange={handleCidrChange}
              disabled={isScanning}
              placeholder="CIDR"
              style={{ '--accent-color': accentColor } as React.CSSProperties}
            />
          </div>
          <div className="flex gap-2 mt-1">
            {ipError && <div className="text-xs text-red-600">{ipError}</div>}
            {cidrError && <div className="text-xs text-red-600">{cidrError}</div>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Enter a valid IPv4 address and CIDR size (e.g. 10.20.148.0 / 16). This determines the range of IP addresses to scan.
          </div>
        </div>
        
        {/* Stepper - only show when scanning */}
        {isScanning && (
          <Stepper currentPhase={currentPhase} accentColor={accentColor} />
        )}

        {/* Progress Bar - only show when scanning */}
        {isScanning && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Progress</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{progress}%</span>
                {totalExpectedHosts > 0 && (
                  <span className="text-xs text-gray-500">
                    ({totalHostsScanned.toLocaleString()}/{totalExpectedHosts.toLocaleString()} hosts)
                  </span>
                )}
                {totalChunks > 1 && (
                  <span className="text-xs text-gray-500">
                    • Chunk {currentChunk}/{totalChunks}
                  </span>
                )}
              </div>
            </div>
            <div className="w-full h-5 rounded bg-gray-200 overflow-hidden relative shadow-sm">
              <div
                className="h-full transition-all duration-500 rounded"
                style={{
                  width: `${progress}%`,
                  backgroundColor: accentColor,
                }}
              />
              {totalChunks > 1 && (
                <div className="absolute inset-0 flex">
                  {Array.from({ length: totalChunks }, (_, i) => (
                    <div
                      key={i}
                      className="flex-1 border-r border-white border-opacity-30 last:border-r-0"
                      style={{ opacity: i < currentChunk ? 1 : 0.3 }}
                    />
                  ))}
                </div>
              )}
            </div>
            {totalExpectedHosts > 4096 && (
              <div className="text-xs text-gray-500 mt-1">
                Large subnet detected - progress shows overall completion across all chunks
              </div>
            )}
          </div>
        )}

        {/* Logs Section - collapsible */}
        {showLogs && (
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full p-3 bg-gray-100 rounded-t border border-gray-200 hover:bg-gray-200 transition-colors duration-200"
              onClick={() => setLogsCollapsed(!logsCollapsed)}
            >
              <span className="text-sm font-semibold text-gray-700">Details</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${logsCollapsed ? '-rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!logsCollapsed && (
              <div
                className="bg-gray-100 rounded-b p-3 h-48 overflow-y-auto text-xs font-mono border-l border-r border-b border-gray-200"
                ref={logRef}
              >
                {logs.length === 0 && (
                  <span className="text-gray-400">No logs yet...</span>
                )}
                {logs.map((log, idx) => (
                  <div key={idx} className="text-gray-600 leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Post-Scan Results Interface */}
        {scanCompleted && (
          <div className="mb-4">
            {/* Selection Summary */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-semibold text-blue-800 mb-1">
                Scan Results Summary
              </div>
              <div className="text-xs text-blue-700">
                Found: {activeHosts.length} device(s), {Object.values(openPorts).reduce((total, ports) => total + ports.length, 0)} open port(s), {Object.values(webGuis).reduce((total, guis) => total + guis.length, 0)} web service(s)
              </div>
              <div className="text-xs text-blue-700 mt-1">
                Selected: <span className="font-semibold" style={{ color: accentColor }}>{selectedItems.size} item(s)</span> ready to import
              </div>
            </div>

            {/* Filter Dropdown */}
            <div className="mb-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">Select items to import:</div>
              <div className="relative">
                <select
                  value={filterMode}
                  onChange={(e) => handleFilterSelect(e.target.value as 'web-devices' | 'web' | 'devices' | 'all')}
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 appearance-none cursor-pointer"
                  style={{ 
                    backgroundImage: "url('data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%236b7280%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e')",
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="web-devices">🌐 Web Interfaces & Devices (recommended)</option>
                  <option value="web">🌐 Web Interfaces Only</option>
                  <option value="devices">💻 Devices Only</option>
                  <option value="all">📋 All Open Ports</option>
                </select>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {filterMode === 'web-devices' && 'Shows devices and web services. Devices with single web interfaces will have them embedded.'}
                {filterMode === 'web' && 'Shows only discovered web interfaces and services.'}
                {filterMode === 'devices' && 'Shows only device IP addresses.'}
                {filterMode === 'all' && 'Shows all discovered devices, ports, and web services.'}
              </div>
            </div>

            {/* Results List */}
            <div className="border border-gray-200 rounded max-h-64 overflow-y-auto">
              {getFilteredItems().map((item) => (
                <div
                  key={item.id}
                  className="flex items-center p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleItemSelection(item.id)}
                >
                  <div className="flex items-center">
                    {/* Checkbox */}
                    <div
                      className={`w-4 h-4 border-2 rounded mr-3 flex items-center justify-center transition-colors ${
                        selectedItems.has(item.id)
                          ? 'border-transparent text-white'
                          : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: selectedItems.has(item.id) ? accentColor : 'transparent' }}
                    >
                      {selectedItems.has(item.id) && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Item Label */}
                    <span className="text-sm text-gray-700">{item.label}</span>
                    
                    {/* Item Type Badge */}
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${
                      item.type === 'web' ? 'bg-green-100 text-green-700' :
                      item.type === 'port' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {item.type === 'web' ? 'Web' : item.type === 'port' ? 'Port' : 'Device'}
                    </span>
                    
                    {/* Additional Web Badge for devices with embedded GUI */}
                    {item.type === 'device' && item.hasEmbeddedGui && (
                      <span className="ml-1 px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                        Web
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {getFilteredItems().length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No items match the current filter
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</div>}

        {/* Time Estimation - properly positioned above buttons */}
        {!isScanning && !scanCompleted && scanEstimate && (
          <div className="mb-2 flex justify-end">
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Est. time:</span>{' '}
              <span style={{ color: accentColor }}>{scanEstimate}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end items-center gap-2">
          {isScanning && (
            <button
              className="px-6 py-2 rounded font-semibold text-white shadow bg-red-600 hover:bg-red-700 transition-all duration-200 focus:outline-none"
              onClick={async () => {
                try {
                  await fetch('/api/network-scan/cancel', { 
                    method: 'POST',
                    headers: getAuthHeaders()
                  });
                  setIsScanning(false);
                  setShowLogs(false);
                  if (setScanActive) setScanActive(false);
                } catch (err) {
                  setError('Failed to cancel scan.');
                }
              }}
            >
              Cancel
            </button>
          )}
          {!isScanning && scanCompleted && (
            <>
              <button
                className="px-6 py-2 rounded font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 shadow transition-all duration-200 focus:outline-none mr-2"
                onClick={handleCancelWithConfirm}
              >
                Cancel
              </button>
              <button
                className={`px-6 py-2 rounded font-semibold text-white shadow transition-all duration-200 focus:outline-none ${
                  selectedItems.size === 0 ? 'bg-gray-400 cursor-not-allowed' : ''
                }`}
                style={{ backgroundColor: selectedItems.size === 0 ? undefined : accentColor }}
                onClick={handleConfirmSelection}
                disabled={selectedItems.size === 0}
                title={selectedItems.size === 0 ? 'Please select at least one item to import' : `Import ${selectedItems.size} selected item(s)`}
              >
                Confirm ({selectedItems.size})
              </button>
            </>
          )}
          {!isScanning && !scanCompleted && (
            <>
              <button
                className="px-6 py-2 rounded font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 shadow transition-all duration-200 focus:outline-none mr-2"
                onClick={() => {
                  setShowLogs(false);
                  setLogs([]);
                  setProgress(0);
                  setCurrentPhase('idle');
                  setLogsCollapsed(false);
                  if (setScanActive) setScanActive(false);
                  // Also close the scan window in parent
                  if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('closeScanWindow'));
                  }
                }}
              >
                Close
              </button>
              <button
                className={`px-6 py-2 rounded font-semibold text-white shadow transition-all duration-200 focus:outline-none ${
                  ipError || cidrError ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
                style={{ backgroundColor: ipError || cidrError ? undefined : accentColor }}
                onClick={handleStartScan}
                disabled={!!ipError || !!cidrError}
              >
                Start Scan
              </button>
            </>
          )}
        </div>

        {/* Cancel Confirmation Dialog */}
        {showCancelConfirm && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1002]"
            onClick={() => setShowCancelConfirm(false)}
          >
            <div 
              className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Discard Scan Results?
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to cancel? All scan results will be lost and cannot be recovered.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded font-medium transition-colors"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep Results
                </button>
                <button
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded font-medium transition-colors"
                  onClick={() => {
                    // Reset to initial state and close
                    setScanCompleted(false);
                    setActiveHosts([]);
                    setOpenPorts({});
                    setWebGuis({});
                    setSelectedItems(new Set());
                    setFilterMode('web-devices');
                    setShowLogs(false);
                    setLogs([]);
                    setProgress(0);
                    setCurrentPhase('idle');
                    setLogsCollapsed(false);
                    setShowCancelConfirm(false);
                    
                    // Reset enhanced progress tracking state
                    setTotalExpectedHosts(0);
                    setTotalHostsScanned(0);
                    setCurrentChunk(0);
                    setTotalChunks(0);
                    
                    if (setScanActive) setScanActive(false);
                    if (typeof window !== 'undefined' && window.dispatchEvent) {
                      window.dispatchEvent(new CustomEvent('closeScanWindow'));
                    }
                  }}
                >
                  Discard Results
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
export default NetworkScanWindow;
