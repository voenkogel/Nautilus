import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
    writeFileSync(dbPath, Buffer.from(data));
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
    db = new SQL.Database(readFileSync(dbPath));
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

  // Flush to disk every 60 seconds
  setInterval(flushToDisk, 60_000);

  // Flush on process exit / signals
  process.on('exit',    flushToDisk);
  process.on('SIGTERM', () => { flushToDisk(); });
  process.on('SIGINT',  () => { flushToDisk(); });

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
