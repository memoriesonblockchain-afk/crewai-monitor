"""Service for persisting and querying traces from PostgreSQL."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.trace import Trace, Event


class TraceService:
    """Service for trace and event persistence."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_trace(
        self,
        user_id: str,
        trace_id: str,
        project_name: str = "default",
        environment: str = "development",
    ) -> Trace:
        """Get existing trace or create a new one."""
        # Try to find existing trace
        result = await self.db.execute(
            select(Trace).where(
                and_(Trace.user_id == user_id, Trace.trace_id == trace_id)
            )
        )
        trace = result.scalar_one_or_none()

        if trace:
            return trace

        # Create new trace
        trace = Trace(
            user_id=user_id,
            trace_id=trace_id,
            project_name=project_name,
            environment=environment,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(trace)
        await self.db.flush()  # Get the ID without committing
        return trace

    async def store_event(
        self,
        user_id: str,
        trace_id: str,
        event_id: str,
        event_type: str,
        timestamp: float,
        project_name: str = "default",
        environment: str = "development",
        agent_role: str | None = None,
        task_description: str | None = None,
        tool_name: str | None = None,
        tool_input: dict[str, Any] | None = None,
        tool_result: str | None = None,
        duration_ms: float | None = None,
        error: bool = False,
        error_message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Event:
        """Store a single event."""
        # Get or create the trace
        trace = await self.get_or_create_trace(
            user_id=user_id,
            trace_id=trace_id,
            project_name=project_name,
            environment=environment,
        )

        # Create the event
        event = Event(
            trace_db_id=trace.id,
            event_id=event_id,
            event_type=event_type,
            timestamp=datetime.fromtimestamp(timestamp, tz=timezone.utc),
            agent_role=agent_role,
            task_description=task_description,
            tool_name=tool_name,
            tool_input=tool_input,
            tool_result=tool_result,
            duration_ms=duration_ms,
            error=error,
            error_message=error_message,
            payload=payload or {},
        )
        self.db.add(event)

        # Update trace status based on event type
        if event_type in ("crew_completed", "crew_finished"):
            trace.status = "completed"
            trace.ended_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            if trace.started_at:
                trace.duration_ms = (trace.ended_at - trace.started_at).total_seconds() * 1000
        elif event_type in ("crew_failed", "crew_error"):
            trace.status = "failed"
            trace.ended_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            trace.error_count += 1

        # Count errors
        if error:
            trace.error_count += 1

        return event

    async def get_traces(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Trace], int]:
        """Get traces for a user with optional status filter."""
        query = select(Trace).where(Trace.user_id == user_id)

        if status:
            query = query.where(Trace.status == status)

        # Get total count
        count_query = select(func.count()).select_from(
            query.subquery()
        )
        total = await self.db.scalar(count_query) or 0

        # Get traces with pagination
        query = query.order_by(Trace.started_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(query)
        traces = list(result.scalars().all())

        return traces, total

    async def get_trace(self, user_id: str, trace_id: str) -> Trace | None:
        """Get a single trace with its events."""
        result = await self.db.execute(
            select(Trace)
            .options(selectinload(Trace.events))
            .where(and_(Trace.user_id == user_id, Trace.trace_id == trace_id))
        )
        return result.scalar_one_or_none()

    async def get_trace_events(
        self,
        user_id: str,
        trace_id: str,
        event_type: str | None = None,
        limit: int = 1000,
    ) -> list[Event]:
        """Get events for a trace."""
        # First get the trace to verify ownership
        trace = await self.get_trace(user_id, trace_id)
        if not trace:
            return []

        query = select(Event).where(Event.trace_db_id == trace.id)

        if event_type:
            query = query.where(Event.event_type == event_type)

        query = query.order_by(Event.timestamp).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_metrics(self, user_id: str) -> dict[str, Any]:
        """Get aggregated metrics for a user."""
        # Total traces
        total_traces = await self.db.scalar(
            select(func.count()).where(Trace.user_id == user_id)
        ) or 0

        # Total events
        total_events = await self.db.scalar(
            select(func.count())
            .select_from(Event)
            .join(Trace)
            .where(Trace.user_id == user_id)
        ) or 0

        # Total errors
        total_errors = await self.db.scalar(
            select(func.sum(Trace.error_count)).where(Trace.user_id == user_id)
        ) or 0

        # Average duration
        avg_duration = await self.db.scalar(
            select(func.avg(Trace.duration_ms))
            .where(Trace.user_id == user_id)
            .where(Trace.duration_ms.isnot(None))
        )

        # Active (unique) agents
        active_agents = await self.db.scalar(
            select(func.count(func.distinct(Event.agent_role)))
            .join(Trace)
            .where(Trace.user_id == user_id)
            .where(Event.agent_role.isnot(None))
        ) or 0

        # Top tools
        top_tools_query = (
            select(Event.tool_name, func.count().label("count"))
            .join(Trace)
            .where(Trace.user_id == user_id)
            .where(Event.tool_name.isnot(None))
            .group_by(Event.tool_name)
            .order_by(func.count().desc())
            .limit(10)
        )
        result = await self.db.execute(top_tools_query)
        top_tools = [{"name": row[0], "count": row[1]} for row in result.all()]

        return {
            "total_traces": total_traces,
            "total_events": total_events,
            "total_errors": int(total_errors),
            "avg_duration_ms": float(avg_duration) if avg_duration else None,
            "active_agents": active_agents,
            "top_tools": top_tools,
        }

    async def get_agents(self, user_id: str) -> list[str]:
        """Get unique agent roles for a user."""
        result = await self.db.execute(
            select(func.distinct(Event.agent_role))
            .join(Trace)
            .where(Trace.user_id == user_id)
            .where(Event.agent_role.isnot(None))
            .order_by(Event.agent_role)
        )
        return [row[0] for row in result.all()]

    async def get_tools(self, user_id: str) -> list[str]:
        """Get unique tool names for a user."""
        result = await self.db.execute(
            select(func.distinct(Event.tool_name))
            .join(Trace)
            .where(Trace.user_id == user_id)
            .where(Event.tool_name.isnot(None))
            .order_by(Event.tool_name)
        )
        return [row[0] for row in result.all()]

    async def commit(self) -> None:
        """Commit the current transaction."""
        await self.db.commit()
