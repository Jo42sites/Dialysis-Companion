import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


JWT_SECRET = required("JWT_SECRET")
MEDICAL_DATA_KEY = required("MEDICAL_DATA_KEY")
if len(JWT_SECRET.encode("utf-8")) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 bytes")
if len(MEDICAL_DATA_KEY.encode("utf-8")) < 32:
    raise RuntimeError("MEDICAL_DATA_KEY must be at least 32 bytes")

PORT = int(os.getenv("PORT", "3001"))
HOST = os.getenv("HOST", "127.0.0.1")
JWT_EXPIRES_IN = os.getenv("JWT_EXPIRES_IN", "15m")
# Two-step sign-in. Keep this on for clinical data; set MFA_REQUIRED=0 only when
# no authenticator is available. Users with MFA already enrolled still need a code
# once this is turned back on.
MFA_REQUIRED = os.getenv("MFA_REQUIRED", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "off",
)
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "./data/dialysis-admin.sqlite"))
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = Path(__file__).resolve().parent / DATABASE_PATH

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGIN",
        "http://127.0.0.1:5500,http://localhost:5500",
    ).split(",")
    if origin.strip()
]
TRUST_PROXY_VALUE = os.getenv("TRUST_PROXY", "0")
try:
    TRUST_PROXY_HOPS = int(TRUST_PROXY_VALUE)
except ValueError as error:
    raise RuntimeError("TRUST_PROXY must be a non-negative proxy hop count") from error
if TRUST_PROXY_HOPS < 0:
    raise RuntimeError("TRUST_PROXY must be a non-negative proxy hop count")
NODE_ENV = os.getenv("NODE_ENV", "development")
SITE_ADMIN_EMAIL = os.getenv("SITE_ADMIN_EMAIL", "").strip().lower()
SITE_ADMIN_PASSWORD = os.getenv("SITE_ADMIN_PASSWORD", "")
if bool(SITE_ADMIN_EMAIL) != bool(SITE_ADMIN_PASSWORD):
    raise RuntimeError("Set both SITE_ADMIN_EMAIL and SITE_ADMIN_PASSWORD, or leave both unset")
if SITE_ADMIN_PASSWORD and not 12 <= len(SITE_ADMIN_PASSWORD.encode("utf-8")) <= 72:
    raise RuntimeError("SITE_ADMIN_PASSWORD must be 12-72 UTF-8 bytes for bcrypt")
# Passkeys (WebAuthn). RP ID must be the registrable domain; the origin must match
# what the browser sees exactly, or verification fails.
WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "dialysisform.com")
WEBAUTHN_RP_NAME = os.getenv("WEBAUTHN_RP_NAME", "Dialysis Companion")
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "https://dialysisform.com")
