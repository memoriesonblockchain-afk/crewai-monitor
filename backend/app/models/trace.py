"""Trace and Event models for storing telemetry data."""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .user import User


class Trace(Base):
    """A trace represents a single crew execution."""

    __tablename__ = "traces"

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
    trace_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    project_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="default",
    )
    environment: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="development",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="running",  # running, completed, failed
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    error_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    trace_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="selectin")
    events: Mapped[list["Event"]] = relationship(
        "Event",
        back_populates="trace",
        cascade="all, delete-orphan",
        order_by="Event.timestamp",
    )

    # Composite index for common queries
    __table_args__ = (
        Index("ix_traces_user_status", "user_id", "status"),
        Index("ix_traces_user_started", "user_id", "started_at"),
        Index("ix_traces_user_trace_id", "user_id", "trace_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<Trace {self.trace_id} ({self.status})>"


class Event(Base):
    """A single event within a trace."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    trace_db_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("traces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    agent_role: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    task_description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    tool_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    tool_input: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    tool_result: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    duration_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    error: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationship
    trace: Mapped["Trace"] = relationship("Trace", back_populates="events")

    # Index for common queries
    __table_args__ = (
        Index("ix_events_trace_timestamp", "trace_db_id", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<Event {self.event_type} ({self.agent_role})>"
