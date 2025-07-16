import React, { useState, useEffect, useRef } from 'react';

import ReactDOM from 'react-dom';

// ...existing state/utility declarations...
// Polling logic for scan progress
interface NetworkScanWindowProps {
  appConfig?: any;
  scanActive?: boolean;
  setScanActive?: (active: boolean) => void;
  initialProgress?: number;
  initialLogs?: string[];
}

const NetworkScanWindow: React.FC<NetworkScanWindowProps> = ({ appConfig, scanActive, setScanActive, initialProgress = 0, initialLogs = [] }) => {
  // --- State and handlers ---
  const [isScanning, setIsScanning] = useState(scanActive ?? false);
  const [logs, setLogs] = useState<string[]>(initialLogs);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(initialProgress);
  const [showLogs, setShowLogs] = useState(false);
  useEffect(() => {
    (async () => {
      // const authenticated = await isAuthenticated();
      // Auth modal logic removed as unused
    })();
  }, []);
  const [ip, setIp] = useState(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    return lastSubnet.split('/')[0];
  });
  const [cidr, setCidr] = useState(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    return lastSubnet.split('/')[1] || '16';
  });
  const [ipError, setIpError] = useState<string | null>(null);
  const [cidrError, setCidrError] = useState<string | null>(null);
  const accentColor = appConfig?.appearance?.accentColor || '#3b82f6';
  const validateIp = (value: string): boolean => {
    return /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(value.trim());
  };
  const validateCidr = (value: string): boolean => {
    const num = Number(value);
    return /^\d{1,2}$/.test(value) && num >= 1 && num <= 32;
  };
  const estimateScanTime = (cidrValue: string): string => {
    if (!validateCidr(cidrValue)) return '';
    const cidrNum = parseInt(cidrValue, 10);
    const hosts = Math.max(2 ** (32 - cidrNum) - 2, 1);
    const seconds = Math.ceil(hosts / 20);
    if (seconds < 60) return '<1 min';
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
    return `${Math.ceil(seconds / 3600)} hr`;
  };
  const [scanEstimate, setScanEstimate] = useState<string>(() => {
    const lastSubnet = localStorage.getItem('lastSubnet') || '10.20.148.0/16';
    const cidr = lastSubnet.split('/')[1] || '16';
    return estimateScanTime(cidr);
  });
  const handleIpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIp(value);
    if (!validateIp(value)) {
      setIpError('Invalid IPv4 address');
    } else {
      setIpError(null);
    }
  };
  const handleCidrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCidr(value);
    if (!validateCidr(value)) {
      setCidrError('CIDR must be between 1 and 32');
      setScanEstimate('');
    } else {
      setCidrError(null);
      setScanEstimate(estimateScanTime(value));
    }
  };
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof scanActive === 'boolean') {
      setIsScanning(scanActive);
      setShowLogs(scanActive); // Show logs if scan is active on mount/refresh
    }
  }, [scanActive]);
  useEffect(() => {
    // No-op: polling is handled by pollProgress
    return () => {};
  }, [isScanning]);
  // Polling logic for scan progress
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollProgress = async () => {
    let polling = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/network-scan/progress');
        const data = await res.json();
        if (data.logs) setLogs(data.logs);
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          setIsScanning(false);
          polling = false;
        }
      } catch (err) {
        setError('Error fetching scan progress.');
        setIsScanning(false);
        polling = false;
      }
      if (polling) {
        pollingRef.current = setTimeout(poll, 2000);
      }
    };
    poll();
  };
  // Handler to start scan
  const handleStartScan = async () => {
    if (!validateIp(ip) || !validateCidr(cidr)) {
      setError('Please enter a valid IP and CIDR before scanning.');
      return;
    }
    setError(null);
    setIsScanning(true);
    if (setScanActive) setScanActive(true);
    setLogs(["Scan started..."]);
    setShowLogs(true);
    try {
      const subnet = `${ip}/${cidr}`;
      await fetch('/api/network-scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnet }),
      });
    } catch (err) {
      setError('Failed to start scan.');
      setIsScanning(false);
      setShowLogs(false);
      return;
    }
    // Start polling for progress
    pollProgress();
  };
  // ...existing code...
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl p-8 relative" style={{ zIndex: 1001 }}>
        <p>
          Scan your local network to discover devices and populate nodes. This process uses nmap and may take a few minutes depending on network size.
        </p>
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Subnet to scan</label>
          <div className="flex items-center gap-2">
            <input
              id="ip-input"
              type="text"
              className={`border rounded px-3 py-2 text-sm w-2/3 ${
                ipError ? 'border-red-400' : 'border-gray-300'
              } ${isScanning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
              value={ip}
              onChange={handleIpChange}
              disabled={isScanning}
              placeholder="IPv4 address (e.g. 10.20.148.0)"
              style={{ '--accent-color': accentColor } as React.CSSProperties}
            />
            <span className="text-gray-500">/</span>
            <input
              id="cidr-input"
              type="text"
              className={`border rounded px-3 py-2 text-sm w-16 text-center ${
                cidrError ? 'border-red-400' : 'border-gray-300'
              } ${isScanning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
              value={cidr}
              onChange={handleCidrChange}
              disabled={isScanning}
              placeholder="CIDR"
              style={{ '--accent-color': accentColor } as React.CSSProperties}
            />
            <div className="flex-1 text-xs text-gray-500 text-right">
              <span className="font-medium text-gray-700">Estimated scan time:</span>{' '}
              {scanEstimate ? (
                <span style={{ color: accentColor }}>{scanEstimate}</span>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            {ipError && <div className="text-xs text-red-600">{ipError}</div>}
            {cidrError && <div className="text-xs text-red-600">{cidrError}</div>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Enter a valid IPv4 address and CIDR size (e.g. 10.20.148.0 / 16). This determines the range of IP addresses to scan.
          </div>
        </div>
        {showLogs && (
          <div
            className="mt-2 bg-gray-100 rounded p-2 h-40 overflow-y-auto text-xs font-mono border border-gray-200"
            ref={logRef}
          >
            {logs.length === 0 && (
              <span className="text-gray-300">No logs yet.</span>
            )}
            {logs.map((log, idx) => (
              <div key={idx} className="text-gray-500">
                {log}
              </div>
            ))}
          </div>
        )}
        {error && <div className="mt-2 text-red-600">{error}</div>}

        {isScanning && (
          <div className="flex items-center gap-3" style={{ marginBottom: '1.5rem', marginTop: '1.5rem' }}>
            <svg
              className="animate-spin"
              style={{
                height: '2rem',
                width: '2rem',
                color: accentColor,
              }}
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-0"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v2a6 6 0 00-6 6H4z"
              />
            </svg>
            <span className="font-semibold text-gray-800">Scan in progress</span>
            <span className="text-xs text-gray-500 ml-2">
              Step 1: discovering network devices
            </span>
          </div>
        )}
        <div className="flex justify-end items-center mt-6 gap-2">
          {isScanning && (
            <>
              <div className="flex-1 flex items-center mr-2">
                <div
                  className="w-full h-10 rounded shadow bg-gray-200 overflow-hidden relative flex items-center"
                  style={{ borderRadius: '0.5rem', position: 'relative' }}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      borderRadius: '0.5rem',
                      backgroundColor: accentColor,
                    }}
                  />
                  <span className="absolute left-1/2 transform -translate-x-1/2 text-xs font-semibold text-gray-700">
                    {progress}%
                  </span>
                </div>
              </div>
              <button
                className="px-6 py-2 rounded font-semibold text-white shadow bg-red-600 hover:bg-red-700 transition-all duration-200 focus:outline-none"
                onClick={async () => {
                  try {
                    await fetch('/api/network-scan/cancel', { method: 'POST' });
                    setIsScanning(false);
                    setShowLogs(false);
                    if (setScanActive) setScanActive(false);
                  } catch (err) {
                    setError('Failed to cancel scan.');
                  }
                }}
              >
                Cancel
              </button>
            </>
          )}
          {!isScanning && (
            <>
              <button
                className="px-6 py-2 rounded font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 shadow transition-all duration-200 focus:outline-none mr-2"
                onClick={() => {
                  setShowLogs(false);
                  setLogs([]);
                  setProgress(0);
                  if (setScanActive) setScanActive(false);
                  // Also close the scan window in parent
                  if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('closeScanWindow'));
                  }
                }}
              >
                Close
              </button>
              <button
                className={`px-6 py-2 rounded font-semibold text-white shadow transition-all duration-200 focus:outline-none ${
                  ipError || cidrError ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
                style={{ backgroundColor: ipError || cidrError ? undefined : accentColor }}
                onClick={handleStartScan}
                disabled={!!ipError || !!cidrError}
              >
                Start Scan
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
export default NetworkScanWindow;
