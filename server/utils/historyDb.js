import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getDbPath() {
  if (process.env.NAUTILUS_DATA_DIR) {
    return join(process.env.NAUTILUS_DATA_DIR, 'history.db');
  }
  return join(__dirname, '../../history.db');
}

let db   = null;
let dirty = false;

// ── Persistence ───────────────────────────────────────────────────────────────

function flushToDisk() {
  if (!db || !dirty) return;
  try {
    const dbPath = getDbPath();
    const data   = db.export();          // Uint8Array
    // Write to a temp file then atomically rename over the live DB, so an
    // interrupted write (e.g. SIGKILL on shutdown) can never corrupt it.
    const tmpPath = `${dbPath}.tmp`;
    writeFileSync(tmpPath, Buffer.from(data));
    renameSync(tmpPath, dbPath);
    dirty = false;
  } catch (err) {
    console.error('❌ [HISTORY] Failed to persist database:', err.message);
  }
}

// ── Initialization (async, call once at startup) ──────────────────────────────

export async function initHistoryDb() {
  const dbPath = getDbPath();
  const dir    = dirname(dbPath);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Point sql.js at its own WASM file (avoids fetch in Node.js env)
  const SQL = await initSqlJs({
    locateFile: (file) => join(__dirname, '../../node_modules/sql.js/dist', file),
  });

  if (existsSync(dbPath)) {
    try {
      db = new SQL.Database(readFileSync(dbPath));
    } catch (err) {
      // A corrupt/truncated history.db must NOT crash the whole server.
      // Move it aside and start fresh so the dashboard still comes up.
      const backupPath = `${dbPath}.corrupt-${Date.now()}`;
      console.error(`❌ [HISTORY] Could not open ${dbPath} (${err.message}). Backing up to ${backupPath} and starting a fresh database.`);
      try {
        renameSync(dbPath, backupPath);
      } catch (backupErr) {
        console.error(`❌ [HISTORY] Failed to back up corrupt database: ${backupErr.message}`);
      }
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS status_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id        TEXT    NOT NULL,
      status         TEXT    NOT NULL,
      timestamp      INTEGER NOT NULL,
      response_time  INTEGER,
      error          TEXT,
      players_online INTEGER,
      players_max    INTEGER,
      streams        INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_node_timestamp
      ON status_history (node_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_timestamp
      ON status_history (timestamp DESC);
  `);

  // Auto-detected backup windows live here (keyed by the same normalized
  // identifier as status_history) rather than in config.json, so a background
  // detector never races the client's whole-tree config saves. Manual windows
  // are stored on the node in config.json instead.
  db.run(`
    CREATE TABLE IF NOT EXISTS backup_schedules (
      node_id          TEXT    PRIMARY KEY,
      frequency        TEXT    NOT NULL,
      start_minute     INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      day_of_week      INTEGER,
      source           TEXT    NOT NULL,
      detected_at      INTEGER,
      updated_at       INTEGER
    );
  `);

  // Flush to disk every 60 seconds
  setInterval(flushToDisk, 60_000);

  // Flush on process exit / signals.
  // SIGTERM/SIGINT handlers MUST call process.exit(): registering a listener
  // overrides Node's default termination, so without an explicit exit the
  // process would ignore `systemctl stop`/reboot, get SIGKILLed after the stop
  // timeout, and risk corrupting the DB with a half-finished write.
  process.on('exit',    flushToDisk);
  process.on('SIGTERM', () => { flushToDisk(); process.exit(0); });
  process.on('SIGINT',  () => { flushToDisk(); process.exit(0); });

  console.log(`📚 [HISTORY] Database ready at ${dbPath}`);
}

// ── Internal query helper ─────────────────────────────────────────────────────

function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Public API (synchronous after initHistoryDb resolves) ─────────────────────

export function recordStatusHistory(nodeId, statusResult) {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO status_history
         (node_id, status, timestamp, response_time, error, players_online, players_max, streams)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        statusResult.status,
        Date.now(),
        statusResult.responseTime          ?? null,
        statusResult.error                 ?? null,
        statusResult.players?.online       ?? null,
        statusResult.players?.max          ?? null,
        statusResult.streams               ?? null,
      ]
    );
    dirty = true;
  } catch (err) {
    console.error('❌ [HISTORY] Failed to record status:', err.message);
  }
}

export function getNodeHistory(nodeId, sinceMs) {
  return queryAll(
    `SELECT status, timestamp, response_time, error, players_online, players_max, streams
     FROM   status_history
     WHERE  node_id = ? AND timestamp >= ?
     ORDER  BY timestamp ASC`,
    [nodeId, sinceMs]
  );
}

export function getAllNodesHistory(sinceMs) {
  return queryAll(
    `SELECT node_id, status, timestamp, response_time, error, players_online, players_max, streams
     FROM   status_history
     WHERE  timestamp >= ?
     ORDER  BY node_id, timestamp ASC`,
    [sinceMs]
  );
}

// ── Backup schedules (auto-detected windows) ──────────────────────────────────

function rowToBackupWindow(row) {
  if (!row) return null;
  return {
    enabled: true,
    frequency: row.frequency,
    startMinute: row.start_minute,
    durationMinutes: row.duration_minutes,
    dayOfWeek: row.day_of_week == null ? undefined : row.day_of_week,
    source: row.source || 'auto',
    detectedAt: row.detected_at ? new Date(row.detected_at).toISOString() : undefined,
  };
}

/** Returns an array of { nodeId, window } for every stored auto schedule. */
export function getAllBackupSchedules() {
  return queryAll('SELECT * FROM backup_schedules').map(row => ({
    nodeId: row.node_id,
    window: rowToBackupWindow(row),
  }));
}

export function upsertBackupSchedule(nodeId, w) {
  if (!db) return;
  try {
    db.run(
      `INSERT OR REPLACE INTO backup_schedules
         (node_id, frequency, start_minute, duration_minutes, day_of_week, source, detected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        w.frequency,
        w.startMinute,
        w.durationMinutes,
        w.dayOfWeek ?? null,
        w.source || 'auto',
        w.detectedAt ? new Date(w.detectedAt).getTime() : Date.now(),
        Date.now(),
      ]
    );
    dirty = true;
  } catch (err) {
    console.error('❌ [HISTORY] Failed to upsert backup schedule:', err.message);
  }
}

export function deleteBackupSchedule(nodeId) {
  if (!db) return;
  try {
    db.run('DELETE FROM backup_schedules WHERE node_id = ?', [nodeId]);
    dirty = true;
  } catch (err) {
    console.error('❌ [HISTORY] Failed to delete backup schedule:', err.message);
  }
}

export function pruneOldHistory(retentionDays = 30) {
  if (!db) return;
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    db.run('DELETE FROM status_history WHERE timestamp < ?', [cutoff]);
    dirty = true;
    flushToDisk(); // Persist pruned state immediately
  } catch (err) {
    console.error('❌ [HISTORY] Failed to prune:', err.message);
  }
}
