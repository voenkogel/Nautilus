import type { BackupWindow } from '../types/config';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Minutes-since-local-midnight → "HH:MM" (for <input type="time">). */
export const minutesToHHMM = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * "HH:MM" → minutes-since-local-midnight (0..1439). Returns null for an empty or
 * malformed value so callers can ignore it rather than silently snapping the
 * window to 00:00 (e.g. when the user clears the time field).
 */
export const hhmmToMinutes = (s: string): number | null => {
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (((h * 60 + m) % 1440) + 1440) % 1440;
};

/** A friendly default used when a node first enables a manual backup window. */
export const DEFAULT_BACKUP_WINDOW: BackupWindow = {
  enabled: true,
  frequency: 'daily',
  startMinute: 180, // 03:00
  durationMinutes: 30,
  source: 'manual',
};

/** Human-readable one-line description of a backup window. */
export function describeBackupWindow(w: BackupWindow): string {
  if (!w.enabled) return 'Backup window disabled.';
  const end = minutesToHHMM((w.startMinute + w.durationMinutes) % (24 * 60));
  const when = w.frequency === 'weekly' ? `every ${DAYS[w.dayOfWeek ?? 0]}` : 'every day';
  return `Reports "backing up" ${when} from ${minutesToHHMM(w.startMinute)} to ${end} (${w.durationMinutes} min).`;
}
