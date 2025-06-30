export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip?: string; // Optional IP address
  url?: string; // Optional URL
  icon?: string; // Optional icon name from lucide-react
  type?: 'square' | 'circular' | 'angular'; // Square (normal cards), circular (pill-shaped cards), or angular (diamond-sided cards)
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
}
