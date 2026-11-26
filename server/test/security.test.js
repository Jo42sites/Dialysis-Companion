const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateSync } = require('otplib');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialysis-api-test-'));
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.MEDICAL_DATA_KEY = crypto.randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
process.env.CORS_ORIGIN = 'http://127.0.0.1:5500';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const db = require('../src/database');
const { encryptBackup, decryptBackup } = require('../scripts/backup-crypto');
let server;
let baseUrl;

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function request(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(baseUrl + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = response.status === 204 ? null : await response.json();
  return { response, result };
}

async function enrollUnit(name, slug, username) {
  const registered = await request('/api/units/register', {
    method: 'POST',
    body: { name, slug, username, password: 'Strong-Unit-Password-2026' }
  });
  assert.equal(registered.response.status, 201);
  const enrollmentCode = generateSync({ secret: registered.result.secret });
  const confirm = await request('/api/units/mfa/confirm', {
    method: 'POST',
    body: {
      setupToken: registered.result.setupToken,
      code: enrollmentCode
    }
  });
  assert.equal(confirm.response.status, 200);
  return { ...confirm.result, secret: registered.result.secret, enrollmentCode };
}

test('requires MFA and enforces account roles and tenant isolation', async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const admin = await enrollUnit('Unit One', 'unit-one', 'unit.admin');
  const replayedLogin = await request('/api/units/login', {
    method: 'POST',
    body: {
      slug: 'unit-one',
      username: 'unit.admin',
      password: 'Strong-Unit-Password-2026',
      code: admin.enrollmentCode
    }
  });
  assert.equal(replayedLogin.response.status, 401);

  const login = await request('/api/units/login', {
    method: 'POST',
    body: {
      slug: 'unit-one',
      username: 'unit.admin',
      password: 'Strong-Unit-Password-2026',
      code: generateSync({ secret: admin.secret, epoch: Math.floor(Date.now() / 1000) + 30 })
    }
  });
  assert.equal(login.response.status, 200);

  const recoveryCode = admin.recoveryCodes[0];
  const recoveryLogin = await request('/api/units/login', {
    method: 'POST',
    body: {
      slug: 'unit-one',
      username: 'unit.admin',
      password: 'Strong-Unit-Password-2026',
      code: recoveryCode
    }
  });
  assert.equal(recoveryLogin.response.status, 200);
  const reusedRecoveryCode = await request('/api/units/login', {
    method: 'POST',
    body: {
      slug: 'unit-one',
      username: 'unit.admin',
      password: 'Strong-Unit-Password-2026',
      code: recoveryCode
    }
  });
  assert.equal(reusedRecoveryCode.response.status, 401);

  const created = await request('/api/units/records', {
    method: 'POST',
    token: admin.token,
    body: { name: 'Private Test Patient', notes: 'sensitive test detail' }
  });
  assert.equal(created.response.status, 201);
  const storedRecord = db.prepare('SELECT ciphertext FROM patient_records WHERE id = ?')
    .get(created.result.id);
  assert.equal(storedRecord.ciphertext.includes('Private Test Patient'), false);

  const legacyRecords = [{ id: 'legacy-patient-1', record: { name: 'Imported Patient' } }];
  const imported = await request('/api/units/records/import', {
    method: 'POST',
    token: admin.token,
    body: { records: legacyRecords }
  });
  assert.deepEqual(imported.result, { imported: 1, skipped: 0 });
  const repeatedImport = await request('/api/units/records/import', {
    method: 'POST',
    token: admin.token,
    body: { records: legacyRecords }
  });
  assert.deepEqual(repeatedImport.result, { imported: 0, skipped: 1 });

  const addedViewer = await request('/api/units/users', {
    method: 'POST',
    token: admin.token,
    body: { username: 'read.only', password: 'Strong-Viewer-Password-2026', role: 'viewer' }
  });
  assert.equal(addedViewer.response.status, 201);

  const viewerSetup = await request('/api/units/login', {
    method: 'POST',
    body: { slug: 'unit-one', username: 'read.only', password: 'Strong-Viewer-Password-2026' }
  });
  assert.equal(viewerSetup.result.mfaSetupRequired, true);
  const viewerMfa = await request('/api/units/mfa/confirm', {
    method: 'POST',
    body: {
      setupToken: viewerSetup.result.setupToken,
      code: generateSync({ secret: viewerSetup.result.secret })
    }
  });
  assert.equal(viewerMfa.response.status, 200);

  const forbiddenWrite = await request('/api/units/records', {
    method: 'POST',
    token: viewerMfa.result.token,
    body: { name: 'Should not save' }
  });
  assert.equal(forbiddenWrite.response.status, 403);
  const deactivated = await request(`/api/units/users/${viewerMfa.result.user.id}`, {
    method: 'DELETE',
    token: admin.token
  });
  assert.equal(deactivated.response.status, 204);
  const revokedViewer = await request('/api/units/records', { token: viewerMfa.result.token });
  assert.equal(revokedViewer.response.status, 401);

  const secondUnit = await enrollUnit('Unit Two', 'unit-two', 'other.admin');
  const isolated = await request('/api/units/records', { token: secondUnit.token });
  assert.deepEqual(isolated.result.records, []);
  const crossUnitImport = await request('/api/units/records/import', {
    method: 'POST',
    token: secondUnit.token,
    body: { records: legacyRecords }
  });
  assert.equal(crossUnitImport.response.status, 409);

  const audit = await request('/api/units/audit', { token: admin.token });
  assert.equal(audit.response.status, 200);
  assert.equal(JSON.stringify(audit.result).includes('Private Test Patient'), false);

  const passwordUpdated = await request('/api/units/me/password', {
    method: 'PUT',
    token: admin.token,
    body: {
      currentPassword: 'Strong-Unit-Password-2026',
      newPassword: 'Another-Strong-Password-2026'
    }
  });
  assert.equal(passwordUpdated.response.status, 204);
  const revokedAdmin = await request('/api/units/records', { token: admin.token });
  assert.equal(revokedAdmin.response.status, 401);

  process.env.NODE_ENV = 'production';
  const insecureRequest = await request('/api/health');
  process.env.NODE_ENV = 'test';
  assert.equal(insecureRequest.response.status, 426);
});

test('encrypted backups reject tampered data and decrypt valid snapshots', () => {
  const plaintext = Buffer.from('database-snapshot');
  const encrypted = encryptBackup(plaintext, 'a-long-backup-passphrase');
  assert.deepEqual(decryptBackup(encrypted, 'a-long-backup-passphrase'), plaintext);

  const tampered = JSON.parse(encrypted.toString('utf8'));
  tampered.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptBackup(Buffer.from(JSON.stringify(tampered)), 'a-long-backup-passphrase'));
});
