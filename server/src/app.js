const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./database');
const { signUnitToken, requireUnit } = require('./auth');
const { encryptRecord, decryptRecord } = require('./recordCrypto');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/units/register', loginLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const suppliedSlug = String(req.body?.slug || '').trim();
  const password = String(req.body?.password || '');
  const slug = suppliedSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!name) return res.status(400).json({ error: 'Unit name is required' });
  if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) {
    return res.status(400).json({ error: 'Unit slug must contain 3-50 letters, numbers, or hyphens' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must contain at least 12 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO units (name, slug, password_hash) VALUES (?, ?, ?)'
    ).run(name, slug, passwordHash);
    const unit = db.prepare('SELECT id, name, slug FROM units WHERE id = ?')
      .get(result.lastInsertRowid);
    return res.status(201).json({
      unit,
      token: signUnitToken(unit)
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That unit slug is already in use' });
    }
    throw error;
  }
});

app.post('/api/units/login', loginLimiter, async (req, res) => {
  const slug = String(req.body?.slug || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const unit = db.prepare('SELECT id, name, slug, password_hash FROM units WHERE slug = ?')
    .get(slug);

  if (!unit || !(await bcrypt.compare(password, unit.password_hash))) {
    return res.status(401).json({ error: 'Invalid unit credentials' });
  }

  return res.json({
    unit: { id: unit.id, name: unit.name, slug: unit.slug },
    token: signUnitToken(unit)
  });
});

app.get('/api/units/me', requireUnit, (req, res) => {
  const unit = db.prepare('SELECT id, name, slug FROM units WHERE id = ?')
    .get(req.unit.unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  return res.json({ unit });
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
  return res.json({ records });
});

app.post('/api/units/records', requireUnit, (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Record data is required' });
  }
  const id = crypto.randomUUID();
  const ciphertext = encryptRecord(req.unit.unitId, req.body);
  db.prepare(
    'INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)'
  ).run(id, req.unit.unitId, ciphertext);
  return res.status(201).json({ id, record: req.body });
});

app.get('/api/units/records/:id', requireUnit, (req, res) => {
  const row = db.prepare(
    'SELECT id, ciphertext, created_at, updated_at FROM patient_records WHERE id = ? AND unit_id = ?'
  ).get(req.params.id, req.unit.unitId);
  if (!row) return res.status(404).json({ error: 'Patient record not found' });
  return res.json({
    id: row.id,
    record: decryptRecord(req.unit.unitId, row.ciphertext),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
});

app.put('/api/units/records/:id', requireUnit, (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Record data is required' });
  }
  const exists = db.prepare(
    'SELECT id FROM patient_records WHERE id = ? AND unit_id = ?'
  ).get(req.params.id, req.unit.unitId);
  if (!exists) return res.status(404).json({ error: 'Patient record not found' });

  const ciphertext = encryptRecord(req.unit.unitId, req.body);
  db.prepare(
    "UPDATE patient_records SET ciphertext = ?, updated_at = datetime('now') WHERE id = ? AND unit_id = ?"
  ).run(ciphertext, req.params.id, req.unit.unitId);
  return res.json({ id: req.params.id, record: req.body });
});

app.delete('/api/units/records/:id', requireUnit, (req, res) => {
  const result = db.prepare(
    'DELETE FROM patient_records WHERE id = ? AND unit_id = ?'
  ).run(req.params.id, req.unit.unitId);
  if (!result.changes) return res.status(404).json({ error: 'Patient record not found' });
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
