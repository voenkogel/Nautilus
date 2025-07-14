export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip?: string;
  url?: string;
  icon?: string; // Optional icon name from lucide-react
  type?: 'square' | 'circular' | 'angular';
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
  title: string;
  favicon?: string;
  accentColor: string;
  backgroundImage?: string;
}

export interface AppConfig {
  server: ServerConfig;
  client: ClientConfig;
  appearance: AppearanceConfig;
  tree: {
    nodes: TreeNode[];
  };
}
