const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');

async function login(username, password) {
  if (!username || !password) return null;
  if (username !== config.adminUsername) return null;

  const valid = await bcrypt.compare(password, config.adminPasswordHash);
  if (!valid) return null;

  const token = jwt.sign(
    { sub: 'admin', role: 'admin', username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'dialysis-companion-admin' }
  );

  return token;
}

function requireAdmin(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authorization.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'dialysis-companion-admin'
    });
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { login, requireAdmin };
