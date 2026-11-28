import os
import secrets
import sqlite3
import sys
import tempfile
from datetime import date
from pathlib import Path

from backup_crypto import encrypt_backup
from config import DATABASE_PATH
from database import connect_database, initialize_database


def main() -> None:
    password = os.getenv("BACKUP_PASSWORD", "")
    if len(password) < 16:
        raise ValueError(
            "Set BACKUP_PASSWORD to a unique passphrase of at least 16 characters through your secret manager."
        )
    output = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else Path("backups") / f"records-{date.today().isoformat()}.dcbackup"
    ).resolve()
    initialize_database()
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="dc-backup-") as temp_dir:
        snapshot = Path(temp_dir) / "snapshot.sqlite"
        source = connect_database()
        target = sqlite3.connect(snapshot)
        try:
            source.backup(target)
            target.commit()
        finally:
            target.close()
            source.close()
        encrypted = encrypt_backup(snapshot.read_bytes(), password)
        temporary_output = output.with_name(f"{output.name}.{secrets.token_hex(16)}.tmp")
        try:
            fd = os.open(temporary_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as file:
                file.write(encrypted)
            os.replace(temporary_output, output)
        finally:
            temporary_output.unlink(missing_ok=True)
    print(f"Encrypted backup written to {output}")
    prune(output.parent)


def prune(folder: Path) -> None:
    """Keep the newest backups only; a full disk stops dialysis at 06:00."""
    keep = int(os.getenv("BACKUP_KEEP", "30"))
    if keep <= 0:
        return
    backups = sorted(
        folder.glob("records-*.dcbackup"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    for old in backups[keep:]:
        try:
            old.unlink()
            print(f"Removed old backup {old.name}")
        except OSError as error:
            print(f"Could not remove {old.name}: {error}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
