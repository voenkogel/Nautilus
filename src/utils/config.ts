import configData from '../../config.json';
import type { TreeNode, AppConfig } from '../types/config';

const appConfig = configData as AppConfig;

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
