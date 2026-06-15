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

    setLoading(true);
    setError(null);

    api.get<NodeHistoryData>(`/api/history/${encodeURIComponent(nodeId)}?period=${period}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [nodeId, period]);

  return { data, loading, error };
}

export function useGlobalHistory(period: HistoryPeriod) {
  const [data, setData]       = useState<GlobalHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api.get<GlobalHistoryData>(`/api/history?period=${period}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [period]);

  return { data, loading, error };
}
