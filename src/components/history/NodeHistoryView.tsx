import React from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { useNodeHistory, type HistoryRange } from '../../hooks/useStatusHistory';
import { computeStats, getTransitions, formatShortDate, formatTimestamp } from './historyUtils';
import {
  Spinner,
  EmptyHistory,
  UptimeRing,
  StatCard,
  UptimeTimeline,
  ResponseSparkline,
} from './historyCharts';

export const NodeHistoryView: React.FC<{
  nodeId: string;
  period: HistoryRange;
  accentColor: string;
}> = ({ nodeId, period, accentColor }) => {
  const { data, loading, error } = useNodeHistory(nodeId, period);

  if (loading) return <Spinner />;
  if (error)   return <div className="text-center text-negative text-sm py-12">Error: {error}</div>;
  if (!data || data.records.length === 0) return <EmptyHistory />;

  const stats       = computeStats(data.records);
  const transitions = getTransitions(data.records);

  return (
    <div className="node-history-report">
      {/* Stats */}
      <div className="node-history-summary">
        {/* Uptime ring — prominent visual */}
        <div className="bg-abyss rounded-xl p-3 flex-shrink-0 flex items-center justify-center">
          <UptimeRing pct={stats.uptimePercent} />
        </div>
        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          <StatCard
            label="Outages"
            value={String(stats.outageCount)}
            colorClass={stats.outageCount > 0 ? 'text-negative' : 'text-positive'}
            icon={<AlertCircle className="w-3 h-3" />}
          />
          <StatCard
            label="Avg Response"
            value={stats.avgResponseTime !== null ? `${stats.avgResponseTime}ms` : '—'}
            colorClass="text-ink"
            icon={<TrendingUp className="w-3 h-3" />}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="history-chart-panel availability-panel">
        <h4 className="text-sm font-medium text-ink mb-2 font-roboto">
          Availability
        </h4>
        <UptimeTimeline records={data.records} sinceMs={data.sinceMs} nowMs={data.nowMs} />
        <div className="flex justify-between text-[10px] text-muted mt-1.5 font-roboto">
          <span>{formatShortDate(data.sinceMs)}</span>
          <span>{data.period === 'custom' ? formatShortDate(data.nowMs) : 'Now'}</span>
        </div>
      </div>

      {/* Response time sparkline */}
      <div className="history-chart-panel response-panel">
        <h4 className="text-sm font-medium text-ink mb-2 font-roboto">
          Response Time
        </h4>
        <ResponseSparkline records={data.records} accentColor={accentColor} />
      </div>

      {/* Events log */}
      <div className="history-events">
        <h4 className="text-sm font-medium text-ink mb-3 font-roboto">
          Events
        </h4>
        {transitions.length === 0 ? (
          <p className="text-sm text-muted text-center py-4 font-roboto">
            No status changes in this period
          </p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {transitions.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-abyss transition-colors"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    t.status === 'online' ? 'bg-green-500' : t.status === 'backup' ? 'bg-violet-500' : 'bg-red-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-sm font-semibold capitalize font-roboto ${
                        t.status === 'online' ? 'text-positive' : t.status === 'backup' ? 'text-violet-700' : 'text-negative'
                      }`}
                    >
                      {t.status === 'backup' ? 'Entered backup' : `Went ${t.status}`}
                    </span>
                    <span className="text-xs text-muted font-roboto">
                      {formatTimestamp(t.timestamp)}
                    </span>
                  </div>
                  {t.error && (
                    <div className="text-xs text-negative mt-0.5 truncate font-roboto">{t.error}</div>
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

export default NodeHistoryView;
