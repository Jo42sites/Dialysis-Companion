require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
  medicalDataKey: required('MEDICAL_DATA_KEY'),
  databasePath: process.env.DATABASE_PATH || './data/dialysis-admin.sqlite',
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5500'
};
