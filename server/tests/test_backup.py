import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backup_crypto import decrypt_backup, encrypt_backup


class BackupCryptoTests(unittest.TestCase):
    def test_encrypted_backup_roundtrip_and_tamper_detection(self):
        plaintext = b"sqlite-snapshot-content"
        envelope = encrypt_backup(plaintext, "independent-backup-passphrase")
        self.assertEqual(decrypt_backup(envelope, "independent-backup-passphrase"), plaintext)
        with self.assertRaises(Exception):
            decrypt_backup(envelope, "wrong-backup-passphrase")

    def test_backup_and_restore_commands(self):
        server_dir = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix="dc-backup-test-") as temp_dir:
            database = Path(temp_dir) / "records.sqlite"
            backup = Path(temp_dir) / "records.dcbackup"
            env = {
                **os.environ,
                "JWT_SECRET": "test-backup-jwt-secret-" + "x" * 32,
                "MEDICAL_DATA_KEY": "test-backup-data-key-" + "y" * 32,
                "DATABASE_PATH": str(database),
                "BACKUP_PASSWORD": "independent-backup-passphrase",
            }
            created = subprocess.run(
                [sys.executable, "backup.py", str(backup)],
                cwd=server_dir,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            self.assertTrue(backup.exists())

            database.write_bytes(b"not a sqlite database")
            restored = subprocess.run(
                [sys.executable, "restore_backup.py", str(backup)],
                cwd=server_dir,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(restored.returncode, 0, restored.stderr)
            connection = __import__("sqlite3").connect(database)
            try:
                self.assertEqual(
                    connection.execute("PRAGMA integrity_check").fetchone()[0], "ok"
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
