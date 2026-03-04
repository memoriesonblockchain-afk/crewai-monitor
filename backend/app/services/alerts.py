"""
Alert rules engine for detecting anomalies and triggering notifications.

Supports rules like:
- Repeated tool calls
- High error rates
- Rate limits exceeded
- Custom pattern matching
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.alert import AlertRule, AlertEvent
from ..core.database import get_db_context


class RuleType(str, Enum):
    """Types of alert rules."""

    REPEATED_CALLS = "repeated_calls"
    ERROR_RATE = "error_rate"
    RATE_LIMIT = "rate_limit"
    LONG_RUNNING = "long_running"
    CUSTOM = "custom"


class AlertSeverity(str, Enum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertAction(str, Enum):
    """Actions to take when alert triggers."""

    ALERT_ONLY = "alert"
    KILL = "kill"
    ALERT_AND_KILL = "alert_and_kill"


@dataclass
class AlertContext:
    """Context for an alert evaluation."""

    tenant_id: str
    trace_id: str | None = None
    agent_role: str | None = None
    tool_name: str | None = None
    event_type: str | None = None
    error: bool = False
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TriggeredAlert:
    """A triggered alert ready for notification."""

    alert_id: str
    rule_id: str
    rule_name: str
    severity: AlertSeverity
    action: AlertAction
    message: str
    context: AlertContext
    triggered_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AlertRulesEngine:
    """
    Engine for evaluating alert rules against incoming events.

    Features:
    - Rule-based anomaly detection
    - Sliding window metrics
    - Rate limiting per rule
    - Action execution (alert, kill)
    """

    def __init__(self) -> None:
        # Metrics storage: {tenant_id: {metric_key: [timestamps]}}
        self._metrics: dict[str, dict[str, list[datetime]]] = defaultdict(
            lambda: defaultdict(list)
        )
        # Recent alerts for deduplication: {rule_id: last_triggered}
        self._recent_alerts: dict[str, datetime] = {}
        # Alert cooldown period (avoid spam)
        self._cooldown_seconds = 60

        # Rule evaluators
        self._evaluators: dict[RuleType, Callable] = {
            RuleType.REPEATED_CALLS: self._evaluate_repeated_calls,
            RuleType.ERROR_RATE: self._evaluate_error_rate,
            RuleType.RATE_LIMIT: self._evaluate_rate_limit,
            RuleType.LONG_RUNNING: self._evaluate_long_running,
        }

    async def evaluate(
        self,
        context: AlertContext,
        rules: list[AlertRule],
    ) -> list[TriggeredAlert]:
        """
        Evaluate all rules against the given context.

        Returns list of triggered alerts.
        """
        triggered: list[TriggeredAlert] = []

        for rule in rules:
            if not rule.enabled:
                continue

            # Check cooldown
            if self._is_in_cooldown(rule.id):
                continue

            # Get evaluator for rule type
            evaluator = self._evaluators.get(RuleType(rule.rule_type))
            if not evaluator:
                continue

            # Evaluate rule
            result = await evaluator(context, rule)
            if result:
                alert = TriggeredAlert(
                    alert_id=str(uuid4()),
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=AlertSeverity(result.get("severity", "warning")),
                    action=AlertAction(rule.action),
                    message=result.get("message", "Alert triggered"),
                    context=context,
                )
                triggered.append(alert)
                self._recent_alerts[rule.id] = datetime.now(timezone.utc)

        return triggered

    def record_event(self, context: AlertContext) -> None:
        """Record an event for metrics tracking."""
        now = context.timestamp

        # Record tool call
        if context.tool_name:
            key = f"tool:{context.agent_role}:{context.tool_name}"
            self._metrics[context.tenant_id][key].append(now)

        # Record error
        if context.error:
            key = f"error:{context.agent_role}"
            self._metrics[context.tenant_id][key].append(now)

        # Record general event
        key = f"event:{context.agent_role}"
        self._metrics[context.tenant_id][key].append(now)

        # Cleanup old metrics
        self._cleanup_metrics(context.tenant_id)

    def _cleanup_metrics(self, tenant_id: str, max_age_seconds: int = 300) -> None:
        """Remove metrics older than max_age."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)

        for key in list(self._metrics[tenant_id].keys()):
            self._metrics[tenant_id][key] = [
                ts for ts in self._metrics[tenant_id][key] if ts > cutoff
            ]
            if not self._metrics[tenant_id][key]:
                del self._metrics[tenant_id][key]

    def _is_in_cooldown(self, rule_id: str) -> bool:
        """Check if a rule is in cooldown period."""
        last_triggered = self._recent_alerts.get(rule_id)
        if not last_triggered:
            return False

        cooldown_end = last_triggered + timedelta(seconds=self._cooldown_seconds)
        return datetime.now(timezone.utc) < cooldown_end

    async def _evaluate_repeated_calls(
        self,
        context: AlertContext,
        rule: AlertRule,
    ) -> dict[str, Any] | None:
        """Evaluate repeated tool calls rule."""
        config = rule.config
        threshold = config.get("threshold", 10)
        window_seconds = config.get("window_seconds", 30)
        tool_filter = config.get("tool_name", "*")

        # Check if this tool matches the filter
        if tool_filter != "*" and context.tool_name != tool_filter:
            return None

        # Get recent calls
        key = f"tool:{context.agent_role}:{context.tool_name}"
        recent = self._metrics[context.tenant_id].get(key, [])

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        count = sum(1 for ts in recent if ts > cutoff)

        if count >= threshold:
            return {
                "severity": "warning",
                "message": f"Tool '{context.tool_name}' called {count} times in {window_seconds}s by {context.agent_role}",
            }

        return None

    async def _evaluate_error_rate(
        self,
        context: AlertContext,
        rule: AlertRule,
    ) -> dict[str, Any] | None:
        """Evaluate error rate rule."""
        if not context.error:
            return None

        config = rule.config
        threshold = config.get("threshold", 5)
        window_seconds = config.get("window_seconds", 60)

        key = f"error:{context.agent_role}"
        recent = self._metrics[context.tenant_id].get(key, [])

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        count = sum(1 for ts in recent if ts > cutoff)

        if count >= threshold:
            return {
                "severity": "error",
                "message": f"High error rate: {count} errors in {window_seconds}s for {context.agent_role}",
            }

        return None

    async def _evaluate_rate_limit(
        self,
        context: AlertContext,
        rule: AlertRule,
    ) -> dict[str, Any] | None:
        """Evaluate rate limit rule."""
        config = rule.config
        max_calls = config.get("max_calls", 100)
        window_seconds = config.get("window_seconds", 60)

        key = f"event:{context.agent_role}"
        recent = self._metrics[context.tenant_id].get(key, [])

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        count = sum(1 for ts in recent if ts > cutoff)

        if count >= max_calls:
            return {
                "severity": "warning",
                "message": f"Rate limit exceeded: {count} events in {window_seconds}s for {context.agent_role}",
            }

        return None

    async def _evaluate_long_running(
        self,
        context: AlertContext,
        rule: AlertRule,
    ) -> dict[str, Any] | None:
        """Evaluate long-running task rule."""
        config = rule.config
        max_duration_ms = config.get("max_duration_ms", 300000)  # 5 minutes default

        duration = context.metadata.get("duration_ms")
        if duration and duration > max_duration_ms:
            return {
                "severity": "warning",
                "message": f"Long-running operation: {duration/1000:.1f}s (threshold: {max_duration_ms/1000:.1f}s)",
            }

        return None


# Global engine instance
_engine: AlertRulesEngine | None = None


def get_alert_engine() -> AlertRulesEngine:
    """Get the global alert engine."""
    global _engine
    if _engine is None:
        _engine = AlertRulesEngine()
    return _engine


async def get_user_rules(db: AsyncSession, user_id: str) -> list[AlertRule]:
    """Get all enabled alert rules for a user."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == user_id)
        .where(AlertRule.enabled == True)
    )
    return list(result.scalars().all())


async def save_alert_event(
    db: AsyncSession,
    alert: TriggeredAlert,
) -> AlertEvent:
    """Save a triggered alert to the database."""
    event = AlertEvent(
        alert_rule_id=alert.rule_id,
        trace_id=alert.context.trace_id,
        agent_role=alert.context.agent_role,
        message=alert.message,
        severity=alert.severity.value,
        action_taken=alert.action.value,
        context={
            "tool_name": alert.context.tool_name,
            "event_type": alert.context.event_type,
            "metadata": alert.context.metadata,
        },
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event
