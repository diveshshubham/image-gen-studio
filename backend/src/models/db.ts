import path from 'path';
import Database from 'better-sqlite3';

// database file path
const DB_PATH =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : process.env.SQLITE_FILE || path.join(__dirname, '..', '..', 'data', 'dev.db');

const db = new Database(DB_PATH);

// initialize tables if not present
db.exec(`
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
`);

export default db;
