// Backup-window autodetection.
//
// Analyses each monitored node's downtime history and, when downtimes recur at a
// regular interval (daily/weekly), automatically arms a backup window for that
// node — no user intervention. Auto windows are stored in the backup_schedules
// table (never in config.json) and mirrored into the healthCheck window cache.
import { getNodeHistory, upsertBackupSchedule, deleteBackupSchedule } from '../utils/historyDb.js';
import { setAutoWindow, getAutoWindow, autoWindowIdentifiers, localTimeOfDay } from '../utils/backupWindow.js';
import { isNodeMonitored, getNodeIdentifier } from '../utils/nodeMonitoring.js';
import { normalizeNodeIdentifier } from './healthCheck.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const DST_SHIFT_MS = 3_600_000; // a DST transition shifts a fixed-local-time gap by ~1h

const DEFAULTS = {
  minEvents: 3,
  lookbackDays: 30,
  minDurationMs: 60_000,       // ignore downtimes < 1 min (flaps)
  maxDurationMs: 6 * 3_600_000, // ignore downtimes > 6h (real outages, not backups)
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function runBackupDetection(appConfig) {
  const cfg = appConfig?.backupDetection || {};
  if (cfg.enabled === false) return { armed: [], expired: [], skipped: 'disabled' };

  const opts = {
    minEvents: cfg.minEvents ?? DEFAULTS.minEvents,
    lookbackDays: cfg.lookbackDays ?? DEFAULTS.lookbackDays,
    minDurationMs: cfg.minDurationMs ?? DEFAULTS.minDurationMs,
    maxDurationMs: cfg.maxDurationMs ?? DEFAULTS.maxDurationMs,
    timezone: cfg.timezone,
    now: Date.now(),
  };

  const nodes = flattenNodes(appConfig?.tree?.nodes);
  const armed = [];
  const expired = [];

  // Prune auto windows whose node no longer exists in the tree. Windows are
  // keyed by (normalized) address, so without this a deleted node's schedule
  // lingers in the cache/DB and — on restart or address reuse — gets inherited
  // by a different node, wrongly suppressing its outage alerts.
  const validIds = new Set(
    nodes.map((n) => getNodeIdentifier(n)).filter(Boolean).map((id) => normalizeNodeIdentifier(id))
  );
  for (const identifier of autoWindowIdentifiers()) {
    if (!validIds.has(identifier)) {
      deleteBackupSchedule(identifier);
      setAutoWindow(identifier, null);
      expired.push({ identifier, title: '(removed node)' });
    }
  }

  for (const node of nodes) {
    // Yield to the event loop between nodes so a large multi-node history scan
    // (each getNodeHistory read is synchronous) never stalls the HTTP server.
    await new Promise((resolve) => setImmediate(resolve));

    if (!isNodeMonitored(node)) continue;
    if (node.disableBackupDetection) continue;
    // Never overwrite a user's manual window.
    if (node.backupWindow && node.backupWindow.source !== 'auto') continue;

    const rawId = getNodeIdentifier(node);
    if (!rawId) continue;
    const identifier = normalizeNodeIdentifier(rawId);

    const { detected } = analyzeNode(identifier, opts);

    if (detected) {
      const existing = getAutoWindow(identifier);
      const window = {
        ...detected,
        enabled: true,
        source: 'auto',
        detectedAt: existing?.detectedAt || new Date(opts.now).toISOString(),
      };
      upsertBackupSchedule(identifier, window);
      setAutoWindow(identifier, window);
      if (!existing) armed.push({ identifier, title: node.title, window });
    } else if (getAutoWindow(identifier)) {
      // A previously-armed pattern no longer holds — self-expire it.
      deleteBackupSchedule(identifier);
      setAutoWindow(identifier, null);
      expired.push({ identifier, title: node.title });
    }
  }

  if (armed.length || expired.length) {
    logger.info(`🟣 [BACKUP] Autodetection: armed ${armed.length}, expired ${expired.length}`);
  }
  return { armed, expired };
}

/**
 * Analyse one node's history (no persistence). Returns the derived downtime
 * events and the detected window candidate (or null). Used by runBackupDetection
 * and by the preview API endpoint.
 */
export function analyzeNode(identifier, opts) {
  const {
    minEvents = DEFAULTS.minEvents,
    lookbackDays = DEFAULTS.lookbackDays,
    minDurationMs = DEFAULTS.minDurationMs,
    maxDurationMs = DEFAULTS.maxDurationMs,
    timezone,
    now = Date.now(),
  } = opts || {};

  const rows = getNodeHistory(identifier, now - lookbackDays * DAY_MS);
  const events = deriveDowntimeEvents(rows, { minDurationMs, maxDurationMs });
  const detected = detectSchedule(events, { minEvents, timezone, now });
  return { events, detected };
}

// ── Downtime-event derivation ─────────────────────────────────────────────────

// Collapse the point-sample series into discrete downtime events. A "down"
// sample is offline OR backup (so an armed window keeps re-confirming). Event
// start/end are midpoints to the adjacent online samples, halving phase error.
// Exported for unit testing (fed a synthetic status_history series).
export function deriveDowntimeEvents(rows, { minDurationMs, maxDurationMs }) {
  const isDown = (s) => s === 'offline' || s === 'backup';
  const events = [];
  let runStart = -1;
  let samples = 0;

  for (let i = 0; i < rows.length; i++) {
    if (isDown(rows[i].status)) {
      if (runStart === -1) { runStart = i; samples = 1; } else { samples++; }
    } else if (runStart !== -1) {
      events.push(makeEvent(rows, runStart, i - 1, i, samples));
      runStart = -1;
      samples = 0;
    }
  }
  // A trailing run (still down at the end of history) is ongoing with no known
  // end — skip it so it can't skew duration/phase.

  return events.filter(
    (e) => e.samples >= 2 && e.duration >= minDurationMs && e.duration <= maxDurationMs
  );
}

function makeEvent(rows, startIdx, endIdx, recoverIdx, samples) {
  const firstDown = rows[startIdx].timestamp;
  const start = startIdx > 0 ? (rows[startIdx - 1].timestamp + firstDown) / 2 : firstDown;
  const end = (rows[endIdx].timestamp + rows[recoverIdx].timestamp) / 2;
  return { start, end, duration: end - start, samples };
}

// ── Periodicity detection ─────────────────────────────────────────────────────

// Exported for unit testing.
export function detectSchedule(events, { minEvents, timezone, now }) {
  if (events.length < minEvents) return null;

  const starts = events.map((e) => e.start).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]);

  const candidates = [
    { frequency: 'daily', period: DAY_MS, tol: 30 * 60_000, maxMult: 2 },
    { frequency: 'weekly', period: WEEK_MS, tol: 60 * 60_000, maxMult: 2 },
  ];

  for (const c of candidates) {
    // Every gap must be ~ an integer multiple (1..maxMult, tolerating one miss).
    let consistent = true;
    for (const g of gaps) {
      const m = Math.round(g / c.period);
      const dev = Math.abs(g - m * c.period);
      // Accept a gap that is off by ~1h: a daily/weekly backup at a fixed LOCAL
      // time spans a 23h/25h real gap across a DST change — still the same
      // schedule, so it must not disarm the window twice a year.
      const dstOk = Math.abs(dev - DST_SHIFT_MS) <= 5 * 60_000;
      if (m < 1 || m > c.maxMult || (dev > c.tol && !dstOk)) {
        consistent = false;
        break;
      }
    }
    if (!consistent) continue;

    // Recency: the pattern must still be active (a qualifying event recently).
    if (now - starts[starts.length - 1] > 2 * c.period + c.tol) continue;

    const tods = events.map((e) => localTimeOfDay(e.start, timezone));
    const startMinutes = tods.map((t) => t.minutes + t.second / 60);
    const meanStart = circularMeanMinutes(startMinutes);
    const spread = circularSpread(startMinutes, meanStart);

    const durations = events.map((e) => e.duration).sort((a, b) => a - b);
    const p90 = durations[Math.min(durations.length - 1, Math.floor(0.9 * durations.length))];
    const baseDuration = Math.max(5, Math.ceil(p90 / 60_000));

    // Widen to bracket observed starts + a small floor; cap at 2h.
    const durationMinutes = Math.min(120, Math.ceil(baseDuration + spread + 10));
    const rawStart = Math.floor(meanStart - spread / 2 - 5);
    const startMinute = ((rawStart % 1440) + 1440) % 1440;

    const result = { frequency: c.frequency, startMinute, durationMinutes };
    if (c.frequency === 'weekly') {
      let dow = modeDayOfWeek(tods.map((t) => t.dow));
      // A negative rawStart means the padded window start rolled back before local
      // midnight, i.e. it begins on the PREVIOUS weekday. Shift dayOfWeek to match,
      // or isWithinBackupWindow never lines the window up with the real backup.
      if (rawStart < 0) dow = (dow - 1 + 7) % 7;
      result.dayOfWeek = dow;
    }
    return result;
  }

  return null;
}

// ── Circular / statistical helpers ────────────────────────────────────────────

function circularMeanMinutes(mins) {
  let sin = 0;
  let cos = 0;
  for (const m of mins) {
    const a = (m / 1440) * 2 * Math.PI;
    sin += Math.sin(a);
    cos += Math.cos(a);
  }
  let mean = Math.atan2(sin, cos);
  if (mean < 0) mean += 2 * Math.PI;
  return (mean / (2 * Math.PI)) * 1440;
}

function circularSpread(mins, mean) {
  let max = 0;
  for (const m of mins) {
    let d = Math.abs(m - mean);
    d = Math.min(d, 1440 - d);
    if (d > max) max = d;
  }
  return max;
}

function modeDayOfWeek(dows) {
  const counts = {};
  let best = dows[0];
  let bestCount = 0;
  for (const d of dows) {
    counts[d] = (counts[d] || 0) + 1;
    if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
  }
  return best;
}

function flattenNodes(nodes, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    out.push(n);
    if (n.children) flattenNodes(n.children, out);
  }
  return out;
}
