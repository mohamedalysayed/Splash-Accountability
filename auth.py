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
