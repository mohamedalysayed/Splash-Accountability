"""Authentication utilities — password hashing and JWT tokens."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256

import jwt

from config import settings


def hash_password(password: str) -> str:
    """Hash a password with SHA-256 + salt. Simple and dependency-light."""
    import secrets
    salt = secrets.token_hex(16)
    hashed = sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${hashed}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    if "$" not in hashed_password:
        return False
    salt, stored_hash = hashed_password.split("$", 1)
    computed = sha256(f"{salt}:{plain_password}".encode()).hexdigest()
    return computed == stored_hash


def create_token(user_id: int, email: str) -> str:
    """Create a JWT token with user_id and email claims."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> dict | None:
    """Verify and decode a JWT token. Returns payload dict or None."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def verify_google_id_token(id_token_str: str) -> dict | None:
    """Verify a Google-issued ID token and return the payload.

    Returns a dict with at least {sub, email, email_verified, name, picture}
    if valid, else None. Verifies signature, expiry, issuer, and that the
    audience matches our configured client_id.

    Requires settings.GOOGLE_OAUTH_CLIENT_ID to be set.
    """
    import logging
    log = logging.getLogger(__name__)

    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        log.warning("verify_google_id_token called but GOOGLE_OAUTH_CLIENT_ID is unset")
        return None

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
    except ImportError:
        log.exception("google-auth not installed — `pip install google-auth`")
        return None

    try:
        # This verifies signature (against Google's published JWKs),
        # expiry, issuer ('accounts.google.com'/'https://accounts.google.com'),
        # and audience (must equal our client_id).
        info = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as e:
        log.warning("Google ID token rejected: %s", e)
        return None

    # Defense-in-depth: also require a verified email.
    if not info.get("email") or not info.get("email_verified"):
        log.warning("Google ID token has no verified email: %s", info.get("email"))
        return None

    return info
