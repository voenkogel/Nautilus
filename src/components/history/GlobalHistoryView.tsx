import React, { useMemo } from 'react';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { AppConfig } from '../../types/config';
import { useGlobalHistory, type HistoryPeriod } from '../../hooks/useStatusHistory';
import { getAllNodes, isNodeMonitored } from '../../utils/nodeUtils';
import { computeStats, uptimeColor, formatShortDate } from './historyUtils';
import { Spinner, StatCard, UptimeTimeline } from './historyCharts';
import { statusColors } from '../../utils/colors';

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

  // Aggregate once per data change rather than on every render. Tooltip hovers
  // and parent re-renders were re-flattening + re-reducing the whole dataset and
  // re-running computeStats for every node row each time.
  const globalStats = useMemo(
    () => computeStats(data ? Object.values(data.records).flat() : []),
    [data]
  );
  const nodeStats = useMemo(() => {
    const stats = new Map<string, ReturnType<typeof computeStats>>();
    monitoredNodes.forEach(node => {
      stats.set(node.id, computeStats(data?.records[node.id] || []));
    });
    return stats;
  }, [monitoredNodes, data]);

  if (loading) return <Spinner />;
  if (error)   return <div className="text-center text-negative text-sm py-12">Error: {error}</div>;
  if (monitoredNodes.length === 0) {
    return <div className="text-center text-muted text-sm py-12">No monitored nodes configured.</div>;
  }

  return (
    <div className="history-overview">
      {/* Global stats */}
      <div className="history-summary">
        <StatCard
          label="Avg Uptime"
          value={globalStats.uptimePercent !== null ? `${globalStats.uptimePercent.toFixed(1)}%` : '—'}
          colorClass={uptimeColor(globalStats.uptimePercent)}
          icon={<CheckCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Total Outages"
          value={String(globalStats.outageCount)}
          colorClass={globalStats.outageCount > 0 ? 'text-negative' : 'text-positive'}
          icon={<AlertCircle className="w-3 h-3" />}
        />
        <StatCard
          label="Avg Response"
          value={globalStats.avgResponseTime !== null ? `${globalStats.avgResponseTime}ms` : '—'}
          colorClass="text-ink"
          icon={<TrendingUp className="w-3 h-3" />}
        />
      </div>

      <section className="availability-ledger"><div className="ledger-heading"><h3>Service availability</h3><span>{data ? formatShortDate(data.sinceMs) : 'Period start'} — Now</span></div>
      <div className="ledger-columns"><span>Service</span><span>Availability over time</span><span>Uptime</span></div>
      <div>
        {monitoredNodes.map(node => {
          const nodeId = node.id;

          const nodeRecords = data?.records[nodeId] || [];
          const stats       = nodeStats.get(nodeId)!;

          return (
            <div
              key={node.id}
              className="ledger-row group" role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectNode(nodeId, node.title); } }}
              onClick={() => onSelectNode(nodeId, node.title)}
              title={`View ${node.title} history`}
            >
              {/* Node name */}
              <div className="ledger-name">
                {node.title}<small>{stats.outageCount ? `${stats.outageCount} ${stats.outageCount === 1 ? 'outage' : 'outages'}` : nodeRecords.length ? 'No outages recorded' : 'Awaiting readings'}</small>
              </div>

              {/* Timeline */}
              <div className="flex-1 min-w-0">
                {nodeRecords.length > 0 && data ? (
                  <UptimeTimeline records={nodeRecords} sinceMs={data.sinceMs} nowMs={data.nowMs} />
                ) : (
                  <div className="h-9 bg-raised rounded-lg flex items-center justify-center text-[10px] text-muted font-roboto">
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
                className="w-4 h-4 text-muted group-hover:text-blue-400 transition-colors flex-shrink-0"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          );
        })}
      </div>

      </section>
      {/* Legend */}
      <div className="flex items-center gap-4 pt-1">
        {[
          { color: statusColors.online, label: 'Online' },
          { color: statusColors.offline, label: 'Offline' },
          { color: statusColors.backup, label: 'Backup' },
          { color: '#263e4b', label: 'No data' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-muted font-roboto">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
        <span className="text-[10px] text-muted font-roboto ml-auto">
          Click a row to drill in
        </span>
      </div>
    </div>
  );
};

export default GlobalHistoryView;
