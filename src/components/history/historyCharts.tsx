import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { CalendarRange, Clock } from 'lucide-react';
import { isCustomRange, type HistoryRecord, type HistoryRange, type TimelineBucket } from '../../hooks/useStatusHistory';
import { formatTimestamp, PERIODS, PERIOD_MS, HISTORY_RETENTION_MS, BUCKETS } from './historyUtils';
import { statusColors, statusLabels } from '../../utils/colors';

// --- Period selector ---

// <input type="datetime-local"> works in local wall-clock time without a zone.
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => new Date(value).getTime();

export const PeriodPicker: React.FC<{ active: HistoryRange; onChange: (range: HistoryRange) => void }> = ({ active, onChange }) => {
  const custom = isCustomRange(active);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const openCustom = () => {
    if (open) { setOpen(false); return; }
    // Seed with the window currently shown so tweaking it is one edit.
    const now = Date.now();
    const start = custom ? active.from : now - PERIOD_MS[active];
    const end = custom ? active.to : now;
    setFrom(toLocalInput(start));
    setTo(toLocalInput(end));
    setOpen(true);
  };

  const now = Date.now();
  const fromMs = from ? fromLocalInput(from) : NaN;
  const toMs = to ? fromLocalInput(to) : NaN;
  const invalid = !Number.isFinite(fromMs) || !Number.isFinite(toMs)
    ? 'Pick a start and end'
    : fromMs >= toMs ? 'End must be after start'
    : toMs < now - HISTORY_RETENTION_MS ? 'History is kept for 30 days'
    : '';

  const segment = (selected: boolean) => `px-3 py-1.5 text-xs rounded-md transition-all font-medium ${selected ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink'}`;

  return (
    <div className="period-picker-wrap" ref={root} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <div
        className="period-picker animated-segments"
        style={{ '--segment-count': PERIODS.length + 1, '--segment-index': custom ? PERIODS.length : PERIODS.findIndex(period => period.value === active) } as React.CSSProperties}
      >
        {PERIODS.map(({ value, label }) => (
          <button key={value} aria-pressed={value === active} onClick={() => { setOpen(false); onChange(value); }} className={segment(value === active)}>
            {label}
          </button>
        ))}
        <button aria-pressed={custom} aria-expanded={open} aria-haspopup="dialog" aria-label="Custom range" title="Custom range" onClick={openCustom} className={segment(custom)}>
          <CalendarRange size={14} />
        </button>
      </div>
      {open && (
        <form
          className="range-popover"
          role="dialog"
          aria-label="Custom range"
          onSubmit={e => { e.preventDefault(); if (!invalid) { onChange({ from: fromMs, to: Math.min(toMs, Date.now()) }); setOpen(false); } }}
        >
          <label>From<input type="datetime-local" value={from} min={toLocalInput(now - HISTORY_RETENTION_MS)} max={to || toLocalInput(now)} onChange={e => setFrom(e.target.value)} autoFocus /></label>
          <label>To<input type="datetime-local" value={to} min={from || undefined} max={toLocalInput(now)} onChange={e => setTo(e.target.value)} /></label>
          <div className="range-popover-footer">
            <span role={invalid ? 'alert' : undefined}>{invalid || 'Up to the last 30 days'}</span>
            <button type="submit" className="primary-action" disabled={!!invalid}>Apply</button>
          </div>
        </form>
      )}
    </div>
  );
};

// --- Uptime timeline bar ---

// Timeline bucket colors: the shared status tokens plus an "empty" (no-data)
// shade specific to the timeline. Single source of truth for the status hues —
// previously these were duplicated here and had drifted from statusColors.
const colorMap: Record<string, string> = {
  online:   statusColors.online,
  offline:  statusColors.offline,
  checking: statusColors.checking,
  backup:   statusColors.backup,
  empty:    '#263e4b',
};

/**
 * Timeline bars, either from raw `records` (single-node report) or from
 * `buckets` the server already reduced (overview — see historySummary.js).
 */
export const UptimeTimeline: React.FC<{
  records?: HistoryRecord[];
  buckets?: TimelineBucket[];
  sinceMs: number;
  nowMs: number;
}> = ({ records, buckets: precomputed, sinceMs, nowMs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ index: number; clientX: number; clientY: number } | null>(null);
  const bucketCount = precomputed?.length || BUCKETS;
  const bucketMs = (nowMs - sinceMs) / bucketCount;

  const buckets = useMemo((): TimelineBucket[] => {
    if (precomputed) return precomputed;
    // Single O(records) pass into fixed buckets instead of O(BUCKETS × records).
    const result: TimelineBucket[] = new Array(BUCKETS).fill('empty');
    const sawOffline  = new Uint8Array(BUCKETS);
    const sawOnline   = new Uint8Array(BUCKETS);
    const sawChecking = new Uint8Array(BUCKETS);
    const sawBackup   = new Uint8Array(BUCKETS);
    for (const r of records ?? []) {
      if (r.timestamp < sinceMs || r.timestamp >= nowMs) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor((r.timestamp - sinceMs) / bucketMs));
      if (idx < 0) continue;
      if (r.status === 'offline')      sawOffline[idx]  = 1;
      else if (r.status === 'online')  sawOnline[idx]   = 1;
      else if (r.status === 'backup')  sawBackup[idx]   = 1;
      else                             sawChecking[idx] = 1;
    }
    // Priority: offline > backup > online > checking > empty. A genuine outage
    // in a nominal backup window still shows red (offline wins over backup).
    for (let i = 0; i < BUCKETS; i++) {
      if (sawOffline[i])       result[i] = 'offline';
      else if (sawBackup[i])   result[i] = 'backup';
      else if (sawOnline[i])   result[i] = 'online';
      else if (sawChecking[i]) result[i] = 'checking';
    }
    return result;
  }, [precomputed, records, sinceMs, nowMs, bucketMs]);

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
            {hovered === 'empty' ? 'No data' : (statusLabels[hovered as keyof typeof statusLabels] ?? hovered)}
          </div>
          <div className="text-muted mt-0.5">
            {formatTimestamp(sinceMs + tooltip.index * bucketMs)}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Response time sparkline ---

export const ResponseSparkline: React.FC<{
  records: HistoryRecord[];
  accentColor: string;
}> = ({ records, accentColor }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ clientX: number; clientY: number } | null>(null);

  const valid = records.filter(r => r.responseTime != null && r.status === 'online');

  const W = 1000;
  const H = 60;
  const pad = 6;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || valid.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < valid.length; i++) {
      const x = valid.length > 1 ? (i / (valid.length - 1)) * W : W / 2;
      const d = Math.abs(x - relX);
      if (d < minDist) { minDist = d; closest = i; }
    }
    setHoveredIndex(closest);
    setTooltipPos({ clientX: e.clientX, clientY: e.clientY });
  }, [valid.length]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setTooltipPos(null);
  }, []);

  if (valid.length < 3) {
    return (
      <div className="flex items-center justify-center h-16 text-muted text-xs">
        Not enough data to plot
      </div>
    );
  }

  const times = valid.map(r => r.responseTime!);
  const maxT  = Math.max(...times);
  const minT  = Math.min(...times);
  const range = maxT - minT || 1;
  const avg   = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  const pts = valid.map((r, i) => ({
    x: (i / (valid.length - 1)) * W,
    y: H - pad - ((r.responseTime! - minT) / range) * (H - pad * 2),
    value: r.responseTime!,
    timestamp: r.timestamp,
  }));

  const linePoints = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;
  const hovered = hoveredIndex !== null ? pts[hoveredIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        style={{ height: 60 }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
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
        {/* Hover indicator */}
        {hovered && (
          <>
            <line
              x1={hovered.x} y1={pad}
              x2={hovered.x} y2={H}
              stroke={accentColor}
              strokeWidth="1.5"
              strokeDasharray="4,3"
              strokeOpacity="0.5"
            />
            <circle cx={hovered.x} cy={hovered.y} r="6" fill={accentColor} fillOpacity="0.2" />
            <circle cx={hovered.x} cy={hovered.y} r="4" fill={accentColor} />
            <circle cx={hovered.x} cy={hovered.y} r="2" fill="white" />
          </>
        )}
      </svg>

      {/* Floating tooltip */}
      {hovered && tooltipPos && (
        <div
          className="fixed z-[200] pointer-events-none px-3 py-2 bg-gray-900 text-white rounded-lg shadow-xl text-xs"
          style={{
            left: tooltipPos.clientX,
            top:  tooltipPos.clientY - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-semibold font-roboto">{hovered.value}ms</div>
          <div className="text-muted font-roboto">{formatTimestamp(hovered.timestamp)}</div>
        </div>
      )}

      <div className="flex justify-between text-[10px] text-muted mt-1 font-roboto">
        <span>min {minT}ms</span>
        <span>avg {avg}ms</span>
        <span>max {maxT}ms</span>
      </div>
    </div>
  );
};

// --- Uptime ring ---

export const UptimeRing: React.FC<{ pct: number | null }> = ({ pct }) => {
  const R = 28;
  const circumference = 2 * Math.PI * R;
  const filled = pct !== null ? (pct / 100) * circumference : 0;

  const color = pct === null ? '#9ca3af'
    : pct >= 99 ? statusColors.online
    : pct >= 95 ? '#f59e0b'
    : statusColors.offline;

  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      {/* Track */}
      <circle cx="36" cy="36" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      {/* Progress -- CSS rotation alone positions start at 12 o'clock, no offset needed */}
      <circle
        cx="36" cy="36" r={R}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px', transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Label */}
      <text x="36" y="37" textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="monospace">
        {pct !== null ? `${pct.toFixed(1)}%` : '—'}
      </text>
      <text x="36" y="49" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
        uptime
      </text>
    </svg>
  );
};

// --- Loading / Empty states ---

export const Spinner: React.FC = () => (
  <div className="flex items-center justify-center h-52">
    <div className="w-7 h-7 border-2 border-line border-t-blue-500 rounded-full animate-spin" />
  </div>
);

export const EmptyHistory: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-52 text-muted gap-2">
    <Clock className="w-10 h-10 text-gray-200" />
    <p className="text-sm font-medium">No history yet</p>
    <p className="text-xs">Data appears after the first health check cycle</p>
  </div>
);

// --- Stats row ---

export const StatCard: React.FC<{ label: string; value: string; colorClass: string; icon: React.ReactNode }> =
  ({ label, value, colorClass, icon }) => (
    <div className="bg-abyss rounded-xl p-4 flex flex-col items-center gap-1">
      <div className={`text-xl font-bold font-roboto ${colorClass}`}>{value}</div>
      <div className="flex items-center gap-1 text-[11px] text-muted font-roboto">
        {icon}
        {label}
      </div>
    </div>
  );
