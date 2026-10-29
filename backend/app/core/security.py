# app/core/security.py

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta


SECRET_NBYTES = 32


def generate_secret() -> str:
    """
    Generate a cryptographically secure random secret.

    32 random bytes = 256 bits of entropy.
    The returned value is URL-safe and can safely be used in cookies.
    """
    return secrets.token_urlsafe(SECRET_NBYTES)


def hash_secret(secret: str) -> bytes:
    """
    Hash a high-entropy secret using SHA-256.

    Session and CSRF tokens are randomly generated secrets,
    not human passwords, so a fast cryptographic hash is appropriate.
    """
    return hashlib.sha256(
        secret.encode("utf-8")
    ).digest()


def verify_secret(
    secret: str,
    expected_hash: bytes,
) -> bool:
    """
    Compare a raw secret with an expected SHA-256 digest
    using a constant-time comparison.
    """
    actual_hash = hash_secret(secret)

    return hmac.compare_digest(
        actual_hash,
        expected_hash,
    )


def session_expiry(
    lifetime: timedelta,
    *,
    now: datetime | None = None,
) -> datetime:
    """
    Compute the absolute expiration time of a session.
    """
    current_time = now or datetime.now(UTC)

    return current_time + lifetime