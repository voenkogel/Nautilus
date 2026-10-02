import { useState, useEffect } from 'react';
import { api } from '../utils/apiClient';

export interface HistoryRecord {
  status: 'online' | 'offline' | 'checking' | 'backup';
  timestamp: number;
  responseTime: number | null;
  error: string | null;
  playersOnline: number | null;
  playersMax: number | null;
  streams: number | null;
}

export type HistoryPeriod = '1h' | '24h' | '7d' | '30d';

/** A preset ending now, or a custom window in epoch ms (end exclusive). */
export type HistoryRange = HistoryPeriod | { from: number; to: number };

export function isCustomRange(range: HistoryRange): range is { from: number; to: number } {
  return typeof range === 'object';
}

function rangeQuery(range: HistoryRange): string {
  return isCustomRange(range)
    ? `from=${Math.round(range.from)}&to=${Math.round(range.to)}`
    : `period=${range}`;
}

export interface NodeHistoryData {
  nodeId: string;
  records: HistoryRecord[];
  period: HistoryPeriod | 'custom';
  sinceMs: number;
  nowMs: number;
}

export type TimelineBucket = 'online' | 'offline' | 'checking' | 'backup' | 'empty';

export interface HistoryStats {
  uptimePercent: number | null;
  outageCount: number;
  avgResponseTime: number | null;
}

/** Server-side summary of one node's history (see server/utils/historySummary.js). */
export interface NodeHistorySummary {
  buckets: TimelineBucket[];
  recordCount: number;
  stats: HistoryStats;
}

export interface GlobalHistoryData {
  nodes: Record<string, NodeHistorySummary>;
  summary: HistoryStats;
  period: HistoryPeriod | 'custom';
  sinceMs: number;
  nowMs: number;
}

export function useNodeHistory(nodeId: string | null, range: HistoryRange) {
  const query = rangeQuery(range);
  const [data, setData]       = useState<NodeHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) { setData(null); return; }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get<NodeHistoryData>(`api/history/${encodeURIComponent(nodeId)}?${query}`, { signal: controller.signal })
      .then((d) => { setData(d); setLoading(false); })
      .catch(err => {
        // Ignore the abort fired when nodeId/period changes mid-flight — a newer
        // request has superseded this one.
        if (controller.signal.aborted) return;
        setError(err.message); setLoading(false);
      });

    // Abort the in-flight request when the inputs change so a slow earlier
    // response can't resolve after a newer one and render stale data.
    return () => controller.abort();
  }, [nodeId, query]);

  return { data, loading, error };
}

export function useGlobalHistory(range: HistoryRange) {
  const query = rangeQuery(range);
  const [data, setData]       = useState<GlobalHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get<GlobalHistoryData>(`api/history?${query}`, { signal: controller.signal })
      .then((d) => { setData(d); setLoading(false); })
      .catch(err => {
        // Ignore the abort fired when `period` changes mid-flight.
        if (controller.signal.aborted) return;
        setError(err.message); setLoading(false);
      });

    // Abort the in-flight request on period change so a slow earlier response
    // can't overwrite a newer one (last-write-wins stale render).
    return () => controller.abort();
  }, [query]);

  return { data, loading, error };
}
