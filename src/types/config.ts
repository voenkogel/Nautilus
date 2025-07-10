export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip?: string; // Optional IP address
  url?: string; // Optional URL
  icon?: string; // Optional icon name from lucide-react
  type?: 'square' | 'circular' | 'angular'; // Square (normal cards), circular (pill-shaped cards), or angular (diamond-sided cards)
  hasWebGui?: boolean; // Optional flag to indicate if the node has a web GUI
  children?: TreeNode[];
}

export interface ServerConfig {
  port: number;
  healthCheckInterval: number;
  corsOrigins: string[];
}

export interface ClientConfig {
  port: number;
  apiPollingInterval: number;
  host: string;
}

export interface AppearanceConfig {
  title: string;
  favicon?: string; // base64 encoded favicon
  logo?: string; // base64 encoded logo image (falls back to favicon if not set)
  accentColor: string;
  backgroundImage?: string; // base64 encoded background image
}

export interface AppConfig {
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
