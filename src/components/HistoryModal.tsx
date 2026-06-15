import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Clock } from 'lucide-react';
import type { AppConfig } from '../types/config';
import type { HistoryPeriod } from '../hooks/useStatusHistory';
import { Modal } from './ui/Modal';
import { PeriodPicker } from './history/historyCharts';
import { NodeHistoryView } from './history/NodeHistoryView';
import { GlobalHistoryView } from './history/GlobalHistoryView';

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

  // Escape/backdrop: step out of a drilldown first, otherwise close the modal.
  const handleClose = () => {
    if (drilldown) setDrilldown(null);
    else onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      zIndexClassName="z-[60]"
      ariaLabelledBy="history-modal-title"
      containerClassName="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col animate-scale-in overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
        {/* Back button (drilldown only) */}
        {drilldown && (
          <button
            onClick={() => setDrilldown(null)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Back to all nodes"
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
          <h2 id="history-modal-title" className="text-sm font-semibold text-gray-900 truncate font-roboto">
            {showingNode ? activeTitle : 'All Nodes'}
          </h2>
          <p className="text-[11px] text-gray-400 font-roboto">Status History</p>
        </div>

        {/* Period picker */}
        <PeriodPicker active={period} onChange={setPeriod} />

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
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
    </Modal>
  );
};

export default HistoryModal;
