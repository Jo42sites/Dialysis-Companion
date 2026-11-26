const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../src/config');
const { decryptBackup } = require('./backup-crypto');

function main() {
  const input = process.argv[2];
  const password = process.env.BACKUP_PASSWORD;
  if (!input) throw new Error('Usage: npm run restore-backup -- path/to/file.dcbackup');
  if (!password || password.length < 16) {
    throw new Error('Set BACKUP_PASSWORD to the passphrase used when creating the backup.');
  }

  const databasePath = path.resolve(__dirname, '..', config.databasePath);
  const plaintext = decryptBackup(fs.readFileSync(path.resolve(input)), password);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(databasePath), `.restore-${process.pid}-${Date.now()}.sqlite`);
  try {
    fs.writeFileSync(tempPath, plaintext, { mode: 0o600, flag: 'wx' });
    const restoredDb = new Database(tempPath, { readonly: true, fileMustExist: true });
    const integrity = restoredDb.pragma('integrity_check', { simple: true });
    const hasRecords = restoredDb.prepare(
      "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('units', 'unit_users', 'patient_records')"
    ).get().total;
    restoredDb.close();
    if (integrity !== 'ok' || hasRecords !== 3) {
      throw new Error('Backup database failed integrity validation');
    }

    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(databasePath + suffix); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    fs.renameSync(tempPath, databasePath);
    fs.chmodSync(databasePath, 0o600);
    console.log(`Backup restored to ${databasePath}. Keep the server stopped until restore completes.`);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
