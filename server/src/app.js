const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateSecret, generateURI, verifySync } = require('otplib');
const db = require('./database');
const {
  signUnitToken, signSetupToken, verifyToken, requireUnit, requireRole
} = require('./auth');
const { encryptRecord, decryptRecord } = require('./recordCrypto');
const config = require('./config');

const app = express();
const dummyPasswordHash = bcrypt.hashSync(crypto.randomUUID(), 12);

app.disable('x-powered-by');
if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy);
app.use(helmet());
app.use((req, res, next) => {
  const origin = req.get('origin');
  const allowedOrigins = config.corsOrigin.split(',').map((item) => item.trim());
  if (!origin || allowedOrigins.includes(origin)) {
    res.set('Vary', 'Origin');
    if (origin) res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(426).json({ error: 'HTTPS is required' });
  }
  return next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many unit registration attempts. Try again later.' }
});

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 256;
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,50}$/.test(username);
}

function authPayload(user, secret) {
  const setupToken = signSetupToken(user);
  return {
    mfaSetupRequired: true,
    setupToken,
    secret,
    otpAuthUrl: generateURI({ secret, issuer: 'Dialysis Companion', label: `${user.username}` })
  };
}

function audit(req, action, recordId) {
  db.prepare(
    'INSERT INTO audit_events (unit_id, user_id, action, record_id) VALUES (?, ?, ?, ?)'
  ).run(req.unit.unitId, req.unit.userId, action, recordId || null);
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: Boolean(user.is_active),
    createdAt: user.created_at
  };
}

function decodeSetupToken(req, res) {
  const token = req.body?.setupToken;
  if (typeof token !== 'string') {
    res.status(401).json({ error: 'MFA setup session required' });
    return null;
  }
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'mfa_setup') throw new Error('bad-role');
    const user = db.prepare(`
      SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
      FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1
    `).get(Number(payload.sub), payload.unitId);
    if (!user || user.totp_enabled) throw new Error('invalid-user');
    return user;
  } catch (_error) {
    res.status(401).json({ error: 'MFA setup session is invalid or expired' });
    return null;
  }
}

function validTotp(secret, token) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({ secret, token, epochTolerance: 30 });
    return result.valid ? result.timeStep : false;
  } catch (_error) {
    return false;
  }
}

async function consumeRecoveryCode(userId, submittedCode) {
  if (typeof submittedCode !== 'string' || !/^[a-f0-9]{16}$/i.test(submittedCode)) return false;
  const codes = db.prepare(
    'SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL'
  ).all(userId);
  for (const code of codes) {
    if (await bcrypt.compare(submittedCode.toLowerCase(), code.code_hash)) {
      const result = db.prepare(
        "UPDATE mfa_recovery_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL"
      ).run(code.id);
      return result.changes === 1;
    }
  }
  return false;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/units/register', registrationLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const suppliedSlug = String(req.body?.slug || '').trim();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password;
  const slug = suppliedSlug.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a unit name (maximum 120 characters)' });
  if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) {
    return res.status(400).json({ error: 'Unit login code must contain 3-50 letters, numbers, or hyphens' });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 letters, numbers, dots, underscores, or hyphens' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be 12-256 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const retiredUnitHash = await bcrypt.hash(crypto.randomUUID(), 12);
    const secret = generateSecret();
    const createUnit = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO units (name, slug, password_hash) VALUES (?, ?, ?)'
      ).run(name, slug, retiredUnitHash);
      const unitId = Number(result.lastInsertRowid);
      const userResult = db.prepare(`
        INSERT INTO unit_users (unit_id, username, password_hash, role, totp_secret)
        VALUES (?, ?, ?, 'admin', ?)
      `).run(unitId, username, passwordHash, encryptRecord(unitId, { secret }));
      return db.prepare(`
        SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
        FROM unit_users WHERE id = ?
      `).get(userResult.lastInsertRowid);
    });
    const user = createUnit();
    db.prepare(
      'INSERT INTO audit_events (unit_id, user_id, action) VALUES (?, ?, ?)'
    ).run(user.unit_id, user.id, 'unit.register');
    return res.status(201).json({
      unit: { name, slug },
      ...authPayload(user, secret)
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That unit login code is already in use' });
    }
    throw error;
  }
});

app.post('/api/units/login', loginLimiter, async (req, res) => {
  const slug = String(req.body?.slug || '').trim().toLowerCase();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare(`
    SELECT users.*, units.slug, units.name AS unit_name
    FROM unit_users users JOIN units ON units.id = users.unit_id
    WHERE units.slug = ? AND users.username = ? AND users.is_active = 1
  `).get(slug, username);
  const passwordHash = user ? user.password_hash : dummyPasswordHash;
  const passwordValid = await bcrypt.compare(password, passwordHash);

  if (!user || !passwordValid) {
    return res.status(401).json({ error: 'Invalid unit, username, or password' });
  }

  if (!user.totp_enabled) {
    const secret = decryptRecord(user.unit_id, user.totp_secret).secret;
    return res.status(200).json({
      unit: { id: user.unit_id, name: user.unit_name, slug: user.slug },
      ...authPayload(user, secret)
    });
  }

  const secret = decryptRecord(user.unit_id, user.totp_secret).secret;
  const totpStep = validTotp(secret, req.body?.code);
  const totpValid = totpStep !== false && db.prepare(`
    UPDATE unit_users SET totp_last_step = ?
    WHERE id = ? AND totp_enabled = 1 AND totp_last_step < ?
  `).run(totpStep, user.id, totpStep).changes === 1;
  const recoveryValid = totpStep !== false ? false : await consumeRecoveryCode(user.id, req.body?.code);
  if (!totpValid && !recoveryValid) {
    return res.status(401).json({ error: 'Invalid unit, username, password, or verification code' });
  }

  db.prepare(
    'INSERT INTO audit_events (unit_id, user_id, action) VALUES (?, ?, ?)'
  ).run(user.unit_id, user.id, recoveryValid ? 'auth.login_recovery_code' : 'auth.login');
  return res.json({
    unit: { id: user.unit_id, name: user.unit_name, slug: user.slug },
    user: { id: user.id, username: user.username, role: user.role },
    token: signUnitToken(user)
  });
});

app.post('/api/units/mfa/confirm', async (req, res) => {
  const user = decodeSetupToken(req, res);
  if (!user) return;
  const secret = decryptRecord(user.unit_id, user.totp_secret).secret;
  const totpStep = validTotp(secret, req.body?.code);
  if (totpStep === false) {
    return res.status(400).json({ error: 'Verification code is invalid. Check your authenticator app and try again.' });
  }

  const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(8).toString('hex'));
  const hashes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
  const enableMfa = db.transaction(() => {
    const updated = db.prepare(
      'UPDATE unit_users SET totp_enabled = 1, totp_last_step = ? WHERE id = ? AND totp_enabled = 0'
    ).run(totpStep, user.id);
    if (updated.changes !== 1) throw new Error('MFA enrollment is no longer available');
    const insert = db.prepare(
      'INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)'
    );
    hashes.forEach((hash) => insert.run(user.id, hash));
    db.prepare(
      'INSERT INTO audit_events (unit_id, user_id, action) VALUES (?, ?, ?)'
    ).run(user.unit_id, user.id, 'auth.mfa_enabled');
  });
  enableMfa();
  const updatedUser = db.prepare('SELECT * FROM unit_users WHERE id = ?').get(user.id);
  return res.json({
    unit: db.prepare('SELECT id, name, slug FROM units WHERE id = ?').get(user.unit_id),
    user: { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
    token: signUnitToken(updatedUser),
    recoveryCodes
  });
});

app.get('/api/units/me', requireUnit, (req, res) => {
  const unit = db.prepare('SELECT id, name, slug FROM units WHERE id = ?').get(req.unit.unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  return res.json({ unit, user: { id: req.unit.userId, username: req.unit.username, role: req.unit.role } });
});

app.put('/api/units/me/password', requireUnit, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = req.body?.newPassword;
  const user = db.prepare('SELECT password_hash FROM unit_users WHERE id = ?').get(req.unit.userId);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be 12-256 characters' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  db.prepare(`
    UPDATE unit_users SET password_hash = ?, token_version = token_version + 1
    WHERE id = ? AND unit_id = ?
  `).run(passwordHash, req.unit.userId, req.unit.unitId);
  audit(req, 'user.password_change');
  return res.status(204).send();
});

app.get('/api/units/users', requireUnit, requireRole('admin'), (_req, res) => {
  const users = db.prepare(`
    SELECT id, username, role, is_active, created_at
    FROM unit_users WHERE unit_id = ? ORDER BY created_at
  `).all(req.unit.unitId);
  return res.json({ users: users.map(safeUser) });
});

app.post('/api/units/users', requireUnit, requireRole('admin'), async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password;
  const role = req.body?.role;
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 letters, numbers, dots, underscores, or hyphens' });
  }
  if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be 12-256 characters' });
  if (!['admin', 'clinician', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, clinician, or viewer' });
  }

  const secret = generateSecret();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO unit_users (unit_id, username, password_hash, role, totp_secret)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.unit.unitId, username, passwordHash, role, encryptRecord(req.unit.unitId, { secret }));
    audit(req, 'user.create');
    const user = db.prepare(`
      SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
      FROM unit_users WHERE id = ?
    `).get(result.lastInsertRowid);
    return res.status(201).json({
      user: safeUser({ ...user, is_active: 1 }),
      ...authPayload(user, secret)
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That username is already in use in this unit' });
    }
    throw error;
  }
});

app.delete('/api/units/users/:id', requireUnit, requireRole('admin'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId === req.unit.userId) {
    return res.status(400).json({ error: 'Cannot deactivate this account' });
  }
  const target = db.prepare(
    'SELECT id, role FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1'
  ).get(userId, req.unit.unitId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') {
    const admins = db.prepare(
      "SELECT count(*) AS total FROM unit_users WHERE unit_id = ? AND role = 'admin' AND is_active = 1"
    ).get(req.unit.unitId).total;
    if (admins <= 1) return res.status(400).json({ error: 'A unit must keep at least one active admin' });
  }
  db.prepare(
    'UPDATE unit_users SET is_active = 0, token_version = token_version + 1 WHERE id = ? AND unit_id = ?'
  ).run(userId, req.unit.unitId);
  audit(req, 'user.deactivate');
  return res.status(204).send();
});

app.post('/api/units/users/:id/reset-mfa', requireUnit, requireRole('admin'), (req, res) => {
  const userId = Number(req.params.id);
  const target = db.prepare(
    'SELECT id FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1'
  ).get(userId, req.unit.unitId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const secret = generateSecret();
  db.transaction(() => {
    db.prepare(`
      UPDATE unit_users SET totp_secret = ?, totp_enabled = 0, totp_last_step = 0,
        token_version = token_version + 1
      WHERE id = ? AND unit_id = ?
    `).run(encryptRecord(req.unit.unitId, { secret }), userId, req.unit.unitId);
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
  })();
  audit(req, 'user.mfa_reset');
  const user = db.prepare(`
    SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
    FROM unit_users WHERE id = ?
  `).get(userId);
  return res.json(authPayload(user, secret));
});

app.get('/api/units/audit', requireUnit, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT events.action, events.record_id, events.created_at, users.username
    FROM audit_events events
    JOIN unit_users users ON users.id = events.user_id
    WHERE events.unit_id = ?
    ORDER BY events.id DESC
    LIMIT 200
  `).all(req.unit.unitId);
  return res.json({ events: rows });
});

app.get('/api/units/records', requireUnit, (req, res) => {
  const rows = db.prepare(
    'SELECT id, ciphertext, created_at, updated_at FROM patient_records WHERE unit_id = ? ORDER BY updated_at DESC'
  ).all(req.unit.unitId);
  const records = rows.map((row) => ({
    id: row.id,
    record: decryptRecord(req.unit.unitId, row.ciphertext),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
  audit(req, 'records.list');
  return res.json({ records });
});

app.post('/api/units/records', requireUnit, requireRole('admin', 'clinician'), (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Record data must be a JSON object' });
  }
  const id = typeof req.body.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(req.body.id)
    ? req.body.id
    : crypto.randomUUID();
  const existing = db.prepare('SELECT unit_id FROM patient_records WHERE id = ?').get(id);
  if (existing) {
    if (existing.unit_id !== req.unit.unitId) return res.status(409).json({ error: 'Record ID already exists' });
    return res.status(200).json({ id, existing: true });
  }
  const ciphertext = encryptRecord(req.unit.unitId, req.body);
  db.prepare(
    'INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)'
  ).run(id, req.unit.unitId, ciphertext);
  audit(req, 'records.create', id);
  return res.status(201).json({ id, record: req.body });
});

app.post('/api/units/records/import', requireUnit, requireRole('admin', 'clinician'), (req, res) => {
  const items = req.body?.records;
  if (!Array.isArray(items) || items.length > 500) {
    return res.status(400).json({ error: 'Provide up to 500 records to import' });
  }
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
        !item.record || typeof item.record !== 'object' || Array.isArray(item.record) ||
        ids.has(item.id)) {
      return res.status(400).json({ error: 'Import contains an invalid or duplicate record ID' });
    }
    ids.add(item.id);
  }

  let imported = 0;
  let skipped = 0;
  try {
    db.transaction(() => {
      for (const item of items) {
        const existing = db.prepare('SELECT unit_id FROM patient_records WHERE id = ?').get(item.id);
        if (existing) {
          if (existing.unit_id !== req.unit.unitId) {
            const conflict = new Error('Record ID already exists outside this unit');
            conflict.status = 409;
            throw conflict;
          }
          skipped += 1;
          continue;
        }
        db.prepare('INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)')
          .run(item.id, req.unit.unitId, encryptRecord(req.unit.unitId, item.record));
        imported += 1;
      }
      audit(req, 'records.import');
    })();
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ error: error.message });
    throw error;
  }
  return res.json({ imported, skipped });
});

app.get('/api/units/records/:id', requireUnit, (req, res) => {
  const row = db.prepare(
    'SELECT id, ciphertext, created_at, updated_at FROM patient_records WHERE id = ? AND unit_id = ?'
  ).get(req.params.id, req.unit.unitId);
  if (!row) return res.status(404).json({ error: 'Patient record not found' });
  audit(req, 'records.read', row.id);
  return res.json({
    id: row.id,
    record: decryptRecord(req.unit.unitId, row.ciphertext),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
});

app.put('/api/units/records/:id', requireUnit, requireRole('admin', 'clinician'), (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Record data must be a JSON object' });
  }
  const exists = db.prepare(
    'SELECT id FROM patient_records WHERE id = ? AND unit_id = ?'
  ).get(req.params.id, req.unit.unitId);
  if (!exists) return res.status(404).json({ error: 'Patient record not found' });
  const ciphertext = encryptRecord(req.unit.unitId, req.body);
  db.prepare(
    "UPDATE patient_records SET ciphertext = ?, updated_at = datetime('now') WHERE id = ? AND unit_id = ?"
  ).run(ciphertext, req.params.id, req.unit.unitId);
  audit(req, 'records.update', req.params.id);
  return res.json({ id: req.params.id, record: req.body });
});

app.delete('/api/units/records/:id', requireUnit, requireRole('admin', 'clinician'), (req, res) => {
  const result = db.prepare(
    'DELETE FROM patient_records WHERE id = ? AND unit_id = ?'
  ).run(req.params.id, req.unit.unitId);
  if (!result.changes) return res.status(404).json({ error: 'Patient record not found' });
  audit(req, 'records.delete', req.params.id);
  return res.status(204).send();
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
