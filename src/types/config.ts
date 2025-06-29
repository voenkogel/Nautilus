export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip: string;
  url: string;
  icon?: string; // Optional icon name from lucide-react
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

export interface AppConfig {
  server: ServerConfig;
  client: ClientConfig;
  tree: {
    nodes: TreeNode[];
  };
}
