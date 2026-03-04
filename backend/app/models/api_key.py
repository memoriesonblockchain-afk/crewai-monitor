"""API Key model."""

from datetime import datetime
from typing import TYPE_CHECKING, Literal
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .user import User
    from .usage import UsageDaily


class APIKey(Base):
    """API Key model for authenticating SDK requests."""

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Prefix for identification (e.g., "cm_live_abc12345")
    prefix: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )
    # SHA-256 hash of the full key
    key_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    # 'live' for production, 'test' for testing (no billing)
    environment: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="live",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Rate limits (can be customized per key)
    rate_limit_per_minute: Mapped[int] = mapped_column(
        default=1000,
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="api_keys",
    )
    usage_records: Mapped[list["UsageDaily"]] = relationship(
        "UsageDaily",
        back_populates="api_key",
        cascade="all, delete-orphan",
    )

    @property
    def is_active(self) -> bool:
        """Check if the API key is active (not revoked)."""
        return self.revoked_at is None

    @property
    def is_live(self) -> bool:
        """Check if this is a live (production) key."""
        return self.environment == "live"

    @property
    def is_test(self) -> bool:
        """Check if this is a test key."""
        return self.environment == "test"

    def __repr__(self) -> str:
        return f"<APIKey {self.prefix}... ({self.environment})>"
