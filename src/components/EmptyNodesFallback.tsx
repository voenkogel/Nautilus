import React from 'react';
import NetworkScanWindow from './NetworkScanWindow';
import type { AppConfig, TreeNode } from '../types/config';
import { createConfigFileInput } from '../utils/configBackup';

interface EmptyNodesFallbackProps {
  onCreateStartingNode: () => void;
  appConfig: AppConfig;
  onLoadConfig?: (config: AppConfig) => void;
}

const EmptyNodesFallback: React.FC<EmptyNodesFallbackProps> = ({ 
  onCreateStartingNode,
  appConfig,
  onLoadConfig
}) => {
  const accentColor = appConfig.appearance?.accentColor || '#3b82f6';
  const [showScanWindow, setShowScanWindow] = React.useState(false);
  const [scanActive, setScanActive] = React.useState(false);
  const [initialProgress, setInitialProgress] = React.useState<number>(0);
  const [initialLogs, setInitialLogs] = React.useState<string[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  React.useEffect(() => {
    // Poll backend for scan status on mount
    const poll = async () => {
      try {
        const res = await fetch('/api/network-scan/progress');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'scanning') {
            setScanActive(true);
            setShowScanWindow(true);
            if (typeof data.progress === 'number') setInitialProgress(data.progress);
            if (Array.isArray(data.logs)) setInitialLogs(data.logs);
          }
        }
      } catch {}
    };
    poll();
  }, []);

  React.useEffect(() => {
    // Listen for closeScanWindow event to close modal from child
    const closeHandler = () => setShowScanWindow(false);
    window.addEventListener('closeScanWindow', closeHandler);
    // Listen for openScanWindow event to open modal from settings
    const openHandler = () => setShowScanWindow(true);
    window.addEventListener('openScanWindow', openHandler);
    return () => {
      window.removeEventListener('closeScanWindow', closeHandler);
      window.removeEventListener('openScanWindow', openHandler);
    };
  }, []);

  // Handle loading config from file
  const handleLoadConfig = () => {
    if (!onLoadConfig) return;
    
    const input = createConfigFileInput(
      async (restoredConfig) => {
        setIsLoading(true);
        setLoadError(null);
        try {
          await onLoadConfig(restoredConfig);
          // Success is handled by the parent component
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load configuration');
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        setLoadError(error);
        setIsLoading(false);
      }
    );
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };
  
  return (
    <div className="flex items-center justify-center min-h-[400px] w-full">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-8 max-w-md mx-auto text-center border border-gray-200">
        {/* Icon */}
        <div 
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          {/* SVG server icon */}
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: accentColor }} className="opacity-80">
            <rect x="3" y="5" width="18" height="6" rx="2" stroke="currentColor" strokeWidth="2" />
            <rect x="3" y="13" width="18" height="6" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="1" fill="currentColor" />
            <circle cx="8" cy="16" r="1" fill="currentColor" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Welcome to {appConfig.general?.title || 'Nautilus'}
        </h2>

        {/* Description */}
        <p className="text-gray-600 mb-6 leading-relaxed">
          Your infrastructure dashboard is ready, but no nodes have been configured yet. 
          Get started by creating your first node to monitor your services and applications.
        </p>

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Discover Nodes Button */}
          <button
            onClick={async () => {
              const { authenticate } = await import('../utils/auth');
              const authenticated = await authenticate();
              if (!authenticated) {
                // Silently fail, just stay on welcome card
                return;
              }
              setShowScanWindow(true);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all duration-200 hover:shadow-lg hover:scale-105"
            style={{ backgroundColor: accentColor }}
            disabled={scanActive}
          >
            {/* SVG network icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            </svg>
            Discover Nodes
          </button>

          <div className="w-full flex items-center justify-center">
            <span className="text-gray-500 font-medium text-sm">or</span>
          </div>

          {/* Create Node Manually Button */}
          <button
            onClick={onCreateStartingNode}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all duration-200 hover:shadow-lg hover:scale-105"
            style={{ backgroundColor: accentColor }}
          >
            {/* SVG plus icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" />
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" />
            </svg>
            Create Node Manually
          </button>

          {onLoadConfig && (
            <>
              <div className="w-full flex items-center justify-center">
                <span className="text-gray-500 font-medium text-sm">or</span>
              </div>

              {/* Load Configuration Button */}
              <button
                onClick={handleLoadConfig}
                disabled={isLoading}
                className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium border-2 transition-all duration-200 ${
                  isLoading 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:shadow-lg hover:scale-105'
                }`}
                style={{ 
                  borderColor: accentColor,
                  color: accentColor,
                  backgroundColor: 'transparent'
                }}
              >
                {isLoading ? (
                  <>
                    {/* Loading spinner */}
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" style={{ color: accentColor }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8v8z" fill="currentColor" className="opacity-75" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    {/* SVG upload icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: accentColor }}>
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" stroke="currentColor" strokeWidth="2" />
                      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" />
                      <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
                      <polyline points="9,15 12,12 15,15" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Load Configuration
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Error message */}
        {loadError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" />
                <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
              </svg>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-red-800 mb-1">Configuration Load Failed</h4>
                <div className="text-sm text-red-600 whitespace-pre-line">{loadError}</div>
                <div className="mt-2 text-xs text-red-500">
                  Make sure you're uploading a valid Nautilus configuration file (.json)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Helpful hint */}
        <p className="text-sm text-gray-500 mt-4">
          You can add nodes for servers, applications, services, or any infrastructure you want to monitor.
        </p>
      </div>
      {showScanWindow && (
        <NetworkScanWindow
          appConfig={appConfig}
          scanActive={scanActive}
          setScanActive={setScanActive}
          initialProgress={initialProgress}
          initialLogs={initialLogs}
        />
      )}
    </div>
  );
};

// Helper function to create a default starting node
export const createStartingNode = (): TreeNode => {
  return {
    id: `node_${Date.now()}`,
    title: 'My First Server',
    subtitle: 'Infrastructure dashboard',
    icon: 'server',
    type: 'square',
    children: []
  };
};

export default EmptyNodesFallback;
