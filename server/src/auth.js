const jwt = require('jsonwebtoken');
const db = require('./database');
const config = require('./config');

const ISSUER = 'dialysis-companion-admin';

function signUnitToken(user) {
  return jwt.sign({
    sub: String(user.id),
    role: user.role,
    unitId: user.unit_id,
    username: user.username,
    tokenVersion: user.token_version
  }, config.jwtSecret, { expiresIn: config.jwtExpiresIn, issuer: ISSUER });
}

function signSetupToken(user) {
  return jwt.sign({
    sub: String(user.id),
    role: 'mfa_setup',
    unitId: user.unit_id
  }, config.jwtSecret, { expiresIn: '10m', issuer: ISSUER });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: ISSUER });
}

function requireUnit(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(authorization.slice('Bearer '.length));
    if (!['admin', 'clinician', 'viewer'].includes(payload.role)) {
      return res.status(403).json({ error: 'Unit access required' });
    }

    const user = db.prepare(`
      SELECT id, unit_id, username, role, token_version
      FROM unit_users WHERE id = ? AND is_active = 1
    `).get(Number(payload.sub));
    if (!user || user.unit_id !== payload.unitId ||
        user.role !== payload.role || user.token_version !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }

    req.unit = { unitId: user.unit_id, userId: user.id, username: user.username, role: user.role };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.unit || !roles.includes(req.unit.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = { signUnitToken, signSetupToken, verifyToken, requireUnit, requireRole };
