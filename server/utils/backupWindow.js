// Backup-window math and effective-window resolution.
//
// Windows are defined in LOCAL WALL-CLOCK terms (frequency + start-minute +
// duration [+ day-of-week]). Membership is tested by comparing the current local
// wall-clock minutes-since-midnight against the window — never by epoch/anchor
// arithmetic — so it is inherently DST-safe: "03:00 local" is always 03:00 local.

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ── Module state: auto-window cache + detection config ────────────────────────

// identifier → BackupWindow (auto, source:'auto'), mirrors the backup_schedules table.
const autoWindows = new Map();
let detectionConfig = { enabled: true, timezone: undefined };

export function setBackupDetectionConfig(cfg) {
  detectionConfig = {
    enabled: cfg?.enabled !== false,
    timezone: cfg?.timezone || undefined,
  };
}

/** Replace the entire auto-window cache from getAllBackupSchedules() output. */
export function setAutoWindows(entries) {
  autoWindows.clear();
  for (const { nodeId, window } of entries) {
    if (window) autoWindows.set(nodeId, window);
  }
}

export function setAutoWindow(identifier, window) {
  if (window) autoWindows.set(identifier, window);
  else autoWindows.delete(identifier);
}

export function getAutoWindow(identifier) {
  return autoWindows.get(identifier) || null;
}

/** All identifiers that currently hold an auto window (for orphan pruning). */
export function autoWindowIdentifiers() {
  return [...autoWindows.keys()];
}

function resolveTimezone() {
  if (detectionConfig.timezone) return detectionConfig.timezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ── Local wall-clock helpers ──────────────────────────────────────────────────

// Cache one Intl.DateTimeFormat per timezone: constructing them is expensive and
// isWithinBackupWindow runs on every offline check (and once per event during
// detection). An invalid IANA name throws in the constructor, so we fall back to
// the container-local zone and cache that under the bad key — a single mistyped
// backupDetection.timezone can then never crash the health-check loop or re-throw.
const formatterOpts = {
  hourCycle: 'h23',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};
const formatterCache = new Map();

function getFormatter(timezone) {
  if (formatterCache.has(timezone)) return formatterCache.get(timezone);
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...formatterOpts });
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', formatterOpts); // container-local fallback
  }
  formatterCache.set(timezone, fmt);
  return fmt;
}

/** Local time-of-day (minutes since midnight, seconds) and weekday for an epoch. */
export function localTimeOfDay(epochMs, timezone = resolveTimezone()) {
  const parts = getFormatter(timezone).formatToParts(new Date(epochMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const second = parseInt(get('second'), 10);
  const dow = WEEKDAY_INDEX[get('weekday')] ?? 0;
  return { minutes: hour * 60 + minute, second, dow };
}

/** True when `now` falls inside the window, evaluated in local wall-clock time. */
export function isWithinBackupWindow(w, now = Date.now(), timezone = resolveTimezone()) {
  if (!w || !w.enabled) return false;
  const { minutes, second, dow } = localTimeOfDay(now, timezone);
  const nowMin = minutes + second / 60;
  const start = w.startMinute;
  const duration = w.durationMinutes;

  // A window covering `now` must have started either today or yesterday (a
  // window can cross midnight). Check both candidate start days.
  for (const dayOffset of [0, -1]) {
    if (w.frequency === 'weekly') {
      const startDow = ((dow + dayOffset) % 7 + 7) % 7;
      if (startDow !== (w.dayOfWeek ?? 0)) continue;
    }
    const elapsed = (nowMin - start) + (dayOffset === 0 ? 0 : 1440);
    if (elapsed >= 0 && elapsed < duration) return true;
  }
  return false;
}

/**
 * The effective window for a node: a manual window on the node takes precedence;
 * otherwise the auto-detected window from the cache (unless detection is globally
 * off or the node opted out). Returns null when no window applies.
 */
export function effectiveBackupWindow(node, identifier) {
  const manual = node?.backupWindow;
  if (manual && manual.source !== 'auto') {
    // A manual window that exists but is disabled means "no suppression".
    return manual.enabled ? manual : null;
  }
  if (detectionConfig.enabled === false) return null;
  if (node?.disableBackupDetection) return null;
  return autoWindows.get(identifier) || null;
}
