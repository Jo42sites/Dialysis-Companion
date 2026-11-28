import os
import base64
import hashlib
import sqlite3
import secrets
from collections.abc import Generator

import pyotp
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import DATABASE_PATH, MEDICAL_DATA_KEY


def _encrypt_legacy_totp_secret(unit_id: int, secret: str) -> str:
    key = hashlib.sha256(
        MEDICAL_DATA_KEY.encode("utf-8") + b":" + str(unit_id).encode("ascii")
    ).digest()
    nonce = secrets.token_bytes(12)
    encrypted_and_tag = AESGCM(key).encrypt(
        nonce,
        ('{"secret":"' + secret + '"}').encode("utf-8"),
        None,
    )
    return ".".join(
        base64.b64encode(value).decode("ascii")
        for value in (nonce, encrypted_and_tag[-16:], encrypted_and_tag[:-16])
    )


def connect_database() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    connection = sqlite3.connect(
        DATABASE_PATH, timeout=30, check_same_thread=False
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def initialize_database() -> None:
    connection = connect_database()
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS units (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              slug TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
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

            CREATE TABLE IF NOT EXISTS webauthn_credentials (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              credential_id BLOB NOT NULL UNIQUE,
              public_key BLOB NOT NULL,
              sign_count INTEGER NOT NULL DEFAULT 0,
              transports TEXT,
              label TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (user_id) REFERENCES unit_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_webauthn_user
              ON webauthn_credentials(user_id);

            CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              code_hash TEXT NOT NULL,
              used_at TEXT,
              FOREIGN KEY (user_id) REFERENCES unit_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user
              ON mfa_recovery_codes(user_id);

            CREATE TABLE IF NOT EXISTS guide_accounts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL COLLATE NOCASE UNIQUE,
              password_hash TEXT NOT NULL,
              data_ciphertext TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              token_version INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              last_login_at TEXT
            );

            CREATE TABLE IF NOT EXISTS site_admin_audit (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              admin_email TEXT NOT NULL,
              action TEXT NOT NULL,
              unit_id INTEGER,
              account_id INTEGER,
              record_id TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_site_admin_audit_time
              ON site_admin_audit(created_at DESC);
            """
        )

        unit_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(units)")
        }
        if "is_active" not in unit_columns:
            connection.execute(
                "ALTER TABLE units ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
            )
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(unit_users)")
        }
        if "totp_last_step" not in columns:
            connection.execute(
                "ALTER TABLE unit_users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0"
            )
        legacy_units = connection.execute(
            """
            SELECT units.id, units.slug, units.password_hash FROM units
            WHERE NOT EXISTS (
              SELECT 1 FROM unit_users WHERE unit_users.unit_id = units.id
            )
            """
        ).fetchall()
        for unit in legacy_units:
            connection.execute(
                """
                INSERT INTO unit_users (unit_id, username, password_hash, role)
                VALUES (?, ?, ?, 'admin')
                """,
                (unit["id"], unit["slug"], unit["password_hash"]),
            )
        users_without_secret = connection.execute(
            "SELECT id, unit_id FROM unit_users WHERE totp_secret IS NULL"
        ).fetchall()
        for user in users_without_secret:
            connection.execute(
                "UPDATE unit_users SET totp_secret = ? WHERE id = ?",
                (
                    _encrypt_legacy_totp_secret(user["unit_id"], pyotp.random_base32()),
                    user["id"],
                ),
            )
        os.chmod(DATABASE_PATH, 0o600)
        connection.commit()
    finally:
        connection.close()


def get_database() -> Generator[sqlite3.Connection, None, None]:
    connection = connect_database()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
