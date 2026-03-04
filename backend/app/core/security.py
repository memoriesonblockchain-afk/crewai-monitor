"""Security utilities for authentication and authorization."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


# JWT tokens
def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None


# API Keys
def generate_api_key(prefix: str = "cm_live_") -> tuple[str, str]:
    """
    Generate a new API key.

    Returns (full_key, key_hash) where:
    - full_key is what the user sees (e.g., cm_live_abc123...)
    - key_hash is what we store in the database
    """
    # Generate 32 random bytes, encode as hex (64 chars)
    random_part = secrets.token_hex(32)
    full_key = f"{prefix}{random_part}"

    # Hash the full key for storage
    key_hash = hash_api_key(full_key)

    return full_key, key_hash


def hash_api_key(api_key: str) -> str:
    """Hash an API key for storage."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_api_key_prefix(api_key: str) -> str:
    """
    Extract the prefix from an API key for identification.

    Returns the first 16 characters (e.g., "cm_live_abc12345").
    """
    return api_key[:16] if len(api_key) >= 16 else api_key


def validate_api_key_format(api_key: str) -> tuple[bool, str]:
    """
    Validate the format of an API key.

    Returns (is_valid, error_message).
    """
    if not api_key:
        return False, "API key is required"

    if not api_key.startswith((settings.api_key_prefix_live, settings.api_key_prefix_test)):
        return False, f"API key must start with '{settings.api_key_prefix_live}' or '{settings.api_key_prefix_test}'"

    # Full key should be prefix (8 chars) + 64 hex chars = 72 chars
    if len(api_key) != 72:
        return False, "Invalid API key length"

    return True, ""
