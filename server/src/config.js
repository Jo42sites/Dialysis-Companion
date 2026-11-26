require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  medicalDataKey: required('MEDICAL_DATA_KEY'),
  databasePath: process.env.DATABASE_PATH || './data/dialysis-admin.sqlite',
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500',
  trustProxy: !process.env.TRUST_PROXY || process.env.TRUST_PROXY === '0'
    ? false
    : /^\d+$/.test(process.env.TRUST_PROXY)
      ? Number(process.env.TRUST_PROXY)
      : process.env.TRUST_PROXY
};

if (Buffer.byteLength(module.exports.medicalDataKey, 'utf8') < 32) {
  throw new Error('MEDICAL_DATA_KEY must be at least 32 bytes');
}
if (Buffer.byteLength(module.exports.jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes');
}
