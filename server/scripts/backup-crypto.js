const crypto = require('crypto');

const FORMAT = 'dialysis-companion-encrypted-backup-v1';

function deriveBackupKey(password, salt) {
  if (typeof password !== 'string' || password.length < 16) {
    throw new Error('BACKUP_PASSWORD must be at least 16 characters');
  }
  return crypto.scryptSync(password, salt, 32);
}

function encryptBackup(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveBackupKey(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.from(JSON.stringify({
    format: FORMAT,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  }));
}

function decryptBackup(envelope, password) {
  const parsed = JSON.parse(envelope.toString('utf8'));
  if (!parsed || parsed.format !== FORMAT || parsed.kdf !== 'scrypt') {
    throw new Error('Unsupported or invalid encrypted backup format');
  }
  const salt = Buffer.from(parsed.salt, 'base64');
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const ciphertext = Buffer.from(parsed.data, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Invalid encrypted backup data');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveBackupKey(password, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encryptBackup, decryptBackup };
