"""Query API for retrieving trace data."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from .deps import CurrentUser, DBSession

router = APIRouter()


# Response schemas
class TraceEvent(BaseModel):
    """A single trace event."""

    event_id: str
    trace_id: str
    event_type: str
    timestamp: datetime
    agent_role: str | None = None
    tool_name: str | None = None
    duration_ms: float | None = None
    error: bool = False
    error_message: str | None = None


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


# In-memory trace storage for MVP (in production, use QuestDB)
_traces: dict[str, dict[str, Any]] = {}


# Endpoints
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
    # For MVP, return mock data
    # In production, query QuestDB

    mock_traces = [
        TraceSummary(
            trace_id="trace-001",
            project_name="demo-project",
            environment="development",
            started_at=datetime.now(timezone.utc),
            ended_at=None,
            status="running",
            event_count=42,
            agent_count=3,
            error_count=0,
            duration_ms=None,
        ),
        TraceSummary(
            trace_id="trace-002",
            project_name="demo-project",
            environment="development",
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
            status="completed",
            event_count=128,
            agent_count=5,
            error_count=2,
            duration_ms=45320.5,
        ),
    ]

    return TraceListResponse(
        traces=mock_traces,
        total=len(mock_traces),
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
    # For MVP, return mock data
    # In production, query QuestDB

    mock_events = [
        TraceEvent(
            event_id="evt-001",
            trace_id=trace_id,
            event_type="crew_started",
            timestamp=datetime.now(timezone.utc),
        ),
        TraceEvent(
            event_id="evt-002",
            trace_id=trace_id,
            event_type="agent_started",
            timestamp=datetime.now(timezone.utc),
            agent_role="Researcher",
        ),
        TraceEvent(
            event_id="evt-003",
            trace_id=trace_id,
            event_type="tool_started",
            timestamp=datetime.now(timezone.utc),
            agent_role="Researcher",
            tool_name="search_web",
        ),
    ]

    return TraceDetail(
        trace_id=trace_id,
        project_name="demo-project",
        environment="development",
        started_at=datetime.now(timezone.utc),
        ended_at=None,
        status="running",
        events=mock_events,
        agents=["Researcher", "Writer", "Editor"],
        tools_used=["search_web", "read_file", "write_file"],
        error_count=0,
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
    # For MVP, return mock data
    return []


@router.get("/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    user: CurrentUser,
    db: DBSession,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
) -> MetricsSummary:
    """Get aggregated metrics summary."""
    # For MVP, return mock data
    return MetricsSummary(
        total_traces=156,
        total_events=12847,
        total_errors=23,
        avg_duration_ms=32150.5,
        active_agents=8,
        top_tools=[
            {"name": "search_web", "count": 542},
            {"name": "read_file", "count": 321},
            {"name": "write_file", "count": 198},
        ],
    )


@router.get("/agents", response_model=list[str])
async def list_agents(
    user: CurrentUser,
    db: DBSession,
) -> list[str]:
    """List all unique agent roles seen."""
    # For MVP, return mock data
    return ["Researcher", "Writer", "Editor", "Reviewer", "Publisher"]


@router.get("/tools", response_model=list[str])
async def list_tools(
    user: CurrentUser,
    db: DBSession,
) -> list[str]:
    """List all unique tools used."""
    # For MVP, return mock data
    return ["search_web", "read_file", "write_file", "execute_code", "send_email"]
