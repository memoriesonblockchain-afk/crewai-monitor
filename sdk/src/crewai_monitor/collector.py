"""
Trace collector that listens to CrewAI events and collects trace data.

This module implements a BaseEventListener that captures all CrewAI events
and sends them to the monitoring backend.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .client import MonitorClient
    from .config import MonitorConfig

# Import CrewAI event types
try:
    from crewai.utilities.events.base_event_listener import BaseEventListener
    from crewai.utilities.events.crew_events import (
        CrewKickoffCompletedEvent,
        CrewKickoffFailedEvent,
        CrewKickoffStartedEvent,
    )
    from crewai.utilities.events.agent_events import (
        AgentExecutionCompletedEvent,
        AgentExecutionErrorEvent,
        AgentExecutionStartedEvent,
    )
    from crewai.utilities.events.task_events import (
        TaskCompletedEvent,
        TaskFailedEvent,
        TaskStartedEvent,
    )
    from crewai.utilities.events.tool_usage_events import (
        ToolUsageErrorEvent,
        ToolUsageFinishedEvent,
        ToolUsageStartedEvent,
    )
    from crewai.utilities.events.llm_events import (
        LLMCallCompletedEvent,
        LLMCallFailedEvent,
        LLMCallStartedEvent,
    )

    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    BaseEventListener = object


@dataclass
class TraceEvent:
    """A single trace event."""

    event_id: str
    trace_id: str
    event_type: str
    timestamp: float
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
class AgentMetrics:
    """Metrics for a single agent."""

    tool_calls: int = 0
    llm_calls: int = 0
    errors: int = 0
    total_duration_ms: float = 0.0
    tool_call_history: list[dict[str, Any]] = field(default_factory=list)


class TraceCollector(BaseEventListener if CREWAI_AVAILABLE else object):
    """
    Collects trace events from CrewAI and sends them to the monitoring backend.

    This class:
    - Listens to all CrewAI events via the event bus
    - Tracks metrics per agent for anomaly detection
    - Batches events and sends to the backend
    - Maintains kill switch state
    """

    def __init__(self, config: MonitorConfig, client: MonitorClient) -> None:
        if CREWAI_AVAILABLE:
            super().__init__()

        self.config = config
        self.client = client

        # State
        self._lock = threading.RLock()
        self._events: list[TraceEvent] = []
        self._current_trace_id: str | None = None
        self._agent_metrics: dict[str, AgentMetrics] = defaultdict(AgentMetrics)

        # Kill switch state: {agent_role: True/False}
        self._kill_flags: dict[str, bool] = {}

        # Start time tracking for tool calls
        self._tool_start_times: dict[str, float] = {}
        self._llm_start_times: dict[str, float] = {}

        # Background flush thread
        self._flush_thread: threading.Thread | None = None
        self._stop_flush = threading.Event()
        self._start_flush_thread()

    def setup_listeners(self, crewai_event_bus: Any) -> None:
        """Set up event listeners on the CrewAI event bus."""
        if not CREWAI_AVAILABLE:
            return

        # Crew events
        @crewai_event_bus.on(CrewKickoffStartedEvent)
        def on_crew_started(source: Any, event: CrewKickoffStartedEvent) -> None:
            self._handle_crew_started(event)

        @crewai_event_bus.on(CrewKickoffCompletedEvent)
        def on_crew_completed(source: Any, event: CrewKickoffCompletedEvent) -> None:
            self._handle_crew_completed(event)

        @crewai_event_bus.on(CrewKickoffFailedEvent)
        def on_crew_failed(source: Any, event: CrewKickoffFailedEvent) -> None:
            self._handle_crew_failed(event)

        # Agent events
        @crewai_event_bus.on(AgentExecutionStartedEvent)
        def on_agent_started(source: Any, event: AgentExecutionStartedEvent) -> None:
            self._handle_agent_started(event)

        @crewai_event_bus.on(AgentExecutionCompletedEvent)
        def on_agent_completed(source: Any, event: AgentExecutionCompletedEvent) -> None:
            self._handle_agent_completed(event)

        @crewai_event_bus.on(AgentExecutionErrorEvent)
        def on_agent_error(source: Any, event: AgentExecutionErrorEvent) -> None:
            self._handle_agent_error(event)

        # Task events
        @crewai_event_bus.on(TaskStartedEvent)
        def on_task_started(source: Any, event: TaskStartedEvent) -> None:
            self._handle_task_started(event)

        @crewai_event_bus.on(TaskCompletedEvent)
        def on_task_completed(source: Any, event: TaskCompletedEvent) -> None:
            self._handle_task_completed(event)

        @crewai_event_bus.on(TaskFailedEvent)
        def on_task_failed(source: Any, event: TaskFailedEvent) -> None:
            self._handle_task_failed(event)

        # Tool events
        @crewai_event_bus.on(ToolUsageStartedEvent)
        def on_tool_started(source: Any, event: ToolUsageStartedEvent) -> None:
            self._handle_tool_started(event)

        @crewai_event_bus.on(ToolUsageFinishedEvent)
        def on_tool_finished(source: Any, event: ToolUsageFinishedEvent) -> None:
            self._handle_tool_finished(event)

        @crewai_event_bus.on(ToolUsageErrorEvent)
        def on_tool_error(source: Any, event: ToolUsageErrorEvent) -> None:
            self._handle_tool_error(event)

        # LLM events
        @crewai_event_bus.on(LLMCallStartedEvent)
        def on_llm_started(source: Any, event: LLMCallStartedEvent) -> None:
            self._handle_llm_started(event)

        @crewai_event_bus.on(LLMCallCompletedEvent)
        def on_llm_completed(source: Any, event: LLMCallCompletedEvent) -> None:
            self._handle_llm_completed(event)

        @crewai_event_bus.on(LLMCallFailedEvent)
        def on_llm_failed(source: Any, event: LLMCallFailedEvent) -> None:
            self._handle_llm_failed(event)

    # Event handlers
    def _handle_crew_started(self, event: Any) -> None:
        with self._lock:
            self._current_trace_id = str(uuid.uuid4())
            self._add_event(
                event_type="crew_started",
                payload={
                    "crew_name": getattr(event, "crew_name", "unknown"),
                    "inputs": getattr(event, "inputs", {}),
                },
            )

    def _handle_crew_completed(self, event: Any) -> None:
        with self._lock:
            self._add_event(
                event_type="crew_completed",
                payload={
                    "crew_name": getattr(event, "crew_name", "unknown"),
                    "output": str(getattr(event, "output", ""))[:1000],
                },
            )
            self.flush()
            self._current_trace_id = None

    def _handle_crew_failed(self, event: Any) -> None:
        with self._lock:
            self._add_event(
                event_type="crew_failed",
                error=True,
                error_message=str(getattr(event, "error", "Unknown error")),
            )
            self.flush()
            self._current_trace_id = None

    def _handle_agent_started(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)
        agent = getattr(event, "agent", None)

        payload: dict[str, Any] = {}
        if agent:
            # Capture agent configuration
            if hasattr(agent, "goal"):
                payload["goal"] = str(agent.goal)[:500]
            if hasattr(agent, "backstory"):
                payload["backstory"] = str(agent.backstory)[:500]
            if hasattr(agent, "tools"):
                try:
                    tool_names = [t.name if hasattr(t, "name") else str(t) for t in agent.tools]
                    payload["tools"] = tool_names[:20]  # Limit to 20 tools
                except Exception:
                    pass
            if hasattr(agent, "llm"):
                llm = agent.llm
                if hasattr(llm, "model_name"):
                    payload["model"] = str(llm.model_name)
                elif hasattr(llm, "model"):
                    payload["model"] = str(llm.model)
            if hasattr(agent, "allow_delegation"):
                payload["allow_delegation"] = bool(agent.allow_delegation)
            if hasattr(agent, "verbose"):
                payload["verbose"] = bool(agent.verbose)

        self._add_event(
            event_type="agent_started",
            agent_role=agent_role,
            payload=payload if payload else None,
        )

    def _handle_agent_completed(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)
        self._add_event(
            event_type="agent_completed",
            agent_role=agent_role,
            payload={"output": str(getattr(event, "output", ""))[:1000]},
        )

    def _handle_agent_error(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)
        with self._lock:
            self._agent_metrics[agent_role].errors += 1
        self._add_event(
            event_type="agent_error",
            agent_role=agent_role,
            error=True,
            error_message=str(getattr(event, "error", "Unknown error")),
        )

    def _handle_task_started(self, event: Any) -> None:
        task = getattr(event, "task", None)
        task_desc = None
        payload: dict[str, Any] = {}

        if task:
            if hasattr(task, "description"):
                task_desc = str(task.description)[:500]
            if hasattr(task, "expected_output"):
                payload["expected_output"] = str(task.expected_output)[:500]
            if hasattr(task, "agent") and task.agent:
                if hasattr(task.agent, "role"):
                    payload["assigned_agent"] = str(task.agent.role)
            if hasattr(task, "context") and task.context:
                try:
                    context_tasks = [t.description[:100] if hasattr(t, "description") else str(t)[:100] for t in task.context]
                    payload["context_tasks"] = context_tasks[:5]  # Limit to 5
                except Exception:
                    pass
            if hasattr(task, "async_execution"):
                payload["async_execution"] = bool(task.async_execution)

        self._add_event(
            event_type="task_started",
            task_description=task_desc,
            payload=payload if payload else None,
        )

    def _handle_task_completed(self, event: Any) -> None:
        self._add_event(
            event_type="task_completed",
            payload={"output": str(getattr(event, "output", ""))[:1000]},
        )

    def _handle_task_failed(self, event: Any) -> None:
        self._add_event(
            event_type="task_failed",
            error=True,
            error_message=str(getattr(event, "error", "Unknown error")),
        )

    def _handle_tool_started(self, event: Any) -> None:
        tool_name = getattr(event, "tool_name", "unknown")
        agent_role = self._get_agent_role(event)
        tool_input = getattr(event, "tool_input", {})

        with self._lock:
            # Track start time
            key = f"{agent_role}:{tool_name}:{time.time()}"
            self._tool_start_times[key] = time.time()

            # Update metrics
            metrics = self._agent_metrics[agent_role]
            metrics.tool_calls += 1
            metrics.tool_call_history.append({
                "tool": tool_name,
                "timestamp": time.time(),
            })

            # Check for anomalies
            if self.config.enable_local_anomaly_detection:
                self._check_anomaly(agent_role, tool_name)

        self._add_event(
            event_type="tool_started",
            agent_role=agent_role,
            tool_name=tool_name,
            tool_input=tool_input if isinstance(tool_input, dict) else {"input": str(tool_input)},
        )

    def _handle_tool_finished(self, event: Any) -> None:
        tool_name = getattr(event, "tool_name", "unknown")
        agent_role = self._get_agent_role(event)
        tool_result = getattr(event, "tool_result", "")

        # Calculate duration
        duration_ms = None
        with self._lock:
            for key in list(self._tool_start_times.keys()):
                if key.startswith(f"{agent_role}:{tool_name}:"):
                    start_time = self._tool_start_times.pop(key)
                    duration_ms = (time.time() - start_time) * 1000
                    break

        self._add_event(
            event_type="tool_finished",
            agent_role=agent_role,
            tool_name=tool_name,
            tool_result=str(tool_result)[:1000],
            duration_ms=duration_ms,
        )

    def _handle_tool_error(self, event: Any) -> None:
        tool_name = getattr(event, "tool_name", "unknown")
        agent_role = self._get_agent_role(event)

        with self._lock:
            self._agent_metrics[agent_role].errors += 1

        self._add_event(
            event_type="tool_error",
            agent_role=agent_role,
            tool_name=tool_name,
            error=True,
            error_message=str(getattr(event, "error", "Unknown error")),
        )

    def _handle_llm_started(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)
        with self._lock:
            key = f"llm:{agent_role}:{time.time()}"
            self._llm_start_times[key] = time.time()
            self._agent_metrics[agent_role].llm_calls += 1

        # Extract prompt/messages from the event
        messages = getattr(event, "messages", None)
        prompt = getattr(event, "prompt", None)
        model = getattr(event, "model", None) or getattr(event, "model_name", None)

        # Build payload with available LLM request data
        payload: dict[str, Any] = {}
        if model:
            payload["model"] = str(model)
        if messages:
            # Truncate messages for storage but keep structure
            payload["messages"] = self._truncate_messages(messages)
        if prompt:
            payload["prompt"] = str(prompt)[:2000]

        # Capture additional LLM parameters if available
        for attr in ["temperature", "max_tokens", "top_p", "stop"]:
            val = getattr(event, attr, None)
            if val is not None:
                payload[attr] = val

        self._add_event(
            event_type="llm_started",
            agent_role=agent_role,
            payload=payload if payload else None,
        )

    def _handle_llm_completed(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)

        duration_ms = None
        with self._lock:
            for key in list(self._llm_start_times.keys()):
                if key.startswith(f"llm:{agent_role}:"):
                    start_time = self._llm_start_times.pop(key)
                    duration_ms = (time.time() - start_time) * 1000
                    break

        # Extract response data
        response = getattr(event, "response", None)
        completion = getattr(event, "completion", None)
        output = getattr(event, "output", None)
        content = response or completion or output

        # Extract token usage
        tokens_used = getattr(event, "tokens_used", None)
        usage = getattr(event, "usage", None)

        payload: dict[str, Any] = {}

        # Token counts
        if tokens_used:
            payload["tokens_used"] = tokens_used
        if usage:
            if hasattr(usage, "prompt_tokens"):
                payload["input_tokens"] = usage.prompt_tokens
            if hasattr(usage, "completion_tokens"):
                payload["output_tokens"] = usage.completion_tokens
            if hasattr(usage, "total_tokens"):
                payload["total_tokens"] = usage.total_tokens

        # Try to extract tokens from various attribute names
        for input_attr in ["prompt_tokens", "input_tokens"]:
            val = getattr(event, input_attr, None)
            if val and "input_tokens" not in payload:
                payload["input_tokens"] = val
        for output_attr in ["completion_tokens", "output_tokens"]:
            val = getattr(event, output_attr, None)
            if val and "output_tokens" not in payload:
                payload["output_tokens"] = val

        # Response content (truncated)
        if content:
            payload["response"] = str(content)[:3000]

        # Model info
        model = getattr(event, "model", None) or getattr(event, "model_name", None)
        if model:
            payload["model"] = str(model)

        # Cost estimation (if available)
        cost = getattr(event, "cost", None)
        if cost:
            payload["cost"] = float(cost)

        self._add_event(
            event_type="llm_completed",
            agent_role=agent_role,
            duration_ms=duration_ms,
            payload=payload if payload else None,
        )

    def _handle_llm_failed(self, event: Any) -> None:
        agent_role = self._get_agent_role(event)
        with self._lock:
            self._agent_metrics[agent_role].errors += 1

        self._add_event(
            event_type="llm_failed",
            agent_role=agent_role,
            error=True,
            error_message=str(getattr(event, "error", "Unknown error")),
        )

    # Helper methods
    def _get_agent_role(self, event: Any) -> str:
        """Extract agent role from an event."""
        agent = getattr(event, "agent", None)
        if agent and hasattr(agent, "role"):
            return str(agent.role)
        return "unknown"

    def _truncate_messages(self, messages: Any, max_content_length: int = 1000) -> list[dict[str, Any]]:
        """Truncate message content while preserving structure."""
        if not messages:
            return []

        truncated = []
        try:
            for msg in messages:
                if isinstance(msg, dict):
                    truncated_msg = {
                        "role": msg.get("role", "unknown"),
                        "content": str(msg.get("content", ""))[:max_content_length],
                    }
                    if len(str(msg.get("content", ""))) > max_content_length:
                        truncated_msg["truncated"] = True
                    truncated.append(truncated_msg)
                elif hasattr(msg, "role") and hasattr(msg, "content"):
                    content = str(msg.content)
                    truncated_msg = {
                        "role": str(msg.role),
                        "content": content[:max_content_length],
                    }
                    if len(content) > max_content_length:
                        truncated_msg["truncated"] = True
                    truncated.append(truncated_msg)
                else:
                    # Fallback for unknown message format
                    truncated.append({"role": "unknown", "content": str(msg)[:max_content_length]})
        except Exception:
            # If anything fails, just return a simple representation
            return [{"role": "unknown", "content": str(messages)[:max_content_length]}]

        return truncated

    def _add_event(
        self,
        event_type: str,
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
        """Add an event to the buffer."""
        with self._lock:
            trace_id = self._current_trace_id or str(uuid.uuid4())

            event = TraceEvent(
                event_id=str(uuid.uuid4()),
                trace_id=trace_id,
                event_type=event_type,
                timestamp=time.time(),
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

            self._events.append(event)

            if self.config.debug:
                print(f"[crewai-monitor] Event: {event_type} ({agent_role or 'N/A'})")

            # Flush if batch is full
            if len(self._events) >= self.config.batch_size:
                self._flush_events()

    def _check_anomaly(self, agent_role: str, tool_name: str) -> None:
        """Check for anomalous behavior patterns."""
        metrics = self._agent_metrics[agent_role]
        now = time.time()

        # Check for repeated tool calls
        window = self.config.repeated_tool_window_seconds
        recent_calls = [
            h for h in metrics.tool_call_history
            if now - h["timestamp"] < window
        ]

        if recent_calls:
            tool_counts: dict[str, int] = {}
            for call in recent_calls:
                tool_counts[call["tool"]] = tool_counts.get(call["tool"], 0) + 1

            for tool, count in tool_counts.items():
                if count >= self.config.max_repeated_tool_calls:
                    reason = f"Tool '{tool}' called {count} times in {window}s"
                    self._trigger_anomaly(agent_role, reason)
                    return

        # Check for rate limit
        minute_ago = now - 60
        calls_per_minute = sum(
            1 for h in metrics.tool_call_history
            if h["timestamp"] > minute_ago
        )
        if calls_per_minute >= self.config.max_calls_per_minute:
            reason = f"Rate limit: {calls_per_minute} calls/minute"
            self._trigger_anomaly(agent_role, reason)

    def _trigger_anomaly(self, agent_role: str, reason: str) -> None:
        """Handle detected anomaly."""
        if self.config.debug:
            print(f"[crewai-monitor] ANOMALY: {agent_role} - {reason}")

        # Set kill flag
        self._kill_flags[agent_role] = True

        # Call user callback if provided
        if self.config.on_anomaly_detected:
            try:
                self.config.on_anomaly_detected(agent_role, reason)
            except Exception:
                pass

        # Add anomaly event
        self._add_event(
            event_type="anomaly_detected",
            agent_role=agent_role,
            payload={"reason": reason},
        )

    # Kill switch methods
    def should_kill(self, agent_role: str) -> bool:
        """Check if an agent should be killed."""
        with self._lock:
            return self._kill_flags.get(agent_role, False)

    def set_kill_flag(self, agent_role: str, kill: bool) -> None:
        """Set the kill flag for an agent."""
        with self._lock:
            self._kill_flags[agent_role] = kill

            if kill and self.config.on_kill_switch_activated:
                try:
                    self.config.on_kill_switch_activated(agent_role)
                except Exception:
                    pass

    def get_killed_agents(self) -> list[str]:
        """Get list of agents with kill flag set."""
        with self._lock:
            return [role for role, killed in self._kill_flags.items() if killed]

    # Flush methods
    def _start_flush_thread(self) -> None:
        """Start the background flush thread."""
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

    def _flush_loop(self) -> None:
        """Background loop that periodically flushes events."""
        while not self._stop_flush.is_set():
            self._stop_flush.wait(timeout=self.config.flush_interval_seconds)
            if not self._stop_flush.is_set():
                self._flush_events()

    def _flush_events(self) -> None:
        """Flush events to the backend."""
        with self._lock:
            if not self._events:
                return

            events_to_send = self._events[:]
            self._events = []

        # Send in background to not block
        threading.Thread(
            target=self._send_events,
            args=(events_to_send,),
            daemon=True,
        ).start()

    def _send_events(self, events: list[TraceEvent]) -> None:
        """Send events to the backend."""
        try:
            self.client.send_batch(events)
        except Exception as e:
            if self.config.debug:
                print(f"[crewai-monitor] Failed to send events: {e}")
            # Re-add events to buffer for retry
            with self._lock:
                self._events = events + self._events

    def flush(self) -> None:
        """Public method to force flush events."""
        self._flush_events()

    def stop(self) -> None:
        """Stop the collector."""
        self._stop_flush.set()
        if self._flush_thread:
            self._flush_thread.join(timeout=5)
        self.flush()

    # Metrics methods
    def get_agent_metrics(self, agent_role: str) -> AgentMetrics:
        """Get metrics for a specific agent."""
        with self._lock:
            return self._agent_metrics[agent_role]

    def get_all_metrics(self) -> dict[str, AgentMetrics]:
        """Get metrics for all agents."""
        with self._lock:
            return dict(self._agent_metrics)
