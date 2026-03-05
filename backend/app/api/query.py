"""Query API for retrieving trace data."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from .deps import CurrentUser, DBSession
from ..services.trace_store import trace_store, StoredEvent, StoredTrace

router = APIRouter()


# Response schemas
class TraceEvent(BaseModel):
    """A single trace event."""

    event_id: str
    trace_id: str
    event_type: str
    timestamp: datetime
    agent_role: str | None = None
    task_description: str | None = None
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_result: str | None = None
    duration_ms: float | None = None
    error: bool = False
    error_message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TraceSummary(BaseModel):
    """Summary of a trace."""

    trace_id: str
    project_name: str
    environment: str
    started_at: datetime
    ended_at: datetime | None
    status: str  # 'running', 'completed', 'failed'
    event_count: int
    agent_count: int
    error_count: int
    duration_ms: float | None


class TraceDetail(BaseModel):
    """Detailed trace information."""

    trace_id: str
    project_name: str
    environment: str
    started_at: datetime
    ended_at: datetime | None
    status: str
    events: list[TraceEvent]
    agents: list[str]
    tools_used: list[str]
    error_count: int


class TraceListResponse(BaseModel):
    """Response for listing traces."""

    traces: list[TraceSummary]
    total: int
    page: int
    page_size: int


class MetricsSummary(BaseModel):
    """Summary metrics."""

    total_traces: int
    total_events: int
    total_errors: int
    avg_duration_ms: float | None
    active_agents: int
    top_tools: list[dict[str, Any]]


# Helper functions
def _stored_trace_to_summary(trace: StoredTrace) -> TraceSummary:
    """Convert a StoredTrace to TraceSummary."""
    return TraceSummary(
        trace_id=trace.trace_id,
        project_name=trace.project_name,
        environment=trace.environment,
        started_at=trace.started_at,
        ended_at=trace.ended_at,
        status=trace.status,
        event_count=trace.event_count,
        agent_count=trace.agent_count,
        error_count=trace.error_count,
        duration_ms=trace.duration_ms,
    )


def _stored_event_to_trace_event(event: StoredEvent) -> TraceEvent:
    """Convert a StoredEvent to TraceEvent."""
    return TraceEvent(
        event_id=event.event_id,
        trace_id=event.trace_id,
        event_type=event.event_type,
        timestamp=event.timestamp,
        agent_role=event.agent_role,
        task_description=event.task_description,
        tool_name=event.tool_name,
        tool_input=event.tool_input,
        tool_result=event.tool_result,
        duration_ms=event.duration_ms,
        error=event.error,
        error_message=event.error_message,
        payload=event.payload,
    )


@router.get("", response_model=TraceListResponse)
async def list_traces(
    user: CurrentUser,
    db: DBSession,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
    agent: str | None = None,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
) -> TraceListResponse:
    """
    List traces with filtering and pagination.

    Filters:
    - status: 'running', 'completed', 'failed'
    - agent: Filter by agent role
    - from_time: Start of time range
    - to_time: End of time range
    """
    user_id = str(user.id)
    offset = (page - 1) * page_size

    traces, total = trace_store.get_traces(
        user_id=user_id,
        status=status,
        agent=agent,
        limit=page_size,
        offset=offset,
    )

    trace_summaries = [_stored_trace_to_summary(t) for t in traces]

    return TraceListResponse(
        traces=trace_summaries,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{trace_id}", response_model=TraceDetail)
async def get_trace(
    trace_id: str,
    user: CurrentUser,
    db: DBSession,
) -> TraceDetail:
    """Get detailed information about a specific trace."""
    user_id = str(user.id)

    trace = trace_store.get_trace(user_id, trace_id)

    if not trace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trace {trace_id} not found",
        )

    events = [_stored_event_to_trace_event(e) for e in trace.events]

    return TraceDetail(
        trace_id=trace.trace_id,
        project_name=trace.project_name,
        environment=trace.environment,
        started_at=trace.started_at,
        ended_at=trace.ended_at,
        status=trace.status,
        events=events,
        agents=trace.agents,
        tools_used=trace.tools_used,
        error_count=trace.error_count,
    )


@router.get("/{trace_id}/events", response_model=list[TraceEvent])
async def get_trace_events(
    trace_id: str,
    user: CurrentUser,
    db: DBSession,
    event_type: str | None = None,
    agent: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[TraceEvent]:
    """Get events for a specific trace with filtering."""
    user_id = str(user.id)

    events = trace_store.get_trace_events(
        user_id=user_id,
        trace_id=trace_id,
        event_type=event_type,
        agent=agent,
        limit=limit,
        offset=offset,
    )

    return [_stored_event_to_trace_event(e) for e in events]


@router.get("/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    user: CurrentUser,
    db: DBSession,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
) -> MetricsSummary:
    """Get aggregated metrics summary."""
    user_id = str(user.id)

    metrics = trace_store.get_metrics(user_id)

    return MetricsSummary(
        total_traces=metrics["total_traces"],
        total_events=metrics["total_events"],
        total_errors=metrics["total_errors"],
        avg_duration_ms=metrics["avg_duration_ms"],
        active_agents=metrics["active_agents"],
        top_tools=metrics["top_tools"],
    )


@router.get("/agents", response_model=list[str])
async def list_agents(
    user: CurrentUser,
    db: DBSession,
) -> list[str]:
    """List all unique agent roles seen."""
    user_id = str(user.id)
    return trace_store.get_all_agents(user_id)


@router.get("/tools", response_model=list[str])
async def list_tools(
    user: CurrentUser,
    db: DBSession,
) -> list[str]:
    """List all unique tools used."""
    user_id = str(user.id)
    return trace_store.get_all_tools(user_id)
