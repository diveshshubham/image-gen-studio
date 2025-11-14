// backend/src/db.ts
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const DB_PATH =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : process.env.SQLITE_FILE || path.join(process.cwd(), 'data', 'dev.db');

let SQL: any;
let db: any;
let inited = false;

/**
 * locateWasm helps sql.js find the wasm file.
 * Prefer node_modules/sql.js/dist/sql-wasm.wasm, fallback to __dirname.
 */
function locateWasm(file: string) {
  const candidate = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
  if (fs.existsSync(candidate)) return candidate;
  return path.join(__dirname, file);
}

/**
 * Initialize the SQL.js DB instance (file or :memory:).
 * Safe to call multiple times; subsequent calls return the same instance.
 */
export async function initDb() {
  if (inited) return db;

  SQL = await initSqlJs({ locateFile: (file: string) => locateWasm(file) });

  if (DB_PATH === ':memory:') {
    db = new SQL.Database();
  } else {
    const folder = path.dirname(DB_PATH);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  }

  // Ensure schema exists
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      style TEXT NOT NULL,
      imageUrl TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    -- idempotency table: track client-provided idempotency keys
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      userId INTEGER,
      generationId INTEGER, -- set once generation completes
      status TEXT NOT NULL, -- 'in-progress' | 'done' | 'failed'
      createdAt TEXT NOT NULL
    );
  `);

  // persist initial DB to disk (if file-based)
  saveDb();

  inited = true;
  return db;
}

/**
 * Save DB to disk (no-op for :memory:).
 * Throws if write fails.
 */
export function saveDb() {
  if (!db) return;
  if (DB_PATH === ':memory:') return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * Execute mutating statements (INSERT / UPDATE / DELETE).
 * Uses prepared statement run(params) and saves DB.
 */
export function run(sql: string, params: any[] = []) {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');

  const stmt = db.prepare(sql);
  try {
    if (params && params.length) {
      // stmt.run accepts array of params
      stmt.run(params);
    } else {
      stmt.run();
    }
  } finally {
    try {
      stmt.free();
    } catch (_) {}
  }

  // persist to disk when using file-based DB
  saveDb();
}

/**
 * Return all rows from a SELECT as an array of objects.
 * Uses prepare()/bind()/step()/getAsObject().
 */
export function all<T = any>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');

  const stmt = db.prepare(sql);
  const out: T[] = [];
  try {
    // debug logging can be toggled or removed
    // console.log('[DEBUG] SQL:', sql, 'params:', params);

    if (params && params.length) stmt.bind(params);

    while (stmt.step()) {
      const rowObj = stmt.getAsObject() as T;
      out.push(rowObj);
    }
  } finally {
    try {
      stmt.free();
    } catch (_) {}
  }
  return out;
}

/**
 * Return single row or null. Uses prepare()/bind()/step()/getAsObject().
 */
export function get<T = any>(sql: string, params: any[] = []): T | null {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');

  const stmt = db.prepare(sql);
  try {
    if (params && params.length) stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject() as T;
      return row;
    }
    return null;
  } finally {
    try {
      stmt.free();
    } catch (_) {}
  }
}

/** Close the DB and reset state (useful in tests). */
export function close() {
  if (!db) return;
  try {
    db.close();
  } catch (_) {
    // ignore errors on close
  } finally {
    db = null;
    inited = false;
  }
}

/* --------------------------------------------------------------------------
   Idempotency helpers
   These are tiny convenience functions you can call from your route handlers.
   -------------------------------------------------------------------------- */

/**
 * Read idempotency record by key.
 * Returns { key, userId, generationId, status, createdAt } or null.
 */
export function getIdempotency(key: string) {
  if (!key) return null;
  return get<{ key: string; userId: number | null; generationId: number | null; status: string; createdAt: string }>(
    'SELECT key, userId, generationId, status, createdAt FROM idempotency_keys WHERE key = ?',
    [key]
  );
}

/**
 * Create an idempotency record (status='in-progress').
 */
export function createIdempotency(key: string, userId: number | null = null) {
  const createdAt = new Date().toISOString();
  run(
    'INSERT INTO idempotency_keys (key, userId, generationId, status, createdAt) VALUES (?, ?, ?, ?, ?)',
    [key, userId, null, 'in-progress', createdAt]
  );
}

/**
 * Mark idempotency record done and attach generationId.
 */
export function markIdempotencyDone(key: string, generationId: number) {
  run('UPDATE idempotency_keys SET generationId = ?, status = ? WHERE key = ?', [generationId, 'done', key]);
}

/**
 * Mark idempotency record failed.
 */
export function markIdempotencyFailed(key: string) {
  run('UPDATE idempotency_keys SET status = ? WHERE key = ?', ['failed', key]);
}
