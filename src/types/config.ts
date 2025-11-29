export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  
  // Separated concerns for better architecture
  internalAddress?: string; // Internal address for health checking (e.g. "192.168.1.100:8080")
  externalAddress?: string; // External address for user access (e.g. "https://myapp.com")
  
  // Legacy fields (kept for migration)
  ip?: string;          
  healthCheckPort?: number; 
  url?: string;         
  
  disableHealthCheck?: boolean; // Explicitly disable health checking even if port is provided
  disableEmbedded?: boolean; // Force opening in new tab instead of embedded iframe
  
  icon?: string; // Optional icon name from lucide-react
  type?: 'square' | 'circular' | 'angular'; // Square (normal cards), circular (pill-shaped cards), or angular (diamond-sided cards)
  
  children?: TreeNode[];
}

export interface ServerConfig {
  healthCheckInterval: number;
  corsOrigins: string[];
}

export interface ClientConfig {
  apiPollingInterval: number;
}


export interface AppearanceConfig {
  favicon?: string; // base64 encoded favicon
  logo?: string; // base64 encoded logo image (falls back to favicon if not set)
  accentColor: string;
  backgroundImage?: string; // base64 encoded background image
}

export interface GeneralConfig {
  title: string;
  openNodesAsOverlay: boolean;
}

export interface AppConfig {
  general: GeneralConfig;
  server: ServerConfig;
  client: ClientConfig;
  appearance: AppearanceConfig;
  tree: {
    nodes: TreeNode[];
  };
  webhooks?: WebhookSettings;
}

export interface NodeStatus {
  status: 'online' | 'offline' | 'checking';
  latency?: number;
  lastChecked: string;
}

export interface WebhookConfig {
  endpoint: string;
  notifyOffline: boolean;
  notifyOnline: boolean;
}

export interface WebhookSettings {
  statusNotifications: WebhookConfig;
}
