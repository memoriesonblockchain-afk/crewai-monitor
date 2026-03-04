"""Alerts API endpoints for managing alert rules and viewing alerts."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc

from .deps import CurrentUser, DBSession
from ..models.alert import AlertRule, AlertEvent

router = APIRouter()


# Request/Response schemas
class AlertRuleConfig(BaseModel):
    """Configuration for an alert rule."""

    threshold: int | None = None
    window_seconds: int | None = None
    tool_name: str | None = None
    max_calls: int | None = None
    max_duration_ms: int | None = None


class NotificationConfig(BaseModel):
    """Notification channel configuration."""

    email: dict[str, Any] | None = None
    slack: dict[str, Any] | None = None
    webhook: dict[str, Any] | None = None


class CreateAlertRuleRequest(BaseModel):
    """Request to create an alert rule."""

    name: str
    description: str | None = None
    rule_type: str  # 'repeated_calls', 'error_rate', 'rate_limit', 'long_running'
    config: AlertRuleConfig
    action: str = "alert"  # 'alert', 'kill', 'alert_and_kill'
    notifications: NotificationConfig | None = None


class UpdateAlertRuleRequest(BaseModel):
    """Request to update an alert rule."""

    name: str | None = None
    description: str | None = None
    config: AlertRuleConfig | None = None
    action: str | None = None
    notifications: NotificationConfig | None = None
    enabled: bool | None = None


class AlertRuleResponse(BaseModel):
    """Response for an alert rule."""

    id: str
    name: str
    description: str | None
    rule_type: str
    config: dict[str, Any]
    action: str
    notifications: dict[str, Any]
    enabled: bool
    created_at: datetime
    updated_at: datetime


class AlertRuleListResponse(BaseModel):
    """Response for listing alert rules."""

    rules: list[AlertRuleResponse]
    total: int


class AlertEventResponse(BaseModel):
    """Response for an alert event."""

    id: str
    alert_rule_id: str
    rule_name: str | None = None
    trace_id: str | None
    agent_role: str | None
    message: str
    severity: str
    action_taken: str | None
    context: dict[str, Any]
    created_at: datetime
    acknowledged_at: datetime | None


class AlertEventListResponse(BaseModel):
    """Response for listing alert events."""

    events: list[AlertEventResponse]
    total: int


# Alert Rules endpoints
@router.get("/rules", response_model=AlertRuleListResponse)
async def list_alert_rules(
    current_user: CurrentUser,
    db: DBSession,
) -> AlertRuleListResponse:
    """List all alert rules for the current user."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == current_user.id)
        .order_by(desc(AlertRule.created_at))
    )
    rules = result.scalars().all()

    return AlertRuleListResponse(
        rules=[
            AlertRuleResponse(
                id=rule.id,
                name=rule.name,
                description=rule.description,
                rule_type=rule.rule_type,
                config=rule.config,
                action=rule.action,
                notifications=rule.notifications,
                enabled=rule.enabled,
                created_at=rule.created_at,
                updated_at=rule.updated_at,
            )
            for rule in rules
        ],
        total=len(rules),
    )


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    request: CreateAlertRuleRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> AlertRuleResponse:
    """Create a new alert rule."""
    # Validate rule type
    valid_types = {"repeated_calls", "error_rate", "rate_limit", "long_running", "custom"}
    if request.rule_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid rule_type. Must be one of: {valid_types}",
        )

    # Validate action
    valid_actions = {"alert", "kill", "alert_and_kill"}
    if request.action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action. Must be one of: {valid_actions}",
        )

    rule = AlertRule(
        user_id=current_user.id,
        name=request.name,
        description=request.description,
        rule_type=request.rule_type,
        config=request.config.model_dump(exclude_none=True),
        action=request.action,
        notifications=request.notifications.model_dump(exclude_none=True) if request.notifications else {},
        enabled=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        rule_type=rule.rule_type,
        config=rule.config,
        action=rule.action,
        notifications=rule.notifications,
        enabled=rule.enabled,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.get("/rules/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> AlertRuleResponse:
    """Get a specific alert rule."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.id == rule_id)
        .where(AlertRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found",
        )

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        rule_type=rule.rule_type,
        config=rule.config,
        action=rule.action,
        notifications=rule.notifications,
        enabled=rule.enabled,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.patch("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: str,
    request: UpdateAlertRuleRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> AlertRuleResponse:
    """Update an alert rule."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.id == rule_id)
        .where(AlertRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found",
        )

    # Update fields
    if request.name is not None:
        rule.name = request.name
    if request.description is not None:
        rule.description = request.description
    if request.config is not None:
        rule.config = {**rule.config, **request.config.model_dump(exclude_none=True)}
    if request.action is not None:
        rule.action = request.action
    if request.notifications is not None:
        rule.notifications = request.notifications.model_dump(exclude_none=True)
    if request.enabled is not None:
        rule.enabled = request.enabled

    await db.commit()
    await db.refresh(rule)

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        rule_type=rule.rule_type,
        config=rule.config,
        action=rule.action,
        notifications=rule.notifications,
        enabled=rule.enabled,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> None:
    """Delete an alert rule."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.id == rule_id)
        .where(AlertRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found",
        )

    await db.delete(rule)
    await db.commit()


# Alert Events endpoints
@router.get("/events", response_model=AlertEventListResponse)
async def list_alert_events(
    current_user: CurrentUser,
    db: DBSession,
    severity: str | None = None,
    acknowledged: bool | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AlertEventListResponse:
    """List alert events for the current user."""
    # Get user's rules first
    rules_result = await db.execute(
        select(AlertRule.id, AlertRule.name)
        .where(AlertRule.user_id == current_user.id)
    )
    user_rules = {row[0]: row[1] for row in rules_result.all()}

    if not user_rules:
        return AlertEventListResponse(events=[], total=0)

    # Build query
    query = select(AlertEvent).where(AlertEvent.alert_rule_id.in_(user_rules.keys()))

    if severity:
        query = query.where(AlertEvent.severity == severity)
    if acknowledged is not None:
        if acknowledged:
            query = query.where(AlertEvent.acknowledged_at.is_not(None))
        else:
            query = query.where(AlertEvent.acknowledged_at.is_(None))

    query = query.order_by(desc(AlertEvent.created_at)).offset(offset).limit(limit)

    result = await db.execute(query)
    events = result.scalars().all()

    # Count total
    count_query = select(AlertEvent).where(AlertEvent.alert_rule_id.in_(user_rules.keys()))
    if severity:
        count_query = count_query.where(AlertEvent.severity == severity)
    if acknowledged is not None:
        if acknowledged:
            count_query = count_query.where(AlertEvent.acknowledged_at.is_not(None))
        else:
            count_query = count_query.where(AlertEvent.acknowledged_at.is_(None))

    count_result = await db.execute(count_query)
    total = len(count_result.all())

    return AlertEventListResponse(
        events=[
            AlertEventResponse(
                id=event.id,
                alert_rule_id=event.alert_rule_id,
                rule_name=user_rules.get(event.alert_rule_id),
                trace_id=event.trace_id,
                agent_role=event.agent_role,
                message=event.message,
                severity=event.severity,
                action_taken=event.action_taken,
                context=event.context,
                created_at=event.created_at,
                acknowledged_at=event.acknowledged_at,
            )
            for event in events
        ],
        total=total,
    )


@router.post("/events/{event_id}/acknowledge", status_code=status.HTTP_204_NO_CONTENT)
async def acknowledge_alert(
    event_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> None:
    """Acknowledge an alert event."""
    # Verify the event belongs to the user
    result = await db.execute(
        select(AlertEvent)
        .join(AlertRule, AlertEvent.alert_rule_id == AlertRule.id)
        .where(AlertEvent.id == event_id)
        .where(AlertRule.user_id == current_user.id)
    )
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert event not found",
        )

    event.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/events/acknowledge-all", status_code=status.HTTP_204_NO_CONTENT)
async def acknowledge_all_alerts(
    current_user: CurrentUser,
    db: DBSession,
) -> None:
    """Acknowledge all unacknowledged alert events."""
    # Get user's rules
    rules_result = await db.execute(
        select(AlertRule.id).where(AlertRule.user_id == current_user.id)
    )
    rule_ids = [row[0] for row in rules_result.all()]

    if not rule_ids:
        return

    # Update all unacknowledged events
    events_result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.alert_rule_id.in_(rule_ids))
        .where(AlertEvent.acknowledged_at.is_(None))
    )
    events = events_result.scalars().all()

    now = datetime.now(timezone.utc)
    for event in events:
        event.acknowledged_at = now

    await db.commit()


# Default alert rules templates
DEFAULT_RULES = [
    {
        "name": "Repeated Tool Calls",
        "description": "Trigger when the same tool is called 10+ times in 30 seconds",
        "rule_type": "repeated_calls",
        "config": {"threshold": 10, "window_seconds": 30, "tool_name": "*"},
        "action": "alert",
    },
    {
        "name": "High Error Rate",
        "description": "Trigger when 5+ errors occur in 60 seconds",
        "rule_type": "error_rate",
        "config": {"threshold": 5, "window_seconds": 60},
        "action": "alert",
    },
    {
        "name": "Rate Limit Exceeded",
        "description": "Trigger when 100+ events occur in 60 seconds",
        "rule_type": "rate_limit",
        "config": {"max_calls": 100, "window_seconds": 60},
        "action": "alert_and_kill",
    },
]


@router.post("/rules/create-defaults", response_model=AlertRuleListResponse)
async def create_default_rules(
    current_user: CurrentUser,
    db: DBSession,
) -> AlertRuleListResponse:
    """Create default alert rules for a new user."""
    created_rules = []

    for rule_data in DEFAULT_RULES:
        # Check if rule with same name already exists
        result = await db.execute(
            select(AlertRule)
            .where(AlertRule.user_id == current_user.id)
            .where(AlertRule.name == rule_data["name"])
        )
        if result.scalar_one_or_none():
            continue

        rule = AlertRule(
            user_id=current_user.id,
            name=rule_data["name"],
            description=rule_data["description"],
            rule_type=rule_data["rule_type"],
            config=rule_data["config"],
            action=rule_data["action"],
            notifications={},
            enabled=True,
        )
        db.add(rule)
        created_rules.append(rule)

    await db.commit()

    # Refresh all rules
    for rule in created_rules:
        await db.refresh(rule)

    return AlertRuleListResponse(
        rules=[
            AlertRuleResponse(
                id=rule.id,
                name=rule.name,
                description=rule.description,
                rule_type=rule.rule_type,
                config=rule.config,
                action=rule.action,
                notifications=rule.notifications,
                enabled=rule.enabled,
                created_at=rule.created_at,
                updated_at=rule.updated_at,
            )
            for rule in created_rules
        ],
        total=len(created_rules),
    )
