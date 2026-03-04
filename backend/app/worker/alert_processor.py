"""
Alert processor worker for evaluating events against rules.

This module processes incoming events and triggers alerts/notifications.
Can be run as a Celery task or standalone async worker.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db_context
from ..models.alert import AlertRule
from ..models.api_key import APIKey
from ..services.alerts import (
    AlertContext,
    AlertAction,
    TriggeredAlert,
    get_alert_engine,
    get_user_rules,
    save_alert_event,
)
from ..services.notifications import get_notification_service

logger = logging.getLogger(__name__)


class AlertProcessor:
    """
    Processes events and triggers alerts based on configured rules.
    """

    def __init__(self):
        self.engine = get_alert_engine()
        self.notification_service = get_notification_service()
        # In-memory kill switch state (in production, use Redis)
        self._kill_flags: dict[str, dict[str, bool]] = {}

    async def process_event(
        self,
        tenant_id: str,
        event: dict[str, Any],
    ) -> list[TriggeredAlert]:
        """
        Process a single event and trigger any matching alerts.

        Args:
            tenant_id: The tenant (API key owner) ID
            event: The event data from SDK

        Returns:
            List of triggered alerts
        """
        # Build context from event
        context = AlertContext(
            tenant_id=tenant_id,
            trace_id=event.get("trace_id"),
            agent_role=event.get("agent_role"),
            tool_name=event.get("tool_name"),
            event_type=event.get("event_type"),
            error=event.get("error", False),
            timestamp=datetime.fromtimestamp(
                event.get("timestamp", datetime.now(timezone.utc).timestamp()),
                tz=timezone.utc,
            ),
            metadata={
                "duration_ms": event.get("duration_ms"),
                "error_message": event.get("error_message"),
            },
        )

        # Record event for metrics
        self.engine.record_event(context)

        # Get user rules
        async with get_db_context() as db:
            # Get user_id from tenant_id (API key)
            result = await db.execute(
                select(APIKey.user_id).where(APIKey.id == tenant_id)
            )
            row = result.first()
            if not row:
                return []

            user_id = row[0]
            rules = await get_user_rules(db, user_id)

            # Evaluate rules
            triggered = await self.engine.evaluate(context, rules)

            # Process triggered alerts
            for alert in triggered:
                await self._handle_alert(db, alert, rules)

            return triggered

    async def _handle_alert(
        self,
        db: AsyncSession,
        alert: TriggeredAlert,
        rules: list[AlertRule],
    ) -> None:
        """Handle a triggered alert."""
        logger.info(f"Alert triggered: {alert.rule_name} - {alert.message}")

        # Save to database
        await save_alert_event(db, alert)

        # Execute action
        if alert.action in (AlertAction.KILL, AlertAction.ALERT_AND_KILL):
            await self._execute_kill(alert)

        # Send notifications
        rule = next((r for r in rules if r.id == alert.rule_id), None)
        if rule and rule.notifications:
            results = await self.notification_service.send_alert(
                alert,
                rule.notifications,
            )
            for result in results:
                if result.success:
                    logger.info(f"Notification sent via {result.channel}")
                else:
                    logger.error(f"Notification failed: {result.channel} - {result.error}")

    async def _execute_kill(self, alert: TriggeredAlert) -> None:
        """Execute kill switch for an agent."""
        tenant_id = alert.context.tenant_id
        agent_role = alert.context.agent_role

        if not agent_role:
            return

        if tenant_id not in self._kill_flags:
            self._kill_flags[tenant_id] = {}

        self._kill_flags[tenant_id][agent_role] = True
        logger.warning(f"Kill switch activated for {agent_role} in tenant {tenant_id}")

        # TODO: Publish to Redis for real-time propagation
        # await redis.publish(f"control:{tenant_id}", json.dumps({
        #     "action": "kill",
        #     "agent_role": agent_role,
        #     "trace_id": alert.context.trace_id,
        # }))

    def get_kill_flags(self, tenant_id: str) -> dict[str, bool]:
        """Get all kill flags for a tenant."""
        return self._kill_flags.get(tenant_id, {})

    def clear_kill_flag(self, tenant_id: str, agent_role: str) -> None:
        """Clear a kill flag."""
        if tenant_id in self._kill_flags:
            self._kill_flags[tenant_id].pop(agent_role, None)

    async def process_batch(
        self,
        tenant_id: str,
        events: list[dict[str, Any]],
    ) -> list[TriggeredAlert]:
        """Process a batch of events."""
        all_triggered: list[TriggeredAlert] = []

        for event in events:
            triggered = await self.process_event(tenant_id, event)
            all_triggered.extend(triggered)

        return all_triggered


# Global processor instance
_processor: AlertProcessor | None = None


def get_alert_processor() -> AlertProcessor:
    """Get the global alert processor."""
    global _processor
    if _processor is None:
        _processor = AlertProcessor()
    return _processor


# Celery tasks (if using Celery)
try:
    from celery import Celery

    celery_app = Celery("crewai_monitor")

    @celery_app.task
    def process_event_task(tenant_id: str, event: dict[str, Any]) -> list[dict]:
        """Celery task to process a single event."""
        processor = get_alert_processor()
        loop = asyncio.get_event_loop()
        triggered = loop.run_until_complete(processor.process_event(tenant_id, event))
        return [
            {
                "alert_id": a.alert_id,
                "rule_name": a.rule_name,
                "message": a.message,
            }
            for a in triggered
        ]

    @celery_app.task
    def process_batch_task(tenant_id: str, events: list[dict[str, Any]]) -> list[dict]:
        """Celery task to process a batch of events."""
        processor = get_alert_processor()
        loop = asyncio.get_event_loop()
        triggered = loop.run_until_complete(processor.process_batch(tenant_id, events))
        return [
            {
                "alert_id": a.alert_id,
                "rule_name": a.rule_name,
                "message": a.message,
            }
            for a in triggered
        ]

except ImportError:
    celery_app = None
    process_event_task = None
    process_batch_task = None
