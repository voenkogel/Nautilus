import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { healthStates as states, healthDescription } from '../utils/networkSummary';
import type { NetworkFilter, summarize } from '../utils/networkSummary';

type Summary = ReturnType<typeof summarize>;

/** The same proportional arcs at overview and branch-chip sizes. `only` limits
 *  the ring to those states; the remaining states and unmonitored nodes neither
 *  draw nor count toward its fill. */
export function HealthRing({ summary, only, center = false }: { summary: Summary; only?: (typeof states)[number]['key'][]; center?: boolean }) {
  const segments = states.filter(state => !only || only.includes(state.key)).map(state => ({ ...state, value: summary[state.key] })).filter(segment => segment.value > 0);
  const total = only ? segments.reduce((sum, segment) => sum + segment.value, 0) : summary.monitored;
  const circumference = 2 * Math.PI * 18;
  let offset = 0;
  return <svg className="health-ring" viewBox="0 0 44 44" aria-hidden="true">
    <circle className="health-ring-track" cx="22" cy="22" r="18" />
    {segments.map(segment => {
      const length = segment.value / total * circumference;
      const start = offset; offset += length;
      const gap = segments.length > 1 ? Math.min(2.2, length * .2) : 0;
      return <circle key={segment.key} className="health-ring-segment" cx="22" cy="22" r="18" stroke={segment.color} strokeDasharray={`${Math.max(.1, length - gap)} ${circumference - Math.max(.1, length - gap)}`} strokeDashoffset={-start + -gap / 2} transform="rotate(-90 22 22)" />;
    })}
    {center && <text x="22" y="23" dominantBaseline="middle" textAnchor="middle">{total || '\u2014'}</text>}
  </svg>;
}

export function NetworkHealth({ summary, filter, onFilter, children }: { summary: Summary; filter: NetworkFilter; onFilter: (filter: NetworkFilter) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return <div ref={container} className={`network-health ${children ? 'orb-health' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); container.current?.querySelector('button')?.focus(); } }}>
    <button className={`network-health-trigger ${children ? 'node-body' : ''} ${filter && filter !== 'activity' ? 'filtered' : ''}`} aria-label="Network health" aria-expanded={open} title={healthDescription(summary)} onClick={() => setOpen(value => !value)}>
      {children || <><HealthRing summary={summary} center /><span>Health<small>{filter && filter !== 'activity' ? states.find(state => state.key === filter)?.label : 'All monitored'}</small></span><ChevronDown size={13} /></>}
    </button>
    {open && <div className="health-breakdown" role="group" aria-label="Health filters"><div className="health-breakdown-heading"><strong>Network health</strong><span>{summary.monitored} monitored</span></div>
      {states.map(state => state.key === 'unknown' ? summary.unknown > 0 && <div className="health-breakdown-passive" key={state.key}><i style={{ color: state.color }} /><span>{state.label}</span><strong>{summary.unknown}</strong></div> :
        <button key={state.key} aria-label={`${summary[state.key]} ${state.key === 'backup' ? 'backing up' : state.key}`} aria-pressed={filter === state.key} onClick={() => { onFilter(filter === state.key ? null : state.key); setOpen(false); }}><i style={{ color: state.color }} /><span>{state.label}</span><strong>{summary[state.key]}</strong></button>)}
      {summary.total > summary.monitored && <p>{summary.total - summary.monitored} unmonitored nodes excluded</p>}
    </div>}
  </div>;
}
