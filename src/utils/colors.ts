import type { NodeStatus } from '../types/config';

// Semantic status color tokens — single source of truth for the status hex
// values that were previously duplicated inline across components.
export const statusColors = {
  online: '#10b981',
  offline: '#ef4444',
  checking: '#3b82f6',
  backup: '#8b5cf6',
  neutral: '#6b7280',
} as const;

// Human-readable status labels — single source for the display strings so the
// raw enum value ('backup') isn't shown to users.
export const statusLabels: Record<NonNullable<NodeStatus['status']>, string> = {
  online: 'online',
  offline: 'offline',
  checking: 'checking',
  backup: 'backing up',
};

/**
 * Resolves the indicator color for a node's status.
 * Returns the neutral color when the node isn't monitored or has no status.
 */
export const getStatusColor = (
  status: NodeStatus | undefined,
  isMonitored: boolean
): string => {
  if (!status || !isMonitored) return statusColors.neutral;
  switch (status.status) {
    case 'online':
      return statusColors.online;
    case 'offline':
      return statusColors.offline;
    case 'checking':
      return statusColors.checking;
    case 'backup':
      return statusColors.backup;
    default:
      return statusColors.neutral;
  }
};
