import React, { useState, useEffect, useRef } from 'react';

const NetworkScanWindow: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subnet, setSubnet] = useState(() => localStorage.getItem('lastSubnet') || '10.20.148.0/16');
  const logRef = useRef<HTMLDivElement>(null);

  // Poll progress/logs from backend
  const [progress, setProgress] = useState<number>(0);
  // Persist scan state and auto-reopen window if scan is running
  useEffect(() => {
    let interval: number | undefined;
    let lastProgress = 0;
    let lastTimestamp = Date.now();
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/network-scan/progress');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.logs)) {
            setLogs(data.logs);
          } else if (data.output) {
            setLogs(prev => [...prev, data.output]);
          }
          // Progress interpolation
          if (typeof data.progress === 'number') {
            setProgress(data.progress);
            lastProgress = data.progress;
            lastTimestamp = Date.now();
          } else if (isScanning) {
            // Interpolate progress between polling intervals
            const now = Date.now();
            const elapsed = now - lastTimestamp;
            if (lastProgress < 100) {
              const interpolated = Math.min(100, lastProgress + (elapsed / 10000) * (100 - lastProgress));
              setProgress(Math.round(interpolated));
            }
          }
          if (data.status === 'scanning') {
            if (mounted) setIsScanning(true);
          }
          if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
            if (mounted) setIsScanning(false);
            setProgress(100);
          }
        } else {
          setError('Failed to fetch scan progress');
        }
      } catch (err) {
        setError('Error fetching scan progress');
      }
    };
    poll();
    interval = window.setInterval(poll, 1000);
    return () => {
      mounted = false;
      if (interval !== undefined) {
        clearInterval(interval);
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll log window
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const startScan = async () => {
    setIsScanning(true);
    setLogs([]);
    setError(null);
    localStorage.setItem('lastSubnet', subnet);
    try {
      const res = await fetch('/api/network-scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnet })
      });
      if (!res.ok) {
        setError('Failed to start scan');
        setIsScanning(false);
      }
    } catch (err) {
      setError('Error starting scan');
      setIsScanning(false);
    }
  };

  const cancelScan = async () => {
    try {
      await fetch('/api/network-scan/cancel', { method: 'POST' });
    } catch (err) {
      setError('Error cancelling scan');
    }
    setIsScanning(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-xl relative">
        <button
          className={`absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => { if (!isScanning) window.history.back(); }}
          aria-label="Close"
          disabled={isScanning}
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold mb-4">Network Scan & Auto Node Generation</h2>
        <p className="mb-6 text-gray-700">Scan your local network to discover devices and populate nodes. This process uses nmap and may take a few minutes depending on network size.</p>
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2" htmlFor="subnet-input">Subnet to scan</label>
          <input
            id="subnet-input"
            type="text"
            className="border border-gray-300 rounded px-3 py-2 w-full text-sm"
            value={subnet}
            onChange={e => setSubnet(e.target.value)}
            disabled={isScanning}
            placeholder="Enter subnet (e.g. 10.20.148.0/16)"
          />
        </div>
        <div className="mt-2 bg-gray-100 rounded p-2 h-56 overflow-y-auto text-xs font-mono border border-gray-200" ref={logRef}>
          {logs.length === 0 && <span className="text-gray-300">No logs yet.</span>}
          {logs.map((log, idx) => (
            <div key={idx} className="text-gray-500">{log}</div>
          ))}
        </div>
        {error && <div className="mt-2 text-red-600">{error}</div>}
        <div className="flex justify-end items-center mt-6 gap-2">
          {isScanning && (
            <div className="flex-1 flex items-center mr-2">
              <div className="w-full h-5 bg-gray-200 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
                <span className="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center text-xs font-semibold text-blue-900">
                  {progress}%
                </span>
              </div>
            </div>
          )}
          {!isScanning && (
            <button className="bg-blue-600 text-white px-4 py-2 rounded shadow" onClick={startScan}>
              Start Scan
            </button>
          )}
          {isScanning && (
            <button className="bg-red-500 text-white px-4 py-2 rounded shadow" onClick={cancelScan}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkScanWindow;
