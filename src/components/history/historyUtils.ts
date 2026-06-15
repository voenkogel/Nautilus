import type { HistoryRecord, HistoryPeriod } from '../../hooks/useStatusHistory';

// --- Formatting ---

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// --- Stats ---

export function computeStats(records: HistoryRecord[]) {
  const checked = records.filter(r => r.status !== 'checking');
  if (checked.length === 0) return { uptimePercent: null, outageCount: 0, avgResponseTime: null };

  const online = checked.filter(r => r.status === 'online').length;
  const uptimePercent = (online / checked.length) * 100;

  let outageCount = 0;
  let prev: string | null = null;
  checked.forEach(r => {
    if (prev === 'online' && r.status === 'offline') outageCount++;
    prev = r.status;
  });

  const times = records.filter(r => r.responseTime != null && r.status === 'online').map(r => r.responseTime!);
  const avgResponseTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  return { uptimePercent, outageCount, avgResponseTime };
}

export function getTransitions(records: HistoryRecord[]) {
  const out: Array<{ status: string; timestamp: number; error: string | null }> = [];
  let prev: string | null = null;
  records.forEach(r => {
    if (r.status !== 'checking' && r.status !== prev) {
      out.push({ status: r.status, timestamp: r.timestamp, error: r.error });
      prev = r.status;
    }
  });
  return out.reverse();
}

export function uptimeColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 99) return 'text-green-600';
  if (pct >= 95) return 'text-yellow-600';
  return 'text-red-600';
}

// --- Constants ---

export const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '1h',  label: '1h'  },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
];

export const BUCKETS = 160;
