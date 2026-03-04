"""
Tool hooks for implementing the kill switch functionality.

This module registers before_tool_call hooks with CrewAI that check
if an agent should be killed before executing any tool.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .collector import TraceCollector

# Try to import CrewAI hook decorators
try:
    from crewai import before_tool_call
    from crewai.utilities.events.tool_usage_events import ToolCallHookContext

    HOOKS_AVAILABLE = True
except ImportError:
    HOOKS_AVAILABLE = False
    ToolCallHookContext = Any

# Global reference to collector for hooks
_collector: TraceCollector | None = None


def register_hooks(collector: TraceCollector) -> None:
    """
    Register tool hooks with the collector.

    This enables the kill switch functionality by intercepting tool calls.
    """
    global _collector
    _collector = collector

    if not HOOKS_AVAILABLE:
        if collector.config.debug:
            print("[crewai-monitor] Tool hooks not available (CrewAI version too old)")
        return

    # Register the kill switch hook
    _register_kill_switch_hook()

    if collector.config.debug:
        print("[crewai-monitor] Kill switch hooks registered")


def _register_kill_switch_hook() -> None:
    """Register the before_tool_call hook for kill switch."""
    if not HOOKS_AVAILABLE:
        return

    @before_tool_call
    def kill_switch_hook(context: ToolCallHookContext) -> bool | None:
        """
        Hook that checks if an agent should be killed before tool execution.

        Returns:
            False to block execution, None to allow
        """
        if _collector is None:
            return None

        # Get agent role from context
        agent_role = "unknown"
        if context.agent and hasattr(context.agent, "role"):
            agent_role = str(context.agent.role)

        # Check if this agent should be killed
        if _collector.should_kill(agent_role):
            if _collector.config.debug:
                print(f"[crewai-monitor] KILL SWITCH: Blocking {agent_role}")

            # Add event for the blocked execution
            _collector._add_event(
                event_type="tool_blocked_by_kill_switch",
                agent_role=agent_role,
                tool_name=context.tool_name,
                payload={
                    "tool_input": context.tool_input,
                    "reason": "kill_switch_active",
                },
            )

            return False  # Block execution

        return None  # Allow execution


def get_hook_context_info(context: Any) -> dict[str, Any]:
    """
    Extract useful information from a hook context.

    Useful for debugging and logging.
    """
    if not HOOKS_AVAILABLE:
        return {}

    info = {
        "tool_name": getattr(context, "tool_name", "unknown"),
        "tool_input": getattr(context, "tool_input", {}),
    }

    if context.agent:
        info["agent_role"] = getattr(context.agent, "role", "unknown")
        info["agent_goal"] = getattr(context.agent, "goal", None)

    if context.task:
        info["task_description"] = getattr(context.task, "description", None)

    if context.crew:
        info["crew_name"] = getattr(context.crew, "name", None)

    return info


class KillSwitchManager:
    """
    Manager for kill switch state.

    Provides a higher-level API for managing kill switches across agents.
    """

    def __init__(self, collector: TraceCollector) -> None:
        self.collector = collector

    def kill(self, agent_role: str, reason: str | None = None) -> None:
        """
        Activate kill switch for an agent.

        Args:
            agent_role: The role of the agent to kill
            reason: Optional reason for the kill
        """
        self.collector.set_kill_flag(agent_role, True)

        # Log the kill event
        self.collector._add_event(
            event_type="kill_switch_activated",
            agent_role=agent_role,
            payload={"reason": reason or "manual_kill"},
        )

    def resume(self, agent_role: str) -> None:
        """
        Deactivate kill switch for an agent.

        Args:
            agent_role: The role of the agent to resume
        """
        self.collector.set_kill_flag(agent_role, False)

        # Log the resume event
        self.collector._add_event(
            event_type="kill_switch_deactivated",
            agent_role=agent_role,
        )

    def kill_all(self, reason: str | None = None) -> None:
        """Kill all known agents."""
        for agent_role in self.collector.get_all_metrics().keys():
            self.kill(agent_role, reason)

    def resume_all(self) -> None:
        """Resume all killed agents."""
        for agent_role in self.collector.get_killed_agents():
            self.resume(agent_role)

    def is_killed(self, agent_role: str) -> bool:
        """Check if an agent is killed."""
        return self.collector.should_kill(agent_role)

    def get_killed_agents(self) -> list[str]:
        """Get list of killed agents."""
        return self.collector.get_killed_agents()
