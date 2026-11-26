import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "test-migration-jwt-secret-" + "x" * 32)
os.environ.setdefault("MEDICAL_DATA_KEY", "test-migration-data-key-" + "y" * 32)

import database
from main import decrypt_record, hash_password, verify_password


class LegacyDatabaseTests(unittest.TestCase):
    def test_existing_database_schema_and_accounts_are_preserved(self):
        original_path = database.DATABASE_PATH
        with tempfile.TemporaryDirectory(prefix="dc-schema-test-") as directory:
            database_path = Path(directory) / "existing.sqlite"
            legacy_password_hash = hash_password("Existing-Unit-Password-2026")
            connection = sqlite3.connect(database_path)
            connection.executescript(
                """
                CREATE TABLE units (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  slug TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE unit_users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  unit_id INTEGER NOT NULL,
                  username TEXT NOT NULL,
                  password_hash TEXT NOT NULL,
                  role TEXT NOT NULL,
                  totp_secret TEXT,
                  totp_enabled INTEGER NOT NULL DEFAULT 0,
                  is_active INTEGER NOT NULL DEFAULT 1,
                  token_version INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  UNIQUE (unit_id, username)
                );
                """
            )
            connection.execute(
                "INSERT INTO units (id, name, slug, password_hash) VALUES (41, 'Existing Unit', 'existing-unit', ?)",
                (legacy_password_hash,),
            )
            connection.execute(
                """
                INSERT INTO unit_users (unit_id, username, password_hash, role)
                VALUES (41, 'legacy.admin', ?, 'admin')
                """,
                (legacy_password_hash,),
            )
            connection.commit()
            connection.close()

            database.DATABASE_PATH = database_path
            try:
                database.initialize_database()
                migrated = database.connect_database()
                try:
                    columns = {
                        row["name"]
                        for row in migrated.execute("PRAGMA table_info(unit_users)")
                    }
                    self.assertIn("totp_last_step", columns)
                    user = migrated.execute(
                        "SELECT * FROM unit_users WHERE username = 'legacy.admin'"
                    ).fetchone()
                    self.assertEqual(user["unit_id"], 41)
                    self.assertTrue(
                        verify_password(
                            "Existing-Unit-Password-2026", user["password_hash"]
                        )
                    )
                    self.assertRegex(user["totp_secret"], r"^[^\.]+\.[^\.]+\.[^\.]+$")
                    self.assertRegex(
                        decrypt_record(41, user["totp_secret"])["secret"],
                        r"^[A-Z2-7]+$",
                    )
                finally:
                    migrated.close()
            finally:
                database.DATABASE_PATH = original_path


if __name__ == "__main__":
    unittest.main()
