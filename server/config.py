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
