"""API dependencies for authentication and authorization."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Header, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.security import decode_access_token, hash_api_key, get_api_key_prefix
from ..models.user import User
from ..models.api_key import APIKey


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """
    Get the current user from JWT token.

    Used for dashboard authentication.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
        )

    token = authorization[7:]  # Remove "Bearer " prefix
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_api_key(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> APIKey:
    """
    Get the API key from request headers.

    Accepts either:
    - Authorization: Bearer <api_key>
    - X-API-Key: <api_key>

    Used for SDK authentication.
    """
    api_key_value = None

    # Try Authorization header first
    if authorization:
        if authorization.startswith("Bearer "):
            api_key_value = authorization[7:]

    # Fall back to X-API-Key header
    if not api_key_value and x_api_key:
        api_key_value = x_api_key

    if not api_key_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
        )

    # Validate format
    if not api_key_value.startswith(("cm_live_", "cm_test_")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
        )

    # Hash and lookup
    key_hash = hash_api_key(api_key_value)

    result = await db.execute(
        select(APIKey).where(APIKey.key_hash == key_hash)
    )
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    if not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key has been revoked",
        )

    # Update last used timestamp
    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return api_key


# Type aliases for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAPIKey = Annotated[APIKey, Depends(get_api_key)]
DBSession = Annotated[AsyncSession, Depends(get_db)]
