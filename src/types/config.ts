export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  
  // Separated concerns for better architecture
  ip?: string;          // IP address only (no port) - for display/identification
  healthCheckPort?: number; // Optional dedicated port for health checks
  disableHealthCheck?: boolean; // Explicitly disable health checking even if port is provided
  url?: string;         // External URL for user access (opening in browser)
  
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
