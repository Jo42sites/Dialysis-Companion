const jwt = require('jsonwebtoken');
const config = require('./config');

function signUnitToken(unit) {
  const token = jwt.sign(
    { sub: String(unit.id), role: 'unit', unitId: unit.id, unitSlug: unit.slug },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'dialysis-companion-admin' }
  );
  return token;
}

function requireUnit(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authorization.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'dialysis-companion-admin'
    });
    if (payload.role !== 'unit') {
      return res.status(403).json({ error: 'Unit access required' });
    }
    req.unit = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signUnitToken, requireUnit };
