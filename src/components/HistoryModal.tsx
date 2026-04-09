import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, ArrowLeft, Clock, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { AppConfig } from '../types/config';
import { getAllNodes, normalizeNodeIdentifier } from '../utils/nodeUtils';
import {
  useNodeHistory,
  useGlobalHistory,
  type HistoryRecord,
  type HistoryPeriod,
} from '../hooks/useStatusHistory';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function computeStats(records: HistoryRecord[]) {
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

function getTransitions(records: HistoryRecord[]) {
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

function uptimeColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 99) return 'text-green-600';
  if (pct >= 95) return 'text-yellow-600';
  return 'text-red-600';
}

// ─── Period selector ─────────────────────────────────────────────────────────

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '1h',  label: '1h'  },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
];

const PeriodPicker: React.FC<{ active: HistoryPeriod; onChange: (p: HistoryPeriod) => void }> = ({ active, onChange }) => (
  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
    {PERIODS.map(({ value, label }) => (
      <button
        key={value}
        onClick={() => onChange(value)}
        className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
          value === active
            ? 'bg-white shadow-sm text-gray-900'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

// ─── Uptime Timeline Bar ─────────────────────────────────────────────────────

const BUCKETS = 160;

const UptimeTimeline: React.FC<{
  records: HistoryRecord[];
  sinceMs: number;
  nowMs: number;
}> = ({ records, sinceMs, nowMs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ index: number; clientX: number; clientY: number } | null>(null);
  const bucketMs = (nowMs - sinceMs) / BUCKETS;

  const buckets = useMemo((): ('online' | 'offline' | 'checking' | 'empty')[] => {
    return Array.from({ length: BUCKETS }, (_, i) => {
      const start = sinceMs + i * bucketMs;
      const end   = start + bucketMs;
      const slice = records.filter(r => r.timestamp >= start && r.timestamp < end);
      if (slice.length === 0) return 'empty';
      if (slice.some(r => r.status === 'offline'))  return 'offline';
      if (slice.some(r => r.status === 'online'))   return 'online';
      return 'checking';
    });
  }, [records, sinceMs, nowMs, bucketMs]);

  const colorMap: Record<string, string> = {
    online:   '#10b981',
    offline:  '#ef4444',
    checking: '#9ca3af',
    empty:    '#e5e7eb',
  };

  const hovered = tooltip !== null ? buckets[tooltip.index] : null;

  return (
    <div className="relative select-none">
      <div
        ref={containerRef}
        className="flex gap-[2px] h-9 items-stretch rounded-lg overflow-hidden"
      >
        {buckets.map((status, i) => (
          <div
            key={i}
            className="flex-1 transition-opacity duration-100"
            style={{
              backgroundColor: colorMap[status],
              opacity: tooltip && tooltip.index !== i ? 0.65 : 1,
            }}
            onMouseEnter={e => setTooltip({ index: i, clientX: e.clientX, clientY: e.clientY })}
            onMouseMove={e  => setTooltip(t => t ? { ...t, clientX: e.clientX, clientY: e.clientY } : null)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[200] pointer-events-none px-3 py-2 bg-gray-900 text-white rounded-lg shadow-xl text-xs"
          style={{
            left: tooltip.clientX,
            top:  tooltip.clientY - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="flex items-center gap-1.5 font-medium capitalize">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colorMap[hovered!] }}
            />
            {hovered === 'empty' ? 'No data' : hovered}
          </div>
          <div className="text-gray-400 mt-0.5">
            {formatTimestamp(sinceMs + tooltip.index * bucketMs)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Response time sparkline ─────────────────────────────────────────────────

const ResponseSparkline: React.FC<{
  records: HistoryRecord[];
  accentColor: string;
}> = ({ records, accentColor }) => {
  const valid = records.filter(r => r.responseTime != null && r.status === 'online');

  if (valid.length < 3) {
    return (
      <div className="flex items-center justify-center h-16 text-gray-400 text-xs">
        Not enough data to plot
      </div>
    );
  }

  const times = valid.map(r => r.responseTime!);
  const maxT  = Math.max(...times);
  const minT  = Math.min(...times);
  const range = maxT - minT || 1;
  const avg   = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  const W = 1000;
  const H = 60;
  const pad = 6;

  const pts = valid.map((r, i) => {
    const x = (i / (valid.length - 1)) * W;
    const y = H - pad - ((r.responseTime! - minT) / range) * (H - pad * 2);
    return `${x},${y}`;
  });

  const linePoints = pts.join(' ');
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 60 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="rt-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={accentColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#rt-grad)" />
        <polyline
          points={linePoints}
          fill="none"
          stroke={accentColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-roboto">
        <span>min {minT}ms</span>
        <span>avg {avg}ms</span>
        <span>max {maxT}ms</span>
      </div>
    </div>
  );
};

// ─── Loading / Empty states ───────────────────────────────────────────────────

const Spinner: React.FC = () => (
  <div className="flex items-center justify-center h-52">
    <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

const EmptyHistory: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
    <Clock className="w-10 h-10 text-gray-200" />
    <p className="text-sm font-medium">No history yet</p>
    <p className="text-xs">Data appears after the first health check cycle</p>
  </div>
);

// ─── Stats row ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; colorClass: string; icon: React.ReactNode }> =
  ({ label, value, colorClass, icon }) => (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center gap-1">
      <div className={`text-xl font-bold font-roboto ${colorClass}`}>{value}</div>
      <div className="flex items-center gap-1 text-[11px] text-gray-500 font-roboto">
        {icon}
        {label}
      </div>
    </div>
  );

// ─── Node history view ────────────────────────────────────────────────────────

const NodeHistoryView: React.FC<{
  nodeId: string;
  period: HistoryPeriod;
  accentColor: string;
}> = ({ nodeId, period, accentColor }) => {
  const { data, loading, error } = useNodeHistory(nodeId, period);

  if (loading) return <Spinner />;
  if (error)   return <div className="text-center text-red-500 text-sm py-12">Error: {error}</div>;
  if (!data || data.records.length === 0) return <EmptyHistory />;

  const stats       = computeStats(data.records);
  const transitions = getTransitions(data.records);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Uptime"
          value={stats.uptimePercent !== null ? `${stats.uptimePercent.toFixed(2)}%` : '—'}
          colorClass={uptimeColor(stats.uptimePercent)}
          icon={<CheckCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Outages"
          value={String(stats.outageCount)}
          colorClass={stats.outageCount > 0 ? 'text-red-600' : 'text-green-600'}
          icon={<AlertCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Avg Response"
          value={stats.avgResponseTime !== null ? `${stats.avgResponseTime}ms` : '—'}
          colorClass="text-gray-700"
          icon={<TrendingUp className="w-3 h-3" />}
        />
      </div>

      {/* Timeline */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-roboto">
          Availability
        </h4>
        <UptimeTimeline records={data.records} sinceMs={data.sinceMs} nowMs={data.nowMs} />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 font-roboto">
          <span>{formatShortDate(data.sinceMs)}</span>
          <span>Now</span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          {[
            { color: '#10b981', label: 'Online' },
            { color: '#ef4444', label: 'Offline' },
            { color: '#e5e7eb', label: 'No data' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500 font-roboto">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Response time sparkline */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-roboto">
          Response Time
        </h4>
        <ResponseSparkline records={data.records} accentColor={accentColor} />
      </div>

      {/* Events log */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 font-roboto">
          Events
        </h4>
        {transitions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4 font-roboto">
            No status changes in this period
          </p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {transitions.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    t.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-sm font-semibold capitalize font-roboto ${
                        t.status === 'online' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      Went {t.status}
                    </span>
                    <span className="text-xs text-gray-400 font-roboto">
                      {formatTimestamp(t.timestamp)}
                    </span>
                  </div>
                  {t.error && (
                    <div className="text-xs text-red-500 mt-0.5 truncate font-roboto">{t.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Global history view ──────────────────────────────────────────────────────

const GlobalHistoryView: React.FC<{
  period: HistoryPeriod;
  appConfig: AppConfig;
  accentColor: string;
  onSelectNode: (nodeId: string, nodeName: string) => void;
}> = ({ period, appConfig, onSelectNode }) => {
  const { data, loading, error } = useGlobalHistory(period);

  const monitoredNodes = useMemo(() => {
    return getAllNodes(appConfig.tree.nodes).filter(
      n => (n.internalAddress || (n.ip && n.healthCheckPort)) && !n.disableHealthCheck
    );
  }, [appConfig.tree.nodes]);

  if (loading) return <Spinner />;
  if (error)   return <div className="text-center text-red-500 text-sm py-12">Error: {error}</div>;
  if (monitoredNodes.length === 0) {
    return <div className="text-center text-gray-400 text-sm py-12">No monitored nodes configured.</div>;
  }

  // Overall stats across all nodes
  const allRecords = data ? Object.values(data.records).flat() : [];
  const globalStats = computeStats(allRecords);

  return (
    <div className="space-y-5">
      {/* Global stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Avg Uptime"
          value={globalStats.uptimePercent !== null ? `${globalStats.uptimePercent.toFixed(1)}%` : '—'}
          colorClass={uptimeColor(globalStats.uptimePercent)}
          icon={<CheckCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Total Outages"
          value={String(globalStats.outageCount)}
          colorClass={globalStats.outageCount > 0 ? 'text-red-600' : 'text-green-600'}
          icon={<AlertCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Avg Response"
          value={globalStats.avgResponseTime !== null ? `${globalStats.avgResponseTime}ms` : '—'}
          colorClass="text-gray-700"
          icon={<TrendingUp className="w-3 h-3" />}
        />
      </div>

      {/* Time axis header */}
      {data && (
        <div className="flex justify-between text-[10px] text-gray-400 px-32 font-roboto">
          <span>{formatShortDate(data.sinceMs)}</span>
          <span>Now</span>
        </div>
      )}

      {/* Per-node timelines */}
      <div className="space-y-2">
        {monitoredNodes.map(node => {
          const rawId = node.internalAddress ||
            (node.ip && node.healthCheckPort ? `${node.ip}:${node.healthCheckPort}` : '');
          const nodeId = normalizeNodeIdentifier(rawId);
          if (!nodeId) return null;

          const nodeRecords = data?.records[nodeId] || [];
          const stats       = computeStats(nodeRecords);

          return (
            <div
              key={node.id}
              className="flex items-center gap-3 group cursor-pointer hover:bg-gray-50 rounded-xl px-3 py-2 transition-colors"
              onClick={() => onSelectNode(nodeId, node.title)}
              title={`View ${node.title} history`}
            >
              {/* Node name */}
              <div className="w-28 text-sm text-gray-700 font-medium truncate flex-shrink-0 group-hover:text-blue-600 transition-colors font-roboto">
                {node.title}
              </div>

              {/* Timeline */}
              <div className="flex-1 min-w-0">
                {nodeRecords.length > 0 && data ? (
                  <UptimeTimeline records={nodeRecords} sinceMs={data.sinceMs} nowMs={data.nowMs} />
                ) : (
                  <div className="h-9 bg-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-400 font-roboto">
                    No data
                  </div>
                )}
              </div>

              {/* Uptime % */}
              <div className="w-14 text-right flex-shrink-0">
                <span className={`text-sm font-semibold font-roboto ${uptimeColor(stats.uptimePercent)}`}>
                  {stats.uptimePercent !== null ? `${stats.uptimePercent.toFixed(1)}%` : '—'}
                </span>
              </div>

              {/* Arrow hint */}
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1">
        {[
          { color: '#10b981', label: 'Online' },
          { color: '#ef4444', label: 'Offline' },
          { color: '#e5e7eb', label: 'No data' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-400 font-roboto">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
        <span className="text-[10px] text-gray-400 font-roboto ml-auto">
          Click a row to drill in
        </span>
      </div>
    </div>
  );
};

// ─── Main HistoryModal ────────────────────────────────────────────────────────

export interface HistoryModalProps {
  /** Specific node identifier (normalized) — null for global view */
  nodeId: string | null;
  nodeName?: string;
  appConfig: AppConfig;
  onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ nodeId, nodeName, appConfig, onClose }) => {
  const [period, setPeriod] = useState<HistoryPeriod>('7d');
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  const accentColor  = appConfig.appearance?.accentColor || '#3b82f6';
  const isGlobal     = nodeId === null;
  const activeNodeId = drilldown?.id   ?? nodeId;
  const activeTitle  = drilldown?.name ?? nodeName ?? 'Node';
  const showingNode  = !isGlobal || drilldown !== null;

  // Reset drilldown when switching from global to specific node externally
  useEffect(() => { setDrilldown(null); }, [nodeId]);

  // ESC key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drilldown) setDrilldown(null);
      else onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, drilldown]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => { if (drilldown) setDrilldown(null); else onClose(); }}
      />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col animate-scale-in overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          {/* Back button (drilldown only) */}
          {drilldown && (
            <button
              onClick={() => setDrilldown(null)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Back to all nodes"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {/* Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            <Clock className="w-4 h-4" style={{ color: accentColor }} />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate font-roboto">
              {showingNode ? activeTitle : 'All Nodes'}
            </h2>
            <p className="text-[11px] text-gray-400 font-roboto">Status History</p>
          </div>

          {/* Period picker */}
          <PeriodPicker active={period} onChange={setPeriod} />

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {showingNode ? (
            <NodeHistoryView
              nodeId={activeNodeId!}
              period={period}
              accentColor={accentColor}
            />
          ) : (
            <GlobalHistoryView
              period={period}
              appConfig={appConfig}
              accentColor={accentColor}
              onSelectNode={(id, name) => setDrilldown({ id, name })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
