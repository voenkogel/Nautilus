import React from 'react';
import { createPortal } from 'react-dom';
import { Binoculars, Plus, Radar, Upload } from 'lucide-react';
import NetworkScanWindow from './NetworkScanWindow';
import type { AppConfig, TreeNode } from '../types/config';
import { createConfigFileInput } from '../utils/configBackup';

interface EmptyNodesFallbackProps {
  onCreateStartingNode: () => void;
  appConfig: AppConfig;
  onRestoreConfig?: (config: AppConfig) => void;
}

const EmptyNodesFallback: React.FC<EmptyNodesFallbackProps> = ({ 
  onCreateStartingNode,
  appConfig,
  onRestoreConfig
}) => {
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
        const res = await fetch('api/network-scan/progress');
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

  // Handle restoring config from backup file
  const handleRestoreConfig = () => {
    if (!onRestoreConfig) return;
    
    const input = createConfigFileInput(
      async (restoredConfig) => {
        setIsLoading(true);
        setLoadError(null);
        try {
          await onRestoreConfig(restoredConfig);
          // Success is handled by the parent component
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : 'Failed to restore backup');
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
  
  // Portalled to <body>: the map stage isolates its stacking context, which would keep the app header on top.
  return createPortal(
    <div className="welcome-splash" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-splash-content">
        <div className="welcome-splash-mark">
          <Binoculars size={36} strokeWidth={1.6} />
        </div>

        <h1 id="welcome-title">Welcome to {appConfig.general?.title || 'Nautilus'}</h1>
        <p>Add your first node to start monitoring your network.</p>

        <div className="welcome-splash-actions">
          <button
            className="welcome-primary"
            onClick={async () => {
              const { authenticate } = await import('../utils/auth');
              if (await authenticate()) setShowScanWindow(true);
            }}
            disabled={scanActive}
          >
            <Radar size={18} />Discover nodes
          </button>
          <button className="welcome-secondary" onClick={onCreateStartingNode}>
            <Plus size={18} />Create node manually
          </button>
          {onRestoreConfig && (
            <button className="welcome-tertiary" onClick={handleRestoreConfig} disabled={isLoading}>
              <Upload size={16} />{isLoading ? 'Restoring...' : 'Restore a backup'}
            </button>
          )}
        </div>

        {loadError && (
          <p className="welcome-splash-error" role="alert"><strong>Backup restore failed.</strong> {loadError}</p>
        )}
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
    </div>,
    document.body
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
