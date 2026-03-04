"""Alert rules model."""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .user import User


class AlertRule(Base):
    """
    Alert rule configuration.

    Defines conditions for triggering alerts, such as:
    - Repeated tool calls
    - High error rates
    - Rate limit exceeded
    """

    __tablename__ = "alert_rules"

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
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    # Rule type: 'repeated_calls', 'error_rate', 'rate_limit', 'custom'
    rule_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    # Configuration as JSON
    # Example for 'repeated_calls':
    # {"tool_name": "*", "threshold": 10, "window_seconds": 30}
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    # Action to take: 'alert', 'kill', 'alert_and_kill'
    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="alert",
    )
    # Notification channels as JSON
    # Example: {"email": true, "webhook": "https://..."}
    notifications: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    enabled: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
    )
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

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="alert_rules",
    )

    def __repr__(self) -> str:
        return f"<AlertRule {self.name} ({self.rule_type})>"


class AlertEvent(Base):
    """
    Alert event log.

    Records when alerts are triggered.
    """

    __tablename__ = "alert_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    alert_rule_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("alert_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Context about the alert
    trace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )
    agent_role: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    # Alert details
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="warning",  # 'info', 'warning', 'error', 'critical'
    )
    # Action taken
    action_taken: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,  # 'alerted', 'killed', 'ignored'
    )
    # Additional context
    context: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<AlertEvent {self.severity}: {self.message[:50]}>"
