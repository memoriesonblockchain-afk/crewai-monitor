"""Usage tracking model for billing."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .api_key import APIKey


class UsageDaily(Base):
    """
    Daily usage tracking for billing.

    Tracks events, traces, and data volume per API key per day.
    """

    __tablename__ = "usage_daily"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    api_key_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("api_keys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )
    # Counters
    event_count: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    trace_count: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    data_bytes: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    # Error tracking
    error_count: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Ensure one record per API key per day
    __table_args__ = (
        UniqueConstraint("api_key_id", "date", name="uq_usage_daily_api_key_date"),
    )

    # Relationships
    api_key: Mapped["APIKey"] = relationship(
        "APIKey",
        back_populates="usage_records",
    )

    def __repr__(self) -> str:
        return f"<UsageDaily {self.date}: {self.event_count} events>"


class UsageMonthly(Base):
    """
    Monthly aggregated usage for billing.

    Pre-computed from daily records for faster billing queries.
    """

    __tablename__ = "usage_monthly"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    api_key_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("api_keys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Year and month
    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)

    # Aggregated counters
    event_count: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    trace_count: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    data_bytes: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("api_key_id", "year", "month", name="uq_usage_monthly_api_key_period"),
    )

    def __repr__(self) -> str:
        return f"<UsageMonthly {self.year}-{self.month}: {self.event_count} events>"
