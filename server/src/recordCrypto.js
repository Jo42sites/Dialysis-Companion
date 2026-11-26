const crypto = require('crypto');
const config = require('./config');

function unitKey(unitId) {
  return crypto.createHash('sha256')
    .update(config.medicalDataKey)
    .update(':')
    .update(String(unitId))
    .digest();
}

function encryptRecord(unitId, record) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', unitKey(unitId), iv);
  const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptRecord(unitId, ciphertext) {
  const parts = ciphertext.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted record');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', unitKey(unitId), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptRecord, decryptRecord };
