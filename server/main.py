import base64
import bcrypt
import hashlib
import hmac
import json
import logging
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
import pyotp
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import config
from database import get_database, initialize_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dialysis-companion")

ISSUER = "dialysis-companion-admin"
ALLOWED_ROLES = {"admin", "clinician", "viewer"}
MAX_BODY_BYTES = 1024 * 1024
UNIT_SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{2,49}$")
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{3,50}$")
RECORD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
RECOVERY_CODE_PATTERN = re.compile(r"^[a-f0-9]{16}$", re.IGNORECASE)

initialize_database()
dummy_password_hash = bcrypt.hashpw(
    str(uuid.uuid4()).encode("utf-8"), bcrypt.gensalt(rounds=12)
)
site_admin_credential_version = hashlib.sha256(
    f"{config.SITE_ADMIN_EMAIL}\0{config.SITE_ADMIN_PASSWORD}".encode("utf-8")
).hexdigest()
app = FastAPI(title="Dialysis Companion API", docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def json_error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


@app.exception_handler(HTTPException)
async def handle_http_error(_request: Request, error: HTTPException) -> JSONResponse:
    return json_error(error.status_code, str(error.detail))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, _error: RequestValidationError
) -> JSONResponse:
    return json_error(400, "Invalid request")


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, error: Exception) -> JSONResponse:
    logger.exception("Unhandled API error", exc_info=error)
    return json_error(500, "Internal server error")


rate_lock = threading.Lock()
rate_windows: dict[tuple[str, str], tuple[float, int]] = {}


def rate_limit(request: Request, scope: str, limit: int, window: int) -> bool:
    client_ip = request.client.host if request.client else "unknown"
    if config.TRUST_PROXY_HOPS:
        forwarded_chain = [
            item.strip()
            for item in request.headers.get("x-forwarded-for", "").split(",")
            if item.strip()
        ]
        if len(forwarded_chain) >= config.TRUST_PROXY_HOPS:
            client_ip = forwarded_chain[-config.TRUST_PROXY_HOPS]
    key = (scope, client_ip)
    now = time.monotonic()
    with rate_lock:
        start, count = rate_windows.get(key, (now, 0))
        if now - start >= window:
            start, count = now, 0
        if count >= limit:
            rate_windows[key] = (start, count)
            return False
        rate_windows[key] = (start, count + 1)
        if len(rate_windows) > 5000:
            rate_windows_copy = {
                item: data
                for item, data in rate_windows.items()
                if now - data[0] < 3600
            }
            rate_windows.clear()
            rate_windows.update(rate_windows_copy)
        return True


def request_is_https(request: Request) -> bool:
    """True when the original visitor used HTTPS.

    Behind Cloudflare -> Nginx Proxy Manager -> Traefik the last hop is plain
    HTTP, so X-Forwarded-Proto often arrives as "http". Cloudflare also sets
    CF-Visitor, and NPM may set X-Forwarded-Ssl; any of them proves the visitor
    side was encrypted. Client-supplied copies are overwritten by Cloudflare.
    """
    if not config.TRUST_PROXY_HOPS:
        return request.url.scheme == "https"
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    if forwarded_proto == "https":
        return True
    cf_visitor = request.headers.get("cf-visitor", "").replace(" ", "").lower()
    if '"scheme":"https"' in cf_visitor:
        return True
    return request.headers.get("x-forwarded-ssl", "").strip().lower() == "on"


@app.middleware("http")
async def api_safety_middleware(request: Request, call_next: Any) -> Response:
    if request.url.path.startswith("/api") and request.url.path != "/api/health":
        if config.NODE_ENV == "production":
            if not request_is_https(request):
                logger.warning(
                    "Rejected %s: no HTTPS proof (x-forwarded-proto=%r cf-visitor=%r x-forwarded-ssl=%r)",
                    request.url.path,
                    request.headers.get("x-forwarded-proto"),
                    request.headers.get("cf-visitor"),
                    request.headers.get("x-forwarded-ssl"),
                )
                return json_error(426, "HTTPS is required")
        if not rate_limit(request, "api", 100, 15 * 60):
            return json_error(429, "Too many requests. Try again later.")

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def body_object(payload: Any) -> dict[str, Any]:
    return payload if isinstance(payload, dict) else {}


async def read_json(request: Request) -> Any:
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body is too large")
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body is too large")
    try:
        return json.loads(raw) if raw else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None


def password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def valid_password(password: Any) -> bool:
    return isinstance(password, str) and 12 <= len(password) <= 256


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password_bytes(password), bcrypt.gensalt(rounds=rounds)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password_bytes(password), password_hash.encode())
    except (ValueError, TypeError):
        return False


site_admin_password_hash = (
    hash_password(config.SITE_ADMIN_PASSWORD)
    if config.SITE_ADMIN_PASSWORD
    else dummy_password_hash.decode()
)


def unit_key(unit_id: int) -> bytes:
    return hashlib.sha256(
        config.MEDICAL_DATA_KEY.encode("utf-8") + b":" + str(unit_id).encode("ascii")
    ).digest()


def encrypt_record(unit_id: int, record: Any) -> str:
    nonce = secrets.token_bytes(12)
    encrypted_and_tag = AESGCM(unit_key(unit_id)).encrypt(
        nonce, json.dumps(record, separators=(",", ":"), ensure_ascii=False).encode(), None
    )
    ciphertext, tag = encrypted_and_tag[:-16], encrypted_and_tag[-16:]
    return ".".join(
        base64.b64encode(value).decode("ascii") for value in (nonce, tag, ciphertext)
    )


def decrypt_record(unit_id: int, encrypted: str) -> Any:
    parts = encrypted.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted record")
    nonce, tag, ciphertext = (base64.b64decode(value, validate=True) for value in parts)
    if len(nonce) != 12 or len(tag) != 16:
        raise ValueError("Invalid encrypted record")
    plaintext = AESGCM(unit_key(unit_id)).decrypt(nonce, ciphertext + tag, None)
    return json.loads(plaintext)


def expiry_delta(value: str) -> timedelta:
    match = re.fullmatch(r"(\d+)([smhd])", value)
    if not match:
        raise RuntimeError("JWT_EXPIRES_IN must be a duration such as 15m")
    amount = int(match.group(1))
    return {
        "s": timedelta(seconds=amount),
        "m": timedelta(minutes=amount),
        "h": timedelta(hours=amount),
        "d": timedelta(days=amount),
    }[match.group(2)]


def make_token(claims: dict[str, Any], lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {**claims, "iat": now, "exp": now + lifetime, "iss": ISSUER},
        config.JWT_SECRET,
        algorithm="HS256",
    )


def sign_unit_token(user: sqlite3.Row | dict[str, Any]) -> str:
    return make_token(
        {
            "sub": str(user["id"]),
            "role": user["role"],
            "unitId": user["unit_id"],
            "username": user["username"],
            "tokenVersion": user["token_version"],
        },
        expiry_delta(config.JWT_EXPIRES_IN),
    )


def sign_site_admin_token() -> str:
    return make_token(
        {
            "sub": config.SITE_ADMIN_EMAIL,
            "email": config.SITE_ADMIN_EMAIL,
            "role": "site_admin",
            "credentialVersion": site_admin_credential_version,
        },
        expiry_delta(config.JWT_EXPIRES_IN),
    )


def sign_setup_token(user: sqlite3.Row | dict[str, Any]) -> str:
    return make_token(
        {"sub": str(user["id"]), "role": "mfa_setup", "unitId": user["unit_id"]},
        timedelta(minutes=10),
    )


def verify_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(
        token, config.JWT_SECRET, algorithms=["HS256"], issuer=ISSUER
    )
    return payload


def auth_payload(user: sqlite3.Row | dict[str, Any], secret: str) -> dict[str, Any]:
    return {
        "mfaSetupRequired": True,
        "setupToken": sign_setup_token(user),
        "secret": secret,
        "otpAuthUrl": pyotp.TOTP(secret).provisioning_uri(
            name=user["username"], issuer_name="Dialysis Companion"
        ),
    }


def safe_user(user: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "active": bool(user["is_active"]),
        "createdAt": user["created_at"],
    }


def session_payload(
    user: sqlite3.Row | dict[str, Any], unit: dict[str, Any]
) -> dict[str, Any]:
    return {
        "unit": unit,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
        },
        "token": sign_unit_token(user),
    }


def audit(
    connection: sqlite3.Connection,
    unit_id: int,
    user_id: int,
    action: str,
    record_id: str | None = None,
) -> None:
    connection.execute(
        "INSERT INTO audit_events (unit_id, user_id, action, record_id) VALUES (?, ?, ?, ?)",
        (unit_id, user_id, action, record_id),
    )


def decode_setup_user(
    payload: Any, connection: sqlite3.Connection
) -> sqlite3.Row:
    setup_token = body_object(payload).get("setupToken")
    if not isinstance(setup_token, str):
        raise HTTPException(status_code=401, detail="MFA setup session required")
    try:
        claims = verify_token(setup_token)
        if claims.get("role") != "mfa_setup":
            raise ValueError("invalid setup role")
        user = connection.execute(
            """
            SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
            FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1
            """,
            (int(claims["sub"]), claims["unitId"]),
        ).fetchone()
        if not user or user["totp_enabled"]:
            raise ValueError("invalid setup user")
        return user
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401, detail="MFA setup session is invalid or expired"
        ) from None


def valid_totp(secret: str, token: Any) -> int | None:
    if not isinstance(token, str) or not re.fullmatch(r"\d{6}", token):
        return None
    current_step = int(time.time() // 30)
    totp = pyotp.TOTP(secret)
    for step in (current_step - 1, current_step, current_step + 1):
        if step >= 0 and hmac.compare_digest(totp.generate_otp(step), token):
            return step
    return None


def consume_recovery_code(
    connection: sqlite3.Connection, user_id: int, submitted: Any
) -> bool:
    if not isinstance(submitted, str) or not RECOVERY_CODE_PATTERN.fullmatch(submitted):
        return False
    codes = connection.execute(
        "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL",
        (user_id,),
    ).fetchall()
    for code in codes:
        if verify_password(submitted.lower(), code["code_hash"]):
            updated = connection.execute(
                "UPDATE mfa_recovery_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL",
                (code["id"],),
            )
            return updated.rowcount == 1
    return False


@contextmanager
def immediate_transaction(connection: sqlite3.Connection):
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield
    except Exception:
        connection.rollback()
        raise


def current_unit(
    authorization: str | None = Header(default=None),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        claims = verify_token(authorization[len("Bearer ") :])
        role = claims.get("role")
        if not isinstance(role, str) or role not in ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="Unit access required")
        user = connection.execute(
            """
            SELECT users.id, users.unit_id, users.username, users.role,
              users.token_version
            FROM unit_users users JOIN units ON units.id = users.unit_id
            WHERE users.id = ? AND users.is_active = 1 AND units.is_active = 1
            """,
            (int(claims["sub"]),),
        ).fetchone()
        if (
            not user
            or user["unit_id"] != claims.get("unitId")
            or user["role"] != role
            or user["token_version"] != claims.get("tokenVersion")
        ):
            raise HTTPException(status_code=401, detail="Session is no longer valid")
        return {
            "unitId": user["unit_id"],
            "userId": user["id"],
            "username": user["username"],
            "role": user["role"],
        }
    except HTTPException:
        raise
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None


def require_site_admin(
    authorization: str | None = Header(default=None),
) -> str:
    if not config.SITE_ADMIN_EMAIL or not config.SITE_ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Site administrator is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        claims = verify_token(authorization[len("Bearer ") :])
        if (
            claims.get("role") != "site_admin"
            or claims.get("email") != config.SITE_ADMIN_EMAIL
            or claims.get("credentialVersion") != site_admin_credential_version
        ):
            raise ValueError("invalid administrator session")
        return config.SITE_ADMIN_EMAIL
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired administrator session") from None


def require_admin(unit: dict[str, Any] = Depends(current_unit)) -> dict[str, Any]:
    if unit["role"] != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return unit


def require_editor(unit: dict[str, Any] = Depends(current_unit)) -> dict[str, Any]:
    if unit["role"] not in ("admin", "clinician"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return unit


def fail_if_limited(request: Request, scope: str, limit: int, window: int, message: str):
    if not rate_limit(request, scope, limit, window):
        raise HTTPException(status_code=429, detail=message)


def row_unit(unit: sqlite3.Row) -> dict[str, Any]:
    return {"id": unit["id"], "name": unit["name"], "slug": unit["slug"]}


def safe_guide_account(account: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    return {
        "id": account["id"],
        "email": account["email"],
        "active": bool(account["is_active"]),
        "createdAt": account["created_at"],
        "lastLoginAt": account["last_login_at"],
    }


def site_admin_audit(
    connection: sqlite3.Connection,
    admin_email: str,
    action: str,
    *,
    unit_id: int | None = None,
    account_id: int | None = None,
    record_id: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO site_admin_audit
          (admin_email, action, unit_id, account_id, record_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (admin_email, action, unit_id, account_id, record_id),
    )


def get_admin_unit(connection: sqlite3.Connection, unit_id: int) -> sqlite3.Row:
    unit = connection.execute(
        "SELECT id, name, slug, is_active FROM units WHERE id = ?", (unit_id,)
    ).fetchone()
    if not unit:
        raise HTTPException(status_code=404, detail="Dialysis unit not found")
    return unit


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/site-admin/login")
async def login_site_admin(request: Request) -> dict[str, str]:
    fail_if_limited(
        request, "site_admin_login", 5, 15 * 60,
        "Too many administrator login attempts. Try again later.",
    )
    if not config.SITE_ADMIN_EMAIL or not config.SITE_ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Site administrator is not configured")
    body = body_object(await read_json(request))
    email = str(body.get("email") or "").strip().lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    email_matches = hmac.compare_digest(email, config.SITE_ADMIN_EMAIL)
    password_matches = verify_password(password, site_admin_password_hash)
    if not email_matches or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid administrator email or password")
    return {"token": sign_site_admin_token(), "email": config.SITE_ADMIN_EMAIL}


@app.get("/api/site-admin/overview")
def site_admin_overview(
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, int]:
    totals = connection.execute(
        """
        SELECT
          (SELECT count(*) FROM guide_accounts) AS accounts,
          (SELECT count(*) FROM units) AS units,
          (SELECT count(*) FROM unit_users) AS staff,
          (SELECT count(*) FROM patient_records) AS records
        """
    ).fetchone()
    site_admin_audit(connection, admin_email, "overview.read")
    return dict(totals)


@app.get("/api/site-admin/audit")
def site_admin_audit_log(
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    events = connection.execute(
        """
        SELECT events.action, events.unit_id, units.name AS unit_name,
          events.account_id, events.record_id, events.created_at
        FROM site_admin_audit events
        LEFT JOIN units ON units.id = events.unit_id
        ORDER BY events.id DESC LIMIT 200
        """
    ).fetchall()
    site_admin_audit(connection, admin_email, "audit.read")
    return {"events": [dict(event) for event in events]}


@app.get("/api/site-admin/accounts")
def site_admin_accounts(
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    accounts = connection.execute(
        """
        SELECT id, email, is_active, created_at, last_login_at
        FROM guide_accounts ORDER BY created_at DESC LIMIT 500
        """
    ).fetchall()
    site_admin_audit(connection, admin_email, "accounts.list")
    return {"accounts": [safe_guide_account(account) for account in accounts]}


@app.patch("/api/site-admin/accounts/{account_id}")
async def update_site_admin_account(
    account_id: int,
    request: Request,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, bool]:
    body = body_object(await read_json(request))
    active = body.get("active")
    if not isinstance(active, bool):
        raise HTTPException(status_code=400, detail="Active must be true or false")
    updated = connection.execute(
        """
        UPDATE guide_accounts SET is_active = ?, token_version = token_version + 1,
          updated_at = datetime('now') WHERE id = ?
        """,
        (int(active), account_id),
    )
    if not updated.rowcount:
        raise HTTPException(status_code=404, detail="Account not found")
    site_admin_audit(
        connection, admin_email, "account.status", account_id=account_id
    )
    return {"active": active}


@app.get("/api/site-admin/units")
def site_admin_units(
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    units = connection.execute(
        """
        SELECT units.id, units.name, units.slug, units.is_active,
          (SELECT count(*) FROM unit_users WHERE unit_id = units.id) AS staff_count,
          (SELECT count(*) FROM patient_records WHERE unit_id = units.id) AS record_count
        FROM units ORDER BY units.name COLLATE NOCASE LIMIT 500
        """
    ).fetchall()
    site_admin_audit(connection, admin_email, "units.list")
    return {
        "units": [
            {
                "id": unit["id"],
                "name": unit["name"],
                "slug": unit["slug"],
                "active": bool(unit["is_active"]),
                "staffCount": unit["staff_count"],
                "recordCount": unit["record_count"],
            }
            for unit in units
        ]
    }


@app.patch("/api/site-admin/units/{unit_id}")
async def update_site_admin_unit(
    unit_id: int,
    request: Request,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, bool]:
    body = body_object(await read_json(request))
    active = body.get("active")
    if not isinstance(active, bool):
        raise HTTPException(status_code=400, detail="Active must be true or false")
    get_admin_unit(connection, unit_id)
    with immediate_transaction(connection):
        connection.execute(
            """
            UPDATE units SET is_active = ?, updated_at = datetime('now') WHERE id = ?
            """,
            (int(active), unit_id),
        )
        if not active:
            connection.execute(
                "UPDATE unit_users SET token_version = token_version + 1 WHERE unit_id = ?",
                (unit_id,),
            )
        site_admin_audit(
            connection, admin_email, "unit.status", unit_id=unit_id
        )
    return {"active": active}


@app.get("/api/site-admin/units/{unit_id}/staff")
def site_admin_staff(
    unit_id: int,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    get_admin_unit(connection, unit_id)
    staff = connection.execute(
        """
        SELECT id, username, role, is_active, created_at
        FROM unit_users WHERE unit_id = ? ORDER BY username COLLATE NOCASE
        """,
        (unit_id,),
    ).fetchall()
    site_admin_audit(connection, admin_email, "unit.staff.list", unit_id=unit_id)
    return {
        "staff": [
            {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "active": bool(user["is_active"]),
                "createdAt": user["created_at"],
            }
            for user in staff
        ]
    }


@app.patch("/api/site-admin/units/{unit_id}/staff/{user_id}")
async def update_site_admin_staff(
    unit_id: int,
    user_id: int,
    request: Request,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, bool]:
    body = body_object(await read_json(request))
    active = body.get("active")
    if not isinstance(active, bool):
        raise HTTPException(status_code=400, detail="Active must be true or false")
    get_admin_unit(connection, unit_id)
    updated = connection.execute(
        """
        UPDATE unit_users SET is_active = ?, token_version = token_version + 1
        WHERE id = ? AND unit_id = ?
        """,
        (int(active), user_id, unit_id),
    )
    if not updated.rowcount:
        raise HTTPException(status_code=404, detail="Unit staff account not found")
    site_admin_audit(
        connection, admin_email, "unit.staff.status",
        unit_id=unit_id, account_id=user_id,
    )
    return {"active": active}


@app.get("/api/site-admin/units/{unit_id}/records")
def site_admin_records(
    unit_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    get_admin_unit(connection, unit_id)
    total = connection.execute(
        "SELECT count(*) AS total FROM patient_records WHERE unit_id = ?",
        (unit_id,),
    ).fetchone()["total"]
    rows = connection.execute(
        """
        SELECT id, ciphertext, created_at, updated_at FROM patient_records
        WHERE unit_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?
        """,
        (unit_id, limit, offset),
    ).fetchall()
    try:
        records = []
        for row in rows:
            record = decrypt_record(unit_id, row["ciphertext"])
            if not isinstance(record, dict):
                raise ValueError("Invalid patient record")
            records.append(
                {
                    "id": row["id"],
                    "patientName": record.get("name") or record.get("patientName") or "—",
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                }
            )
    except (ValueError, json.JSONDecodeError):
        logger.exception("Could not decrypt a patient record for site admin")
        raise HTTPException(status_code=500, detail="A patient record could not be decrypted") from None
    site_admin_audit(connection, admin_email, "records.list", unit_id=unit_id)
    return {"records": records, "total": total, "limit": limit, "offset": offset}


@app.get("/api/site-admin/units/{unit_id}/records/{record_id}")
def site_admin_record(
    unit_id: int,
    record_id: str,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    get_admin_unit(connection, unit_id)
    row = connection.execute(
        """
        SELECT id, ciphertext, created_at, updated_at FROM patient_records
        WHERE id = ? AND unit_id = ?
        """,
        (record_id, unit_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Patient record not found")
    try:
        record = decrypt_record(unit_id, row["ciphertext"])
    except (ValueError, json.JSONDecodeError):
        logger.exception("Could not decrypt a patient record for site admin")
        raise HTTPException(status_code=500, detail="Patient record could not be decrypted") from None
    site_admin_audit(
        connection, admin_email, "record.read", unit_id=unit_id, record_id=record_id
    )
    return {
        "id": row["id"],
        "record": record,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.post("/api/site-admin/units/{unit_id}/records", status_code=201)
async def site_admin_create_record(
    unit_id: int,
    request: Request,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    get_admin_unit(connection, unit_id)
    body = body_object(await read_json(request))
    record_id = body.get("id")
    record = body.get("record")
    if not isinstance(record_id, str) or not RECORD_ID_PATTERN.fullmatch(record_id):
        raise HTTPException(status_code=400, detail="Record ID is invalid")
    if not isinstance(record, dict):
        raise HTTPException(status_code=400, detail="Record data must be a JSON object")
    record = {**record, "id": record_id}
    try:
        connection.execute(
            "INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)",
            (record_id, unit_id, encrypt_record(unit_id, record)),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Record ID already exists") from None
    site_admin_audit(
        connection, admin_email, "record.create", unit_id=unit_id, record_id=record_id
    )
    return {"id": record_id, "record": record}


@app.put("/api/site-admin/units/{unit_id}/records/{record_id}")
async def site_admin_update_record(
    unit_id: int,
    record_id: str,
    request: Request,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    get_admin_unit(connection, unit_id)
    record = await read_json(request)
    if not isinstance(record, dict):
        raise HTTPException(status_code=400, detail="Record data must be a JSON object")
    record = {**record, "id": record_id}
    updated = connection.execute(
        """
        UPDATE patient_records SET ciphertext = ?, updated_at = datetime('now')
        WHERE id = ? AND unit_id = ?
        """,
        (encrypt_record(unit_id, record), record_id, unit_id),
    )
    if not updated.rowcount:
        raise HTTPException(status_code=404, detail="Patient record not found")
    site_admin_audit(
        connection, admin_email, "record.update", unit_id=unit_id, record_id=record_id
    )
    return {"id": record_id, "record": record}


@app.delete("/api/site-admin/units/{unit_id}/records/{record_id}", status_code=204)
def site_admin_delete_record(
    unit_id: int,
    record_id: str,
    admin_email: str = Depends(require_site_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> Response:
    get_admin_unit(connection, unit_id)
    deleted = connection.execute(
        "DELETE FROM patient_records WHERE id = ? AND unit_id = ?",
        (record_id, unit_id),
    )
    if not deleted.rowcount:
        raise HTTPException(status_code=404, detail="Patient record not found")
    site_admin_audit(
        connection, admin_email, "record.delete", unit_id=unit_id, record_id=record_id
    )
    return Response(status_code=204)


@app.post("/api/units/register", status_code=201)
async def register_unit(
    request: Request,
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    fail_if_limited(
        request, "registration", 5, 60 * 60,
        "Too many unit registration attempts. Try again later.",
    )
    body = body_object(await read_json(request))
    name = str(body.get("name") or "").strip()
    supplied_slug = str(body.get("slug") or "").strip()
    username = str(body.get("username") or "").strip().lower()
    password = body.get("password")
    slug = re.sub(r"-+", "-", re.sub(r"[^a-z0-9-]", "-", supplied_slug.lower())).strip("-")

    if not name or len(name) > 120:
        raise HTTPException(status_code=400, detail="Enter a unit name (maximum 120 characters)")
    if not UNIT_SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(
            status_code=400,
            detail="Unit login code must contain 3-50 letters, numbers, or hyphens",
        )
    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-50 letters, numbers, dots, underscores, or hyphens",
        )
    if not valid_password(password):
        raise HTTPException(status_code=400, detail="Password must be 12-256 characters")

    secret = pyotp.random_base32()
    password_hash = hash_password(password)
    retired_unit_hash = hash_password(str(uuid.uuid4()))
    try:
        with immediate_transaction(connection):
            result = connection.execute(
                "INSERT INTO units (name, slug, password_hash) VALUES (?, ?, ?)",
                (name, slug, retired_unit_hash),
            )
            unit_id = result.lastrowid
            user_result = connection.execute(
                """
                INSERT INTO unit_users (unit_id, username, password_hash, role, totp_secret)
                VALUES (?, ?, ?, 'admin', ?)
                """,
                (unit_id, username, password_hash, encrypt_record(unit_id, {"secret": secret})),
            )
            user = connection.execute(
                """
                SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
                FROM unit_users WHERE id = ?
                """,
                (user_result.lastrowid,),
            ).fetchone()
            audit(connection, unit_id, user["id"], "unit.register")
    except sqlite3.IntegrityError as error:
        if "UNIQUE" in str(error).upper():
            raise HTTPException(
                status_code=409, detail="That unit login code is already in use"
            ) from None
        raise

    if not config.MFA_REQUIRED:
        return session_payload(user, {"name": name, "slug": slug})
    return {"unit": {"name": name, "slug": slug}, **auth_payload(user, secret)}


@app.post("/api/units/login")
async def login(
    request: Request,
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    fail_if_limited(request, "login", 5, 15 * 60, "Too many login attempts. Try again later.")
    body = body_object(await read_json(request))
    slug = str(body.get("slug") or "").strip().lower()
    username = str(body.get("username") or "").strip().lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    user = connection.execute(
        """
        SELECT users.*, units.slug, units.name AS unit_name
        FROM unit_users users JOIN units ON units.id = users.unit_id
        WHERE units.slug = ? AND users.username = ? AND users.is_active = 1
          AND units.is_active = 1
        """,
        (slug, username),
    ).fetchone()
    password_hash = user["password_hash"] if user else dummy_password_hash.decode()
    password_valid = verify_password(password, password_hash)
    if not user or not password_valid:
        raise HTTPException(status_code=401, detail="Invalid unit, username, or password")

    secret = decrypt_record(user["unit_id"], user["totp_secret"])["secret"]
    unit = {"id": user["unit_id"], "name": user["unit_name"], "slug": user["slug"]}
    if not config.MFA_REQUIRED:
        audit(connection, user["unit_id"], user["id"], "auth.login_no_mfa")
        return session_payload(user, unit)
    if not user["totp_enabled"]:
        return {"unit": unit, **auth_payload(user, secret)}

    totp_step = valid_totp(secret, body.get("code"))
    totp_valid = False
    if totp_step is not None:
        updated = connection.execute(
            """
            UPDATE unit_users SET totp_last_step = ?
            WHERE id = ? AND totp_enabled = 1 AND totp_last_step < ?
            """,
            (totp_step, user["id"], totp_step),
        )
        totp_valid = updated.rowcount == 1
    recovery_valid = False if totp_step is not None else consume_recovery_code(
        connection, user["id"], body.get("code")
    )
    if not totp_valid and not recovery_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid unit, username, password, or verification code",
        )
    audit(
        connection,
        user["unit_id"],
        user["id"],
        "auth.login_recovery_code" if recovery_valid else "auth.login",
    )
    return session_payload(user, unit)


@app.post("/api/units/mfa/confirm")
async def confirm_mfa(
    request: Request,
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    body = await read_json(request)
    user = decode_setup_user(body, connection)
    secret = decrypt_record(user["unit_id"], user["totp_secret"])["secret"]
    step = valid_totp(secret, body_object(body).get("code"))
    if step is None:
        raise HTTPException(
            status_code=400,
            detail="Verification code is invalid. Check your authenticator app and try again.",
        )

    recovery_codes = [secrets.token_hex(8) for _ in range(10)]
    hashes = [hash_password(code, rounds=10) for code in recovery_codes]
    with immediate_transaction(connection):
        updated = connection.execute(
            "UPDATE unit_users SET totp_enabled = 1, totp_last_step = ? WHERE id = ? AND totp_enabled = 0",
            (step, user["id"]),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=401, detail="MFA enrollment is no longer available")
        connection.executemany(
            "INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)",
            [(user["id"], hashed) for hashed in hashes],
        )
        audit(connection, user["unit_id"], user["id"], "auth.mfa_enabled")
    updated_user = connection.execute(
        "SELECT * FROM unit_users WHERE id = ?", (user["id"],)
    ).fetchone()
    unit = connection.execute(
        "SELECT id, name, slug FROM units WHERE id = ?", (user["unit_id"],)
    ).fetchone()
    return {
        "unit": row_unit(unit),
        "user": {
            "id": updated_user["id"],
            "username": updated_user["username"],
            "role": updated_user["role"],
        },
        "token": sign_unit_token(updated_user),
        "recoveryCodes": recovery_codes,
    }


@app.get("/api/units/me")
def get_me(
    unit: dict[str, Any] = Depends(current_unit),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    result = connection.execute(
        "SELECT id, name, slug FROM units WHERE id = ?", (unit["unitId"],)
    ).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {
        "unit": row_unit(result),
        "user": {
            "id": unit["userId"],
            "username": unit["username"],
            "role": unit["role"],
        },
    }


@app.put("/api/units/me/password", status_code=204)
async def update_password(
    request: Request,
    unit: dict[str, Any] = Depends(current_unit),
    connection: sqlite3.Connection = Depends(get_database),
) -> Response:
    body = body_object(await read_json(request))
    current_password = body.get("currentPassword")
    new_password = body.get("newPassword")
    user = connection.execute(
        "SELECT password_hash FROM unit_users WHERE id = ?", (unit["userId"],)
    ).fetchone()
    if not user or not verify_password(
        current_password if isinstance(current_password, str) else "",
        user["password_hash"],
    ):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if not valid_password(new_password):
        raise HTTPException(status_code=400, detail="New password must be 12-256 characters")
    connection.execute(
        """
        UPDATE unit_users SET password_hash = ?, token_version = token_version + 1
        WHERE id = ? AND unit_id = ?
        """,
        (hash_password(new_password), unit["userId"], unit["unitId"]),
    )
    audit(connection, unit["unitId"], unit["userId"], "user.password_change")
    return Response(status_code=204)


@app.get("/api/units/users")
def list_users(
    unit: dict[str, Any] = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    users = connection.execute(
        """
        SELECT id, username, role, is_active, created_at
        FROM unit_users WHERE unit_id = ? ORDER BY created_at
        """,
        (unit["unitId"],),
    ).fetchall()
    return {"users": [safe_user(user) for user in users]}


@app.post("/api/units/users", status_code=201)
async def add_user(
    request: Request,
    unit: dict[str, Any] = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    body = body_object(await read_json(request))
    username = str(body.get("username") or "").strip().lower()
    password = body.get("password")
    role = body.get("role")
    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-50 letters, numbers, dots, underscores, or hyphens",
        )
    if not valid_password(password):
        raise HTTPException(status_code=400, detail="Password must be 12-256 characters")
    if not isinstance(role, str) or role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Role must be admin, clinician, or viewer")

    secret = pyotp.random_base32()
    try:
        result = connection.execute(
            """
            INSERT INTO unit_users (unit_id, username, password_hash, role, totp_secret)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                unit["unitId"],
                username,
                hash_password(password),
                role,
                encrypt_record(unit["unitId"], {"secret": secret}),
            ),
        )
    except sqlite3.IntegrityError as error:
        if "UNIQUE" in str(error).upper():
            raise HTTPException(
                status_code=409,
                detail="That username is already in use in this unit",
            ) from None
        raise
    audit(connection, unit["unitId"], unit["userId"], "user.create")
    user = connection.execute(
        """
        SELECT id, unit_id, username, role, totp_secret, totp_enabled,
          token_version, created_at, is_active
        FROM unit_users WHERE id = ?
        """,
        (result.lastrowid,),
    ).fetchone()
    return {"user": safe_user(user), **auth_payload(user, secret)}


@app.delete("/api/units/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: int,
    unit: dict[str, Any] = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> Response:
    if user_id == unit["userId"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate this account")
    target = connection.execute(
        "SELECT id, role FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1",
        (user_id, unit["unitId"]),
    ).fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        count = connection.execute(
            "SELECT count(*) AS total FROM unit_users WHERE unit_id = ? AND role = 'admin' AND is_active = 1",
            (unit["unitId"],),
        ).fetchone()["total"]
        if count <= 1:
            raise HTTPException(
                status_code=400, detail="A unit must keep at least one active admin"
            )
    connection.execute(
        "UPDATE unit_users SET is_active = 0, token_version = token_version + 1 WHERE id = ? AND unit_id = ?",
        (user_id, unit["unitId"]),
    )
    audit(connection, unit["unitId"], unit["userId"], "user.deactivate")
    return Response(status_code=204)


@app.post("/api/units/users/{user_id}/reset-mfa")
def reset_mfa(
    user_id: int,
    unit: dict[str, Any] = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    target = connection.execute(
        "SELECT id FROM unit_users WHERE id = ? AND unit_id = ? AND is_active = 1",
        (user_id, unit["unitId"]),
    ).fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    secret = pyotp.random_base32()
    with immediate_transaction(connection):
        connection.execute(
            """
            UPDATE unit_users SET totp_secret = ?, totp_enabled = 0, totp_last_step = 0,
              token_version = token_version + 1
            WHERE id = ? AND unit_id = ?
            """,
            (encrypt_record(unit["unitId"], {"secret": secret}), user_id, unit["unitId"]),
        )
        connection.execute("DELETE FROM mfa_recovery_codes WHERE user_id = ?", (user_id,))
        audit(connection, unit["unitId"], unit["userId"], "user.mfa_reset")
    user = connection.execute(
        """
        SELECT id, unit_id, username, role, totp_secret, totp_enabled, token_version
        FROM unit_users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    return auth_payload(user, secret)


@app.get("/api/units/audit")
def get_audit(
    unit: dict[str, Any] = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT events.action, events.record_id, events.created_at, users.username
        FROM audit_events events
        JOIN unit_users users ON users.id = events.user_id
        WHERE events.unit_id = ?
        ORDER BY events.id DESC LIMIT 200
        """,
        (unit["unitId"],),
    ).fetchall()
    return {"events": [dict(row) for row in rows]}


@app.get("/api/units/records")
def list_records(
    unit: dict[str, Any] = Depends(current_unit),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT id, ciphertext, created_at, updated_at FROM patient_records
        WHERE unit_id = ? ORDER BY updated_at DESC
        """,
        (unit["unitId"],),
    ).fetchall()
    records = [
        {
            "id": row["id"],
            "record": decrypt_record(unit["unitId"], row["ciphertext"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]
    audit(connection, unit["unitId"], unit["userId"], "records.list")
    return {"records": records}


@app.post("/api/units/records", status_code=201)
async def create_record(
    request: Request,
    unit: dict[str, Any] = Depends(require_editor),
    connection: sqlite3.Connection = Depends(get_database),
) -> JSONResponse:
    body = await read_json(request)
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Record data must be a JSON object")
    record_id = body.get("id")
    if not isinstance(record_id, str) or not RECORD_ID_PATTERN.fullmatch(record_id):
        record_id = str(uuid.uuid4())
    existing = connection.execute(
        "SELECT unit_id FROM patient_records WHERE id = ?", (record_id,)
    ).fetchone()
    if existing:
        if existing["unit_id"] != unit["unitId"]:
            raise HTTPException(status_code=409, detail="Record ID already exists")
        return JSONResponse(status_code=200, content={"id": record_id, "existing": True})
    connection.execute(
        "INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)",
        (record_id, unit["unitId"], encrypt_record(unit["unitId"], body)),
    )
    audit(connection, unit["unitId"], unit["userId"], "records.create", record_id)
    return JSONResponse(
        status_code=201, content={"id": record_id, "record": body}
    )


@app.post("/api/units/records/import")
async def import_records(
    request: Request,
    unit: dict[str, Any] = Depends(require_editor),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, int]:
    items = body_object(await read_json(request)).get("records")
    if not isinstance(items, list) or len(items) > 500:
        raise HTTPException(status_code=400, detail="Provide up to 500 records to import")
    ids: set[str] = set()
    for item in items:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), str)
            or not RECORD_ID_PATTERN.fullmatch(item["id"])
            or not isinstance(item.get("record"), dict)
            or item["id"] in ids
        ):
            raise HTTPException(
                status_code=400, detail="Import contains an invalid or duplicate record ID"
            )
        ids.add(item["id"])

    imported = 0
    skipped = 0
    try:
        with immediate_transaction(connection):
            for item in items:
                existing = connection.execute(
                    "SELECT unit_id FROM patient_records WHERE id = ?", (item["id"],)
                ).fetchone()
                if existing:
                    if existing["unit_id"] != unit["unitId"]:
                        raise HTTPException(
                            status_code=409,
                            detail="Record ID already exists outside this unit",
                        )
                    skipped += 1
                    continue
                connection.execute(
                    "INSERT INTO patient_records (id, unit_id, ciphertext) VALUES (?, ?, ?)",
                    (
                        item["id"],
                        unit["unitId"],
                        encrypt_record(unit["unitId"], item["record"]),
                    ),
                )
                imported += 1
            audit(connection, unit["unitId"], unit["userId"], "records.import")
    except HTTPException:
        raise
    return {"imported": imported, "skipped": skipped}


@app.get("/api/units/records/{record_id}")
def get_record(
    record_id: str,
    unit: dict[str, Any] = Depends(current_unit),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    row = connection.execute(
        """
        SELECT id, ciphertext, created_at, updated_at FROM patient_records
        WHERE id = ? AND unit_id = ?
        """,
        (record_id, unit["unitId"]),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Patient record not found")
    audit(connection, unit["unitId"], unit["userId"], "records.read", row["id"])
    return {
        "id": row["id"],
        "record": decrypt_record(unit["unitId"], row["ciphertext"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.put("/api/units/records/{record_id}")
async def update_record(
    record_id: str,
    request: Request,
    unit: dict[str, Any] = Depends(require_editor),
    connection: sqlite3.Connection = Depends(get_database),
) -> dict[str, Any]:
    body = await read_json(request)
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Record data must be a JSON object")
    exists = connection.execute(
        "SELECT id FROM patient_records WHERE id = ? AND unit_id = ?",
        (record_id, unit["unitId"]),
    ).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Patient record not found")
    connection.execute(
        """
        UPDATE patient_records SET ciphertext = ?, updated_at = datetime('now')
        WHERE id = ? AND unit_id = ?
        """,
        (encrypt_record(unit["unitId"], body), record_id, unit["unitId"]),
    )
    audit(connection, unit["unitId"], unit["userId"], "records.update", record_id)
    return {"id": record_id, "record": body}


@app.delete("/api/units/records/{record_id}", status_code=204)
def delete_record(
    record_id: str,
    unit: dict[str, Any] = Depends(require_editor),
    connection: sqlite3.Connection = Depends(get_database),
) -> Response:
    deleted = connection.execute(
        "DELETE FROM patient_records WHERE id = ? AND unit_id = ?",
        (record_id, unit["unitId"]),
    )
    if not deleted.rowcount:
        raise HTTPException(status_code=404, detail="Patient record not found")
    audit(connection, unit["unitId"], unit["userId"], "records.delete", record_id)
    return Response(status_code=204)




# ---------------------------------------------------------------------------
# Passkeys (WebAuthn) — biometric sign-in on top of the password.
# Import failures are caught so a library mismatch can never take the API down;
# the endpoints simply answer 503 while password login keeps working.
# ---------------------------------------------------------------------------
try:  # pragma: no cover - depends on installed wheel
    from webauthn import (
        generate_authentication_options,
        generate_registration_options,
        options_to_json,
        verify_authentication_response,
        verify_registration_response,
    )
    from webauthn.helpers import (
        parse_authentication_credential_json,
        parse_registration_credential_json,
    )
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        PublicKeyCredentialDescriptor,
        ResidentKeyRequirement,
        UserVerificationRequirement,
    )

    WEBAUTHN_AVAILABLE = True
except Exception as webauthn_import_error:  # pragma: no cover
    logger.warning("Passkeys unavailable: %s", webauthn_import_error)
    WEBAUTHN_AVAILABLE = False


_passkey_challenges: dict[int, tuple[bytes, float]] = {}
_PASSKEY_TTL = 300


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _store_passkey_challenge(user_id: int, challenge: bytes) -> None:
    now = time.time()
    _passkey_challenges[user_id] = (challenge, now + _PASSKEY_TTL)
    if len(_passkey_challenges) > 2000:
        for key, (_, expires) in list(_passkey_challenges.items()):
            if expires < now:
                _passkey_challenges.pop(key, None)


def _take_passkey_challenge(user_id: int) -> bytes | None:
    item = _passkey_challenges.pop(user_id, None)
    if not item:
        return None
    challenge, expires = item
    return challenge if expires >= time.time() else None


def _passkey_user(payload: Any, connection: sqlite3.Connection) -> sqlite3.Row:
    body = body_object(payload)
    slug = str(body.get("slug") or "").strip().lower()
    username = str(body.get("username") or "").strip()
    user = connection.execute(
        """
        SELECT users.*, units.name AS unit_name, units.slug
        FROM unit_users users JOIN units ON units.id = users.unit_id
        WHERE units.slug = ? AND users.username = ? AND users.is_active = 1
          AND units.is_active = 1
        """,
        (slug, username),
    ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid unit or username")
    return user


def _require_webauthn() -> None:
    if not WEBAUTHN_AVAILABLE:
        raise HTTPException(status_code=503, detail="Passkeys are not available on this server")


@app.post("/api/units/passkeys/register/begin")
async def passkey_register_begin(
    request: Request, connection: sqlite3.Connection = Depends(get_database)
) -> Any:
    _require_webauthn()
    body = await read_json(request)
    user = _passkey_user(body, connection)
    if not verify_password(str(body_object(body).get("password") or ""), user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid unit, username, or password")
    existing = connection.execute(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id = ?", (user["id"],)
    ).fetchall()
    options = generate_registration_options(
        rp_id=config.WEBAUTHN_RP_ID,
        rp_name=config.WEBAUTHN_RP_NAME,
        user_id=str(user["id"]).encode("utf-8"),
        user_name=user["username"],
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=row["credential_id"]) for row in existing
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    _store_passkey_challenge(user["id"], options.challenge)
    return json.loads(options_to_json(options))


@app.post("/api/units/passkeys/register/complete")
async def passkey_register_complete(
    request: Request, connection: sqlite3.Connection = Depends(get_database)
) -> dict[str, Any]:
    _require_webauthn()
    body = await read_json(request)
    user = _passkey_user(body, connection)
    challenge = _take_passkey_challenge(user["id"])
    if not challenge:
        raise HTTPException(status_code=400, detail="Passkey setup expired. Start again.")
    label = str(body_object(body).get("label") or "This device")[:80]
    try:
        verification = verify_registration_response(
            credential=parse_registration_credential_json(
                json.dumps(body_object(body).get("credential"))
            ),
            expected_challenge=challenge,
            expected_rp_id=config.WEBAUTHN_RP_ID,
            expected_origin=config.WEBAUTHN_ORIGIN,
            require_user_verification=True,
        )
    except Exception as error:
        logger.warning("Passkey registration rejected: %s", error)
        raise HTTPException(status_code=400, detail="Could not verify this device.") from None
    transports = body_object(body).get("credential", {}).get("response", {}).get("transports")
    try:
        with immediate_transaction(connection):
            connection.execute(
                """
                INSERT INTO webauthn_credentials
                  (user_id, credential_id, public_key, sign_count, transports, label)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    verification.credential_id,
                    verification.credential_public_key,
                    verification.sign_count,
                    json.dumps(transports) if transports else None,
                    label,
                ),
            )
            audit(connection, user["unit_id"], user["id"], "auth.passkey_added")
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="This device is already registered.") from None
    return {"ok": True, "label": label}


@app.post("/api/units/passkeys/login/begin")
async def passkey_login_begin(
    request: Request, connection: sqlite3.Connection = Depends(get_database)
) -> Any:
    _require_webauthn()
    body = await read_json(request)
    user = _passkey_user(body, connection)
    rows = connection.execute(
        "SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?",
        (user["id"],),
    ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No passkey registered for this account.")
    options = generate_authentication_options(
        rp_id=config.WEBAUTHN_RP_ID,
        allow_credentials=[PublicKeyCredentialDescriptor(id=row["credential_id"]) for row in rows],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    _store_passkey_challenge(user["id"], options.challenge)
    return json.loads(options_to_json(options))


@app.post("/api/units/passkeys/login/complete")
async def passkey_login_complete(
    request: Request, connection: sqlite3.Connection = Depends(get_database)
) -> dict[str, Any]:
    _require_webauthn()
    body = await read_json(request)
    user = _passkey_user(body, connection)
    challenge = _take_passkey_challenge(user["id"])
    if not challenge:
        raise HTTPException(status_code=400, detail="Sign-in expired. Try again.")
    credential = body_object(body).get("credential") or {}
    raw_id = credential.get("rawId") or credential.get("id") or ""
    try:
        raw_id_bytes = _unb64url(raw_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed passkey response.") from None
    row = connection.execute(
        "SELECT * FROM webauthn_credentials WHERE user_id = ? AND credential_id = ?",
        (user["id"], raw_id_bytes),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Passkey not found on this account.")
    try:
        verification = verify_authentication_response(
            credential=parse_authentication_credential_json(json.dumps(credential)),
            expected_challenge=challenge,
            expected_rp_id=config.WEBAUTHN_RP_ID,
            expected_origin=config.WEBAUTHN_ORIGIN,
            credential_public_key=row["public_key"],
            credential_current_sign_count=row["sign_count"],
            require_user_verification=True,
        )
    except Exception as error:
        logger.warning("Passkey login rejected: %s", error)
        raise HTTPException(status_code=401, detail="Touch or face check failed.") from None
    with immediate_transaction(connection):
        connection.execute(
            "UPDATE webauthn_credentials SET sign_count = ? WHERE id = ?",
            (verification.new_sign_count, row["id"]),
        )
        audit(connection, user["unit_id"], user["id"], "auth.passkey_login")
    unit = {"id": user["unit_id"], "name": user["unit_name"], "slug": user["slug"]}
    return session_payload(user, unit)

# Serve the static website (index.html, records.html, app.js, ...) from the same
# container, so dialysisform.com and the API share one origin. Registered last so
# every /api route above still wins; /api/* is never served from disk.
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
