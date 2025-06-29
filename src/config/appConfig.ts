import configData from '../../config.json';

export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip: string;
  url: string;
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

// Centralized application configuration loaded from JSON
export const appConfig: AppConfig = configData as AppConfig;

// Helper function to extract all IPs from the tree
export function extractAllIPs(nodes: TreeNode[] = appConfig.tree.nodes): string[] {
  const ips: string[] = [];
  
  function traverse(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      ips.push(node.ip);
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(nodes);
  return ips;
}

// Helper function to get server URL for frontend
export function getServerUrl(port?: number): string {
  const serverPort = port || appConfig.server.port;
  return `http://${appConfig.client.host}:${serverPort}`;
}

export default appConfig;
