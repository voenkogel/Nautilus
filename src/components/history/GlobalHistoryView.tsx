import React, { useMemo } from 'react';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { AppConfig } from '../../types/config';
import { useGlobalHistory, type HistoryPeriod } from '../../hooks/useStatusHistory';
import { getAllNodes, isNodeMonitored } from '../../utils/nodeUtils';
import { computeStats, uptimeColor, formatShortDate } from './historyUtils';
import { Spinner, StatCard, UptimeTimeline } from './historyCharts';

export const GlobalHistoryView: React.FC<{
  period: HistoryPeriod;
  appConfig: AppConfig;
  accentColor: string;
  onSelectNode: (nodeId: string, nodeName: string) => void;
}> = ({ period, appConfig, onSelectNode }) => {
  const { data, loading, error } = useGlobalHistory(period);

  const monitoredNodes = useMemo(() => {
    return getAllNodes(appConfig.tree.nodes).filter(isNodeMonitored);
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
          const nodeId = node.id;

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

export default GlobalHistoryView;
