import type { TreeNode, NodeStatus } from '../types/config';
import { getAllNodes, isNodeMonitored, getNodeAddressDisplay, isStreamSource } from './nodeUtils.ts';

export type NetworkFilter = 'online' | 'offline' | 'checking' | 'backup' | 'unknown' | 'activity' | null;
export function activity(node: TreeNode, status?: NodeStatus) {
  if (!isNodeMonitored(node) || status?.status !== 'online') return { streams: 0, players: 0 };
  return {
    streams: isStreamSource(node) ? status.streams ?? 0 : 0,
    players: node.healthCheckType === 'minecraft' ? status.players?.online ?? 0 : 0,
  };
}
export function summarize(nodes: TreeNode[], statuses: Record<string, NodeStatus>) {
  const all = getAllNodes(nodes);
  const summary = { total: all.length, monitored: 0, online: 0, offline: 0, checking: 0, backup: 0, unknown: 0, streams: 0, players: 0 };
  all.forEach(n => {
    if (!isNodeMonitored(n)) return;
    summary.monitored++;
    const status = statuses[n.id];
    if (status) summary[status.status]++; else summary.unknown++;
    const counts = activity(n, status);
    summary.streams += counts.streams;
    summary.players += counts.players;
  });
  return summary;
}
export function matchesNode(node: TreeNode, statuses: Record<string, NodeStatus>, filter: NetworkFilter, query: string) {
  const text = `${node.title} ${node.subtitle} ${getNodeAddressDisplay(node) ?? ''} ${node.internalAddress === '********' ? '' : node.internalAddress ?? ''}`.toLowerCase();
  if (!text.includes(query.trim().toLowerCase())) return false;
  if (!filter) return true;
  if (!isNodeMonitored(node)) return false;
  if (filter === 'activity') {
    const counts = activity(node, statuses[node.id]);
    return counts.streams + counts.players > 0;
  }
  return (statuses[node.id]?.status ?? 'unknown') === filter;
}

export const healthStates = [
  { key: 'online', label: 'Online', color: '#68d6a5' },
  { key: 'offline', label: 'Offline', color: '#ff8d87' },
  { key: 'checking', label: 'Checking', color: '#ebc47f' },
  { key: 'backup', label: 'Backing up', color: '#b5a0f4' },
  { key: 'unknown', label: 'Awaiting readings', color: '#607c8c' },
] as const;

export function healthDescription(summary: ReturnType<typeof summarize>) {
  return healthStates.filter(state => summary[state.key] > 0).map(state => `${summary[state.key]} ${state.label.toLowerCase()}`).concat(summary.total > summary.monitored ? [`${summary.total - summary.monitored} unmonitored`] : []).join(', ') || 'No nodes';
}

