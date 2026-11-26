const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('backup CLI creates an encrypted archive that restore validates', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialysis-backup-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const database = path.join(tempDir, 'records.sqlite');
  const backup = path.join(tempDir, 'records.dcbackup');
  const env = {
    ...process.env,
    DATABASE_PATH: database,
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    MEDICAL_DATA_KEY: crypto.randomBytes(48).toString('hex'),
    BACKUP_PASSWORD: 'independent-backup-passphrase-2026'
  };
  const serverDir = path.resolve(__dirname, '..');

  const created = spawnSync(process.execPath, ['scripts/backup.js', backup], {
    cwd: serverDir,
    env,
    encoding: 'utf8'
  });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(fs.existsSync(backup), true);
  assert.equal(fs.readFileSync(backup, 'utf8').includes('patient_records'), false);

  const restored = spawnSync(process.execPath, ['scripts/restore-backup.js', backup], {
    cwd: serverDir,
    env,
    encoding: 'utf8'
  });
  assert.equal(restored.status, 0, restored.stderr);

  const db = new Database(database, { readonly: true });
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();
});
