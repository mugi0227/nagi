"""
Security helpers for local authentication.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import Settings

_PBKDF2_ALGO = "pbkdf2_sha256"
_PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return _format_hash(_PBKDF2_ITERATIONS, salt, digest)


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against the stored hash."""
    try:
        algo, iterations, salt, digest = _parse_hash(stored_hash)
    except Exception:
        return False
    if algo != _PBKDF2_ALGO:
        return False
    computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(computed, digest)


def create_access_token(user_id: str, settings: Settings, expires_minutes: int | None = None) -> str:
    """Create a signed JWT for a local user."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=expires_minutes or settings.LOCAL_JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    if settings.LOCAL_JWT_ISSUER:
        payload["iss"] = settings.LOCAL_JWT_ISSUER
    return jwt.encode(payload, settings.LOCAL_JWT_SECRET, algorithm="HS256")


def _format_hash(iterations: int, salt: bytes, digest: bytes) -> str:
    salt_b64 = base64.b64encode(salt).decode("ascii")
    digest_b64 = base64.b64encode(digest).decode("ascii")
    return f"{_PBKDF2_ALGO}${iterations}${salt_b64}${digest_b64}"


def _parse_hash(stored_hash: str) -> tuple[str, int, bytes, bytes]:
    parts = stored_hash.split("$")
    if len(parts) != 4:
        raise ValueError("Invalid hash format")
    algo, iterations_str, salt_b64, digest_b64 = parts
    iterations = int(iterations_str)
    salt = base64.b64decode(salt_b64.encode("ascii"))
    digest = base64.b64decode(digest_b64.encode("ascii"))
    return algo, iterations, salt, digest
