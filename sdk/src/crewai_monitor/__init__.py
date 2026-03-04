"""
CrewAI Monitor - Real-time monitoring, tracing, and kill switch for CrewAI agents.

Usage:
    import crewai_monitor

    # Initialize once at startup
    crewai_monitor.init(
        api_key="cm_live_xxxxx",
        project_name="my-crew-app",
        environment="production"
    )

    # Everything else is automatic - all crews are traced
    from crewai import Crew, Agent, Task
    crew = Crew(agents=[...], tasks=[...])
    result = crew.kickoff()
"""

from __future__ import annotations

__version__ = "0.1.0"

from typing import Callable

from .config import MonitorConfig, get_config, set_config

# These will be imported after initialization to avoid circular imports
_collector: "TraceCollector | None" = None
_client: "MonitorClient | None" = None
_initialized: bool = False


def init(
    api_key: str,
    *,
    api_url: str = "http://localhost:8000",
    project_name: str = "default",
    environment: str = "development",
    batch_size: int = 100,
    flush_interval_seconds: float = 5.0,
    enable_local_anomaly_detection: bool = True,
    enable_kill_switch: bool = True,
    enable_compression: bool = True,
    debug: bool = False,
    on_anomaly_detected: Callable[[str, str], None] | None = None,
    on_kill_switch_activated: Callable[[str], None] | None = None,
) -> None:
    """
    Initialize the CrewAI monitor.

    This should be called once at application startup, before creating any Crews.

    Args:
        api_key: Your API key (starts with cm_live_ or cm_test_)
        api_url: URL of the monitoring API (default: http://localhost:8000)
        project_name: Name of your project for grouping traces
        environment: Environment name (e.g., 'production', 'staging', 'development')
        batch_size: Number of events to batch before sending
        flush_interval_seconds: Max time between flushes
        enable_local_anomaly_detection: Enable local anomaly detection
        enable_kill_switch: Enable remote kill switch capability
        enable_compression: Compress payloads before sending
        debug: Enable debug logging
        on_anomaly_detected: Callback when anomaly is detected (agent_role, reason)
        on_kill_switch_activated: Callback when kill switch is activated (agent_role)
    """
    global _collector, _client, _initialized

    if _initialized:
        if debug:
            print("[crewai-monitor] Already initialized, skipping")
        return

    # Validate API key format
    if not api_key:
        raise ValueError("api_key is required")
    if not api_key.startswith(("cm_live_", "cm_test_")):
        raise ValueError("api_key must start with 'cm_live_' or 'cm_test_'")

    # Create config
    config = MonitorConfig(
        api_key=api_key,
        api_url=api_url,
        project_name=project_name,
        environment=environment,
        batch_size=batch_size,
        flush_interval_seconds=flush_interval_seconds,
        enable_local_anomaly_detection=enable_local_anomaly_detection,
        enable_kill_switch=enable_kill_switch,
        enable_compression=enable_compression,
        debug=debug,
        on_anomaly_detected=on_anomaly_detected,
        on_kill_switch_activated=on_kill_switch_activated,
    )
    set_config(config)

    # Import and initialize components
    from .client import MonitorClient
    from .collector import TraceCollector
    from .hooks import register_hooks

    _client = MonitorClient(config)
    _collector = TraceCollector(config, _client)

    # Register tool hooks for kill switch
    if enable_kill_switch:
        register_hooks(_collector)

    _initialized = True

    if debug:
        print(f"[crewai-monitor] Initialized for project '{project_name}' ({environment})")
        print(f"[crewai-monitor] Sending traces to {api_url}")


def shutdown() -> None:
    """
    Gracefully shutdown the monitor.

    Flushes any pending events and closes connections.
    """
    global _collector, _client, _initialized

    if not _initialized:
        return

    if _collector:
        _collector.flush()
        _collector = None

    if _client:
        _client.close()
        _client = None

    _initialized = False


def flush() -> None:
    """Force flush any pending events."""
    if _collector:
        _collector.flush()


def is_initialized() -> bool:
    """Check if the monitor is initialized."""
    return _initialized


def get_collector() -> "TraceCollector | None":
    """Get the trace collector instance."""
    return _collector


def get_client() -> "MonitorClient | None":
    """Get the HTTP client instance."""
    return _client


# Public API
__all__ = [
    "init",
    "shutdown",
    "flush",
    "is_initialized",
    "get_config",
    "MonitorConfig",
    "__version__",
]
