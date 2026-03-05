"""
In-memory trace storage for MVP.

In production, this would be replaced with QuestDB or another time-series database.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any


@dataclass
class StoredEvent:
    """A stored trace event with all data."""

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
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class StoredTrace:
    """A stored trace with metadata."""

    trace_id: str
    user_id: str
    project_name: str
    environment: str
    started_at: datetime
    ended_at: datetime | None = None
    status: str = "running"  # running, completed, failed
    events: list[StoredEvent] = field(default_factory=list)

    @property
    def event_count(self) -> int:
        return len(self.events)

    @property
    def agent_count(self) -> int:
        agents = set()
        for e in self.events:
            if e.agent_role:
                agents.add(e.agent_role)
        return len(agents)

    @property
    def agents(self) -> list[str]:
        agents = set()
        for e in self.events:
            if e.agent_role:
                agents.add(e.agent_role)
        return sorted(agents)

    @property
    def tools_used(self) -> list[str]:
        tools = set()
        for e in self.events:
            if e.tool_name:
                tools.add(e.tool_name)
        return sorted(tools)

    @property
    def error_count(self) -> int:
        return sum(1 for e in self.events if e.error)

    @property
    def duration_ms(self) -> float | None:
        if not self.events:
            return None
        if self.ended_at and self.started_at:
            return (self.ended_at - self.started_at).total_seconds() * 1000
        # Calculate from events
        timestamps = [e.timestamp for e in self.events]
        if timestamps:
            return (max(timestamps) - min(timestamps)).total_seconds() * 1000
        return None


class TraceStore:
    """
    Thread-safe in-memory store for traces and events.

    Data is stored per-user for multi-tenancy.
    """

    def __init__(self, max_traces_per_user: int = 100, max_events_per_trace: int = 10000):
        self._lock = Lock()
        self._traces: dict[str, dict[str, StoredTrace]] = defaultdict(dict)  # user_id -> trace_id -> trace
        self._max_traces = max_traces_per_user
        self._max_events = max_events_per_trace

    def store_event(
        self,
        user_id: str,
        event_id: str,
        trace_id: str,
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
    ) -> None:
        """Store a single event."""
        with self._lock:
            # Get or create trace
            user_traces = self._traces[user_id]

            if trace_id not in user_traces:
                # Create new trace
                if len(user_traces) >= self._max_traces:
                    # Remove oldest trace
                    oldest_id = min(user_traces.keys(), key=lambda k: user_traces[k].started_at)
                    del user_traces[oldest_id]

                user_traces[trace_id] = StoredTrace(
                    trace_id=trace_id,
                    user_id=user_id,
                    project_name=project_name,
                    environment=environment,
                    started_at=datetime.fromtimestamp(timestamp, tz=timezone.utc),
                )

            trace = user_traces[trace_id]

            # Check event limit
            if len(trace.events) >= self._max_events:
                return  # Drop event if limit reached

            # Create event
            event = StoredEvent(
                event_id=event_id,
                trace_id=trace_id,
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

            trace.events.append(event)

            # Update trace status based on event type
            if event_type == "crew_completed":
                trace.status = "completed"
                trace.ended_at = event.timestamp
            elif event_type == "crew_failed":
                trace.status = "failed"
                trace.ended_at = event.timestamp

    def get_traces(
        self,
        user_id: str,
        status: str | None = None,
        agent: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[StoredTrace], int]:
        """Get traces for a user with filtering."""
        with self._lock:
            user_traces = self._traces.get(user_id, {})
            traces = list(user_traces.values())

            # Sort by start time descending
            traces.sort(key=lambda t: t.started_at, reverse=True)

            # Filter by status
            if status:
                traces = [t for t in traces if t.status == status]

            # Filter by agent
            if agent:
                traces = [t for t in traces if agent in t.agents]

            total = len(traces)

            # Paginate
            traces = traces[offset:offset + limit]

            return traces, total

    def get_trace(self, user_id: str, trace_id: str) -> StoredTrace | None:
        """Get a specific trace."""
        with self._lock:
            user_traces = self._traces.get(user_id, {})
            return user_traces.get(trace_id)

    def get_trace_events(
        self,
        user_id: str,
        trace_id: str,
        event_type: str | None = None,
        agent: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[StoredEvent]:
        """Get events for a specific trace with filtering."""
        with self._lock:
            trace = self.get_trace(user_id, trace_id)
            if not trace:
                return []

            events = trace.events

            # Filter by event type
            if event_type:
                events = [e for e in events if e.event_type == event_type]

            # Filter by agent
            if agent:
                events = [e for e in events if e.agent_role == agent]

            # Sort by timestamp
            events = sorted(events, key=lambda e: e.timestamp)

            # Paginate
            return events[offset:offset + limit]

    def get_all_agents(self, user_id: str) -> list[str]:
        """Get all unique agent roles for a user."""
        with self._lock:
            agents = set()
            for trace in self._traces.get(user_id, {}).values():
                agents.update(trace.agents)
            return sorted(agents)

    def get_all_tools(self, user_id: str) -> list[str]:
        """Get all unique tools for a user."""
        with self._lock:
            tools = set()
            for trace in self._traces.get(user_id, {}).values():
                tools.update(trace.tools_used)
            return sorted(tools)

    def get_metrics(self, user_id: str) -> dict[str, Any]:
        """Get aggregated metrics for a user."""
        with self._lock:
            user_traces = self._traces.get(user_id, {})

            total_traces = len(user_traces)
            total_events = sum(t.event_count for t in user_traces.values())
            total_errors = sum(t.error_count for t in user_traces.values())

            durations = [t.duration_ms for t in user_traces.values() if t.duration_ms]
            avg_duration = sum(durations) / len(durations) if durations else None

            agents = set()
            tool_counts: dict[str, int] = defaultdict(int)

            for trace in user_traces.values():
                agents.update(trace.agents)
                for tool in trace.tools_used:
                    # Count tool usage
                    for e in trace.events:
                        if e.tool_name == tool:
                            tool_counts[tool] += 1

            top_tools = sorted(tool_counts.items(), key=lambda x: x[1], reverse=True)[:10]

            return {
                "total_traces": total_traces,
                "total_events": total_events,
                "total_errors": total_errors,
                "avg_duration_ms": avg_duration,
                "active_agents": len(agents),
                "top_tools": [{"name": name, "count": count} for name, count in top_tools],
            }

    def clear_user_data(self, user_id: str) -> None:
        """Clear all data for a user."""
        with self._lock:
            if user_id in self._traces:
                del self._traces[user_id]


# Global singleton instance
trace_store = TraceStore()
