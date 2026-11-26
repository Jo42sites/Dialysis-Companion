const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { generateSecret } = require('otplib');
const config = require('./config');
const { encryptRecord } = require('./recordCrypto');

const resolvedPath = path.resolve(__dirname, '..', config.databasePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });

const db = new Database(resolvedPath);
fs.chmodSync(resolvedPath, 0o600);
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

  CREATE TABLE IF NOT EXISTS unit_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'clinician', 'viewer')),
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    totp_last_step INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (unit_id, username),
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_unit_users_unit ON unit_users(unit_id);

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    record_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES unit_users(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_events_unit_time
  ON audit_events(unit_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES unit_users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user
  ON mfa_recovery_codes(user_id);
`);

const userColumns = new Set(db.pragma('table_info(unit_users)').map((column) => column.name));
if (!userColumns.has('totp_last_step')) {
  db.exec('ALTER TABLE unit_users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0');
}

const legacyUnits = db.prepare(`
  SELECT u.id, u.slug, u.password_hash
  FROM units u
  WHERE NOT EXISTS (SELECT 1 FROM unit_users x WHERE x.unit_id = u.id)
`).all();
const addLegacyAdmin = db.prepare(`
  INSERT INTO unit_users (unit_id, username, password_hash, role)
  VALUES (?, ?, ?, 'admin')
`);
for (const unit of legacyUnits) {
  addLegacyAdmin.run(unit.id, unit.slug, unit.password_hash);
}

const usersWithoutMfaSecret = db.prepare(`
  SELECT id, unit_id FROM unit_users WHERE totp_secret IS NULL
`).all();
const setMfaSecret = db.prepare('UPDATE unit_users SET totp_secret = ? WHERE id = ?');
for (const user of usersWithoutMfaSecret) {
  setMfaSecret.run(encryptRecord(user.unit_id, { secret: generateSecret() }), user.id);
}

module.exports = db;
