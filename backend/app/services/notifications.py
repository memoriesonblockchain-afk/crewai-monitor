"""
Notification services for sending alerts via email, Slack, and webhooks.
"""

from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from ..core.config import settings
from .alerts import TriggeredAlert, AlertSeverity


@dataclass
class NotificationResult:
    """Result of sending a notification."""

    success: bool
    channel: str
    error: str | None = None
    response: dict[str, Any] | None = None


class NotificationChannel(ABC):
    """Base class for notification channels."""

    @abstractmethod
    async def send(self, alert: TriggeredAlert, config: dict[str, Any]) -> NotificationResult:
        """Send a notification for the given alert."""
        pass


class EmailNotificationChannel(NotificationChannel):
    """Send notifications via email (SendGrid)."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.sendgrid_api_key if hasattr(settings, 'sendgrid_api_key') else None
        self.from_email = "alerts@crewai-monitor.com"
        self.api_url = "https://api.sendgrid.com/v3/mail/send"

    async def send(self, alert: TriggeredAlert, config: dict[str, Any]) -> NotificationResult:
        """Send email notification."""
        if not self.api_key:
            return NotificationResult(
                success=False,
                channel="email",
                error="SendGrid API key not configured",
            )

        to_email = config.get("email")
        if not to_email:
            return NotificationResult(
                success=False,
                channel="email",
                error="No email address configured",
            )

        subject = self._format_subject(alert)
        html_content = self._format_html(alert)

        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": self.from_email, "name": "CrewAI Monitor"},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_content}],
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=30.0,
                )
                response.raise_for_status()

            return NotificationResult(
                success=True,
                channel="email",
                response={"status_code": response.status_code},
            )

        except Exception as e:
            return NotificationResult(
                success=False,
                channel="email",
                error=str(e),
            )

    def _format_subject(self, alert: TriggeredAlert) -> str:
        """Format email subject."""
        severity_emoji = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.ERROR: "❌",
            AlertSeverity.CRITICAL: "🚨",
        }
        emoji = severity_emoji.get(alert.severity, "⚠️")
        return f"{emoji} [{alert.severity.value.upper()}] {alert.rule_name}"

    def _format_html(self, alert: TriggeredAlert) -> str:
        """Format email body as HTML."""
        severity_colors = {
            AlertSeverity.INFO: "#3B82F6",
            AlertSeverity.WARNING: "#F59E0B",
            AlertSeverity.ERROR: "#EF4444",
            AlertSeverity.CRITICAL: "#DC2626",
        }
        color = severity_colors.get(alert.severity, "#F59E0B")

        return f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: {color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">{alert.rule_name}</h1>
                <p style="margin: 10px 0 0; opacity: 0.9;">Severity: {alert.severity.value.upper()}</p>
            </div>
            <div style="background-color: #F9FAFB; padding: 20px; border: 1px solid #E5E7EB; border-top: none;">
                <h2 style="margin: 0 0 15px; font-size: 18px; color: #111827;">Alert Details</h2>
                <p style="margin: 0 0 15px; color: #374151;">{alert.message}</p>

                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #6B7280; width: 120px;">Agent</td>
                        <td style="padding: 8px 0; color: #111827;">{alert.context.agent_role or 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Tool</td>
                        <td style="padding: 8px 0; color: #111827;">{alert.context.tool_name or 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Trace ID</td>
                        <td style="padding: 8px 0; color: #111827; font-family: monospace; font-size: 12px;">
                            {alert.context.trace_id or 'N/A'}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Time</td>
                        <td style="padding: 8px 0; color: #111827;">{alert.triggered_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Action</td>
                        <td style="padding: 8px 0; color: #111827;">{alert.action.value}</td>
                    </tr>
                </table>
            </div>
            <div style="background-color: #F3F4F6; padding: 15px 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="margin: 0; color: #6B7280; font-size: 12px;">
                    <a href="https://app.crewai-monitor.com/dashboard/traces/{alert.context.trace_id}" style="color: #3B82F6;">
                        View in Dashboard →
                    </a>
                </p>
            </div>
        </div>
        """


class SlackNotificationChannel(NotificationChannel):
    """Send notifications via Slack webhook."""

    async def send(self, alert: TriggeredAlert, config: dict[str, Any]) -> NotificationResult:
        """Send Slack notification."""
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            return NotificationResult(
                success=False,
                channel="slack",
                error="No Slack webhook URL configured",
            )

        payload = self._format_payload(alert)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    webhook_url,
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()

            return NotificationResult(
                success=True,
                channel="slack",
                response={"status_code": response.status_code},
            )

        except Exception as e:
            return NotificationResult(
                success=False,
                channel="slack",
                error=str(e),
            )

    def _format_payload(self, alert: TriggeredAlert) -> dict[str, Any]:
        """Format Slack message payload."""
        severity_emoji = {
            AlertSeverity.INFO: ":information_source:",
            AlertSeverity.WARNING: ":warning:",
            AlertSeverity.ERROR: ":x:",
            AlertSeverity.CRITICAL: ":rotating_light:",
        }
        severity_colors = {
            AlertSeverity.INFO: "#3B82F6",
            AlertSeverity.WARNING: "#F59E0B",
            AlertSeverity.ERROR: "#EF4444",
            AlertSeverity.CRITICAL: "#DC2626",
        }

        emoji = severity_emoji.get(alert.severity, ":warning:")
        color = severity_colors.get(alert.severity, "#F59E0B")

        return {
            "attachments": [
                {
                    "color": color,
                    "blocks": [
                        {
                            "type": "header",
                            "text": {
                                "type": "plain_text",
                                "text": f"{emoji} {alert.rule_name}",
                                "emoji": True,
                            },
                        },
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": alert.message,
                            },
                        },
                        {
                            "type": "section",
                            "fields": [
                                {
                                    "type": "mrkdwn",
                                    "text": f"*Severity:*\n{alert.severity.value.upper()}",
                                },
                                {
                                    "type": "mrkdwn",
                                    "text": f"*Agent:*\n{alert.context.agent_role or 'N/A'}",
                                },
                                {
                                    "type": "mrkdwn",
                                    "text": f"*Tool:*\n{alert.context.tool_name or 'N/A'}",
                                },
                                {
                                    "type": "mrkdwn",
                                    "text": f"*Action:*\n{alert.action.value}",
                                },
                            ],
                        },
                        {
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": f"Trace: `{alert.context.trace_id or 'N/A'}`",
                                },
                                {
                                    "type": "mrkdwn",
                                    "text": f"Time: {alert.triggered_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                                },
                            ],
                        },
                    ],
                }
            ]
        }


class WebhookNotificationChannel(NotificationChannel):
    """Send notifications via custom webhook."""

    async def send(self, alert: TriggeredAlert, config: dict[str, Any]) -> NotificationResult:
        """Send webhook notification."""
        webhook_url = config.get("url")
        if not webhook_url:
            return NotificationResult(
                success=False,
                channel="webhook",
                error="No webhook URL configured",
            )

        headers = config.get("headers", {})
        method = config.get("method", "POST").upper()

        payload = {
            "alert_id": alert.alert_id,
            "rule_id": alert.rule_id,
            "rule_name": alert.rule_name,
            "severity": alert.severity.value,
            "action": alert.action.value,
            "message": alert.message,
            "triggered_at": alert.triggered_at.isoformat(),
            "context": {
                "tenant_id": alert.context.tenant_id,
                "trace_id": alert.context.trace_id,
                "agent_role": alert.context.agent_role,
                "tool_name": alert.context.tool_name,
                "event_type": alert.context.event_type,
                "error": alert.context.error,
                "metadata": alert.context.metadata,
            },
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    method,
                    webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json", **headers},
                    timeout=30.0,
                )
                response.raise_for_status()

            return NotificationResult(
                success=True,
                channel="webhook",
                response={
                    "status_code": response.status_code,
                    "body": response.text[:500],
                },
            )

        except Exception as e:
            return NotificationResult(
                success=False,
                channel="webhook",
                error=str(e),
            )


class NotificationService:
    """
    Service for sending notifications through multiple channels.
    """

    def __init__(self):
        self.channels: dict[str, NotificationChannel] = {
            "email": EmailNotificationChannel(),
            "slack": SlackNotificationChannel(),
            "webhook": WebhookNotificationChannel(),
        }

    async def send_alert(
        self,
        alert: TriggeredAlert,
        notification_config: dict[str, Any],
    ) -> list[NotificationResult]:
        """
        Send alert through all configured notification channels.

        Args:
            alert: The triggered alert
            notification_config: Channel configurations, e.g.:
                {
                    "email": {"enabled": True, "email": "user@example.com"},
                    "slack": {"enabled": True, "webhook_url": "https://..."},
                    "webhook": {"enabled": True, "url": "https://..."}
                }

        Returns:
            List of results from each channel
        """
        results: list[NotificationResult] = []
        tasks = []

        for channel_name, config in notification_config.items():
            if not config.get("enabled", False):
                continue

            channel = self.channels.get(channel_name)
            if channel:
                tasks.append(channel.send(alert, config))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            # Convert exceptions to NotificationResult
            results = [
                r if isinstance(r, NotificationResult)
                else NotificationResult(success=False, channel="unknown", error=str(r))
                for r in results
            ]

        return results


# Global service instance
_notification_service: NotificationService | None = None


def get_notification_service() -> NotificationService:
    """Get the global notification service."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
