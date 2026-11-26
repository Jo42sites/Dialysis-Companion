const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

const resolvedPath = path.resolve(__dirname, '..', config.databasePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patient_records (
    id TEXT PRIMARY KEY,
    unit_id INTEGER NOT NULL,
    ciphertext TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_patient_records_unit
  ON patient_records(unit_id);
`);

module.exports = db;
