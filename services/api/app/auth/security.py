"""Password hashing and HMAC-SHA256 bearer token helpers."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from typing import Any

from app.core.config import get_settings

PBKDF2_ITERATIONS = 310_000
_EPHEMERAL_DEV_SECRET: str | None = None


class TokenError(Exception):
    """Raised when an authentication token is malformed, expired, or invalid."""


def _get_signing_secret() -> bytes:
    global _EPHEMERAL_DEV_SECRET
    configured = get_settings().auth_secret_key.strip()
    if configured:
        return configured.encode("utf-8")
    if _EPHEMERAL_DEV_SECRET is None:
        _EPHEMERAL_DEV_SECRET = secrets.token_urlsafe(48)
    return _EPHEMERAL_DEV_SECRET.encode("utf-8")


def hash_password(password: str) -> str:
    """Hash a plaintext password with PBKDF2-HMAC-SHA256 and a random 16-byte salt."""
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_b64}${digest_b64}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2-HMAC-SHA256 hash."""
    try:
        algorithm, iter_str, salt_b64, digest_b64 = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    except (ValueError, TypeError):
        return False

    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(computed, expected)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(encoded: str) -> bytes:
    padding = "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode((encoded + padding).encode("ascii"))


def create_access_token(
    *,
    user_id: int,
    login_id: str,
    plant_id: int,
    role: str,
    ttl_seconds: int | None = None,
) -> str:
    """Issue a signed bearer token scoped to the user's server-assigned warehouse."""
    now = datetime.now(timezone.utc)
    ttl = ttl_seconds if ttl_seconds is not None else get_settings().auth_token_ttl_seconds
    payload = {
        "sub": str(user_id),
        "login_id": login_id,
        "plant_id": plant_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    sig = hmac.new(_get_signing_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(sig)}"


def decode_access_token(token: str) -> dict[str, Any]:
    """Validate signature and expiry of a bearer token and return its claims."""
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError as exc:
        raise TokenError("Malformed authentication token.") from exc

    expected_sig = hmac.new(
        _get_signing_secret(), payload_b64.encode("ascii"), hashlib.sha256
    ).digest()
    try:
        provided_sig = _b64url_decode(sig_b64)
    except ValueError as exc:
        raise TokenError("Invalid token signature encoding.") from exc

    if not hmac.compare_digest(expected_sig, provided_sig):
        raise TokenError("Invalid token signature.")

    try:
        claims = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise TokenError("Invalid token payload.") from exc

    exp = claims.get("exp")
    if not isinstance(exp, int) or int(datetime.now(timezone.utc).timestamp()) >= exp:
        raise TokenError("Authentication token has expired.")

    return claims
