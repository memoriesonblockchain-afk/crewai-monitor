"""Configuration for crewai-monitor SDK."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class MonitorConfig:
    """Configuration for the CrewAI monitor."""

    api_key: str
    api_url: str = "http://localhost:8000"
    project_name: str = "default"
    environment: str = "development"

    # Batching settings
    batch_size: int = 100
    flush_interval_seconds: float = 5.0

    # Network settings
    timeout_seconds: float = 30.0
    max_retries: int = 3
    retry_backoff_factor: float = 2.0

    # Anomaly detection (local)
    enable_local_anomaly_detection: bool = True
    max_repeated_tool_calls: int = 10
    repeated_tool_window_seconds: float = 30.0
    max_calls_per_minute: int = 100

    # Kill switch
    enable_kill_switch: bool = True
    kill_switch_poll_interval_seconds: float = 1.0

    # Compression
    enable_compression: bool = True

    # Logging
    debug: bool = False

    # Callbacks
    on_anomaly_detected: Callable[[str, str], None] | None = None
    on_kill_switch_activated: Callable[[str], None] | None = None

    @classmethod
    def from_env(cls, api_key: str | None = None) -> MonitorConfig:
        """Create config from environment variables."""
        return cls(
            api_key=api_key or os.environ.get("CREWAI_MONITOR_API_KEY", ""),
            api_url=os.environ.get("CREWAI_MONITOR_API_URL", "http://localhost:8000"),
            project_name=os.environ.get("CREWAI_MONITOR_PROJECT", "default"),
            environment=os.environ.get("CREWAI_MONITOR_ENV", "development"),
            debug=os.environ.get("CREWAI_MONITOR_DEBUG", "").lower() == "true",
        )


# Global config instance
_config: MonitorConfig | None = None


def get_config() -> MonitorConfig:
    """Get the current configuration."""
    if _config is None:
        raise RuntimeError(
            "crewai_monitor not initialized. Call crewai_monitor.init(api_key=...) first."
        )
    return _config


def set_config(config: MonitorConfig) -> None:
    """Set the global configuration."""
    global _config
    _config = config
