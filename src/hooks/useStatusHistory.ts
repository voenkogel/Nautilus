import { useState, useEffect } from 'react';
import { api } from '../utils/apiClient';

export interface HistoryRecord {
  status: 'online' | 'offline' | 'checking';
  timestamp: number;
  responseTime: number | null;
  error: string | null;
  playersOnline: number | null;
  playersMax: number | null;
  streams: number | null;
}

export type HistoryPeriod = '1h' | '24h' | '7d' | '30d';

export interface NodeHistoryData {
  nodeId: string;
  records: HistoryRecord[];
  period: HistoryPeriod;
  sinceMs: number;
  nowMs: number;
}

export interface GlobalHistoryData {
  records: Record<string, HistoryRecord[]>;
  period: HistoryPeriod;
  sinceMs: number;
  nowMs: number;
}

export function useNodeHistory(nodeId: string | null, period: HistoryPeriod) {
  const [data, setData]       = useState<NodeHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) { setData(null); return; }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get<NodeHistoryData>(`/api/history/${encodeURIComponent(nodeId)}?period=${period}`, { signal: controller.signal })
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
  }, [nodeId, period]);

  return { data, loading, error };
}

export function useGlobalHistory(period: HistoryPeriod) {
  const [data, setData]       = useState<GlobalHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get<GlobalHistoryData>(`/api/history?period=${period}`, { signal: controller.signal })
      .then((d) => { setData(d); setLoading(false); })
      .catch(err => {
        // Ignore the abort fired when `period` changes mid-flight.
        if (controller.signal.aborted) return;
        setError(err.message); setLoading(false);
      });

    // Abort the in-flight request on period change so a slow earlier response
    // can't overwrite a newer one (last-write-wins stale render).
    return () => controller.abort();
  }, [period]);

  return { data, loading, error };
}
