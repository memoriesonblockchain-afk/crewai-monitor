"""Authentication API endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from .deps import CurrentUser, DBSession
from ..core.security import (
    create_access_token,
    generate_api_key,
    get_api_key_prefix,
    hash_password,
    verify_password,
)
from ..models.user import User
from ..models.api_key import APIKey

router = APIRouter()


# Request/Response schemas
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    company: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    company: str | None
    created_at: datetime


class CreateAPIKeyRequest(BaseModel):
    name: str | None = None
    environment: str = "live"  # 'live' or 'test'


class APIKeyResponse(BaseModel):
    id: str
    prefix: str
    name: str | None
    environment: str
    created_at: datetime
    last_used_at: datetime | None


class APIKeyCreatedResponse(APIKeyResponse):
    """Response when creating a new API key - includes the full key."""

    key: str  # Full key, only shown once


class APIKeyListResponse(BaseModel):
    keys: list[APIKeyResponse]


# Endpoints
@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: DBSession) -> TokenResponse:
    """Register a new user account."""
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        name=request.name,
        company=request.company,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Generate access token
    access_token = create_access_token(data={"sub": user.id})

    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: DBSession) -> TokenResponse:
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    access_token = create_access_token(data={"sub": user.id})

    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser) -> UserResponse:
    """Get current user information."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        company=current_user.company,
        created_at=current_user.created_at,
    )


@router.post("/keys", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    request: CreateAPIKeyRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> APIKeyCreatedResponse:
    """
    Create a new API key.

    The full key is only returned once at creation time. Store it securely.
    """
    # Determine prefix based on environment
    prefix_base = "cm_live_" if request.environment == "live" else "cm_test_"

    # Generate key
    full_key, key_hash = generate_api_key(prefix_base)
    prefix = get_api_key_prefix(full_key)

    # Create API key record
    api_key = APIKey(
        user_id=current_user.id,
        prefix=prefix,
        key_hash=key_hash,
        name=request.name,
        environment=request.environment,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return APIKeyCreatedResponse(
        id=api_key.id,
        prefix=api_key.prefix,
        name=api_key.name,
        environment=api_key.environment,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        key=full_key,  # Only returned at creation time
    )


@router.get("/keys", response_model=APIKeyListResponse)
async def list_api_keys(current_user: CurrentUser, db: DBSession) -> APIKeyListResponse:
    """List all API keys for the current user."""
    result = await db.execute(
        select(APIKey)
        .where(APIKey.user_id == current_user.id)
        .where(APIKey.revoked_at.is_(None))
        .order_by(APIKey.created_at.desc())
    )
    keys = result.scalars().all()

    return APIKeyListResponse(
        keys=[
            APIKeyResponse(
                id=key.id,
                prefix=key.prefix,
                name=key.name,
                environment=key.environment,
                created_at=key.created_at,
                last_used_at=key.last_used_at,
            )
            for key in keys
        ]
    )


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> None:
    """Revoke an API key."""
    result = await db.execute(
        select(APIKey)
        .where(APIKey.id == key_id)
        .where(APIKey.user_id == current_user.id)
    )
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    api_key.revoked_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/validate")
async def validate_api_key(current_user: CurrentUser) -> dict[str, str]:
    """Validate the current JWT token."""
    return {"status": "valid", "user_id": current_user.id}
