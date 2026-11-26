import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from backup_crypto import decrypt_backup
from config import DATABASE_PATH


def main() -> None:
    if len(sys.argv) < 2:
        raise ValueError("Usage: python restore_backup.py path/to/file.dcbackup")
    password = os.getenv("BACKUP_PASSWORD", "")
    if len(password) < 16:
        raise ValueError("Set BACKUP_PASSWORD to the passphrase used when creating the backup.")

    database_path = DATABASE_PATH
    database_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    plaintext = decrypt_backup(Path(sys.argv[1]).resolve().read_bytes(), password)
    temporary_path: Path | None = None
    try:
        fd, name = tempfile.mkstemp(prefix=".restore-", suffix=".sqlite", dir=database_path.parent)
        temporary_path = Path(name)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as file:
            file.write(plaintext)
        restored = sqlite3.connect(f"file:{temporary_path}?mode=ro", uri=True)
        try:
            integrity = restored.execute("PRAGMA integrity_check").fetchone()[0]
            tables = {
                row[0]
                for row in restored.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        finally:
            restored.close()
        if integrity != "ok" or not {"units", "unit_users", "patient_records"}.issubset(tables):
            raise ValueError("Backup database failed integrity validation")

        for suffix in ("-wal", "-shm"):
            Path(f"{database_path}{suffix}").unlink(missing_ok=True)
        os.replace(temporary_path, database_path)
        temporary_path = None
        os.chmod(database_path, 0o600)
        print(f"Backup restored to {database_path}. Keep the server stopped until restore completes.")
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
