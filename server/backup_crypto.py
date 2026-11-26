import base64
import hashlib
import json
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = "dialysis-companion-encrypted-backup-v1"


def _derive_key(password: str, salt: bytes) -> bytes:
    if not isinstance(password, str) or len(password) < 16:
        raise ValueError("BACKUP_PASSWORD must be at least 16 characters")
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)


def encrypt_backup(plaintext: bytes, password: str) -> bytes:
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    encrypted_and_tag = AESGCM(_derive_key(password, salt)).encrypt(iv, plaintext, None)
    envelope = {
        "format": FORMAT,
        "kdf": "scrypt",
        "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(),
        "tag": base64.b64encode(encrypted_and_tag[-16:]).decode(),
        "data": base64.b64encode(encrypted_and_tag[:-16]).decode(),
    }
    return json.dumps(envelope, separators=(",", ":")).encode()


def decrypt_backup(envelope: bytes, password: str) -> bytes:
    parsed = json.loads(envelope.decode("utf-8"))
    if not isinstance(parsed, dict) or parsed.get("format") != FORMAT or parsed.get("kdf") != "scrypt":
        raise ValueError("Unsupported or invalid encrypted backup format")
    try:
        salt = base64.b64decode(parsed["salt"], validate=True)
        iv = base64.b64decode(parsed["iv"], validate=True)
        tag = base64.b64decode(parsed["tag"], validate=True)
        ciphertext = base64.b64decode(parsed["data"], validate=True)
    except (KeyError, ValueError, TypeError) as error:
        raise ValueError("Invalid encrypted backup data") from error
    if len(salt) != 16 or len(iv) != 12 or len(tag) != 16 or not ciphertext:
        raise ValueError("Invalid encrypted backup data")
    return AESGCM(_derive_key(password, salt)).decrypt(iv, ciphertext + tag, None)
