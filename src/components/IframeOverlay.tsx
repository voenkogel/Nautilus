import React from 'react';

export interface IframeOverlayData {
  url: string;
  title: string;
  nodeId?: string;
}

interface IframeOverlayProps {
  overlay: IframeOverlayData;
  onClose: () => void;
  onOpenHistory: (nodeId: string, nodeName: string) => void;
}

/** Full-screen embedded web view for a node's URL (sandboxed iframe). */
export const IframeOverlay: React.FC<IframeOverlayProps> = ({ overlay, onClose, onOpenHistory }) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-8 animate-fade-in">
    <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-full max-h-full flex flex-col animate-scale-in">
      {/* Header with title and buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="text-base font-semibold text-gray-900 truncate flex-1 mr-4">
          {overlay.title}
        </h3>
        <div className="flex items-center gap-1">
          {/* History button - only for monitored nodes */}
          {overlay.nodeId && (
            <button
              onClick={() => onOpenHistory(overlay.nodeId!, overlay.title)}
              className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
              aria-label="View history"
              title="View status history"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              window.open(overlay.url, '_blank', 'noopener,noreferrer');
              onClose();
            }}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
            aria-label="Open in new tab"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 relative">
        <iframe
          src={overlay.url}
          className="w-full h-full border-0 rounded-b-lg"
          title={overlay.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-same-origin allow-scripts allow-forms allow-navigation allow-popups"
          loading="lazy"
        />
      </div>
    </div>
  </div>
);

export default IframeOverlay;
