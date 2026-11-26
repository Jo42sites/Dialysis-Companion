const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/database');
const { encryptBackup } = require('./backup-crypto');

async function main() {
  const password = process.env.BACKUP_PASSWORD;
  const output = path.resolve(process.argv[2] || path.join('backups', `records-${new Date().toISOString().slice(0, 10)}.dcbackup`));
  if (!password || password.length < 16) {
    throw new Error('Set BACKUP_PASSWORD to a unique passphrase of at least 16 characters through your secret manager.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-backup-'));
  const snapshot = path.join(tempDir, 'snapshot.sqlite');
  try {
    await db.backup(snapshot);
    const encrypted = encryptBackup(fs.readFileSync(snapshot), password);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    const temporaryOutput = `${output}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryOutput, encrypted, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryOutput, output);
    console.log(`Encrypted backup written to ${output}`);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
