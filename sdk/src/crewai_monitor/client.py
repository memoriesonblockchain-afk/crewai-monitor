"""
HTTP client for communicating with the CrewAI Monitor backend.

Handles:
- Batched event sending
- Compression
- Retry with exponential backoff
- WebSocket connection for kill switch commands
"""

from __future__ import annotations

import gzip
import json
import threading
import time
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from .collector import TraceEvent
    from .config import MonitorConfig


class MonitorClient:
    """HTTP client for the monitoring backend."""

    def __init__(self, config: MonitorConfig) -> None:
        self.config = config
        self._client: httpx.Client | None = None
        self._lock = threading.Lock()

        # WebSocket for kill switch (will be implemented in future)
        self._ws_thread: threading.Thread | None = None
        self._stop_ws = threading.Event()

    @property
    def client(self) -> httpx.Client:
        """Lazily create the HTTP client."""
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = httpx.Client(
                        base_url=self.config.api_url,
                        timeout=httpx.Timeout(self.config.timeout_seconds),
                        headers={
                            "Authorization": f"Bearer {self.config.api_key}",
                            "Content-Type": "application/json",
                            "X-Project-Name": self.config.project_name,
                            "X-Environment": self.config.environment,
                        },
                    )
        return self._client

    def send_batch(self, events: list[TraceEvent]) -> bool:
        """
        Send a batch of events to the backend.

        Returns True if successful, False otherwise.
        """
        if not events:
            return True

        # Serialize events
        payload = {
            "events": [self._serialize_event(e) for e in events],
            "sdk_version": "0.1.0",
            "project_name": self.config.project_name,
            "environment": self.config.environment,
        }

        # Compress if enabled
        if self.config.enable_compression:
            body = gzip.compress(json.dumps(payload).encode("utf-8"))
            headers = {"Content-Encoding": "gzip"}
        else:
            body = json.dumps(payload).encode("utf-8")
            headers = {}

        # Send with retry
        last_error: Exception | None = None
        for attempt in range(self.config.max_retries):
            try:
                response = self.client.post(
                    "/v1/ingest/batch",
                    content=body,
                    headers=headers,
                )
                response.raise_for_status()

                if self.config.debug:
                    print(f"[crewai-monitor] Sent {len(events)} events")

                return True

            except httpx.HTTPStatusError as e:
                last_error = e
                # Don't retry on client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    if self.config.debug:
                        print(f"[crewai-monitor] Client error: {e.response.status_code}")
                    return False

            except Exception as e:
                last_error = e

            # Exponential backoff
            if attempt < self.config.max_retries - 1:
                sleep_time = self.config.retry_backoff_factor ** attempt
                if self.config.debug:
                    print(f"[crewai-monitor] Retry {attempt + 1} in {sleep_time}s")
                time.sleep(sleep_time)

        if self.config.debug and last_error:
            print(f"[crewai-monitor] Failed after {self.config.max_retries} retries: {last_error}")

        return False

    def send_single(self, event: TraceEvent) -> bool:
        """Send a single event (for testing)."""
        return self.send_batch([event])

    def _serialize_event(self, event: TraceEvent) -> dict[str, Any]:
        """Serialize an event to a dictionary."""
        data = asdict(event)
        # Remove None values
        return {k: v for k, v in data.items() if v is not None}

    def health_check(self) -> bool:
        """Check if the backend is healthy."""
        try:
            response = self.client.get("/v1/ingest/health")
            return response.status_code == 200
        except Exception:
            return False

    def validate_api_key(self) -> tuple[bool, str]:
        """
        Validate the API key with the backend.

        Returns (is_valid, message).
        """
        try:
            response = self.client.get("/v1/auth/validate")
            if response.status_code == 200:
                return True, "API key is valid"
            elif response.status_code == 401:
                return False, "Invalid API key"
            elif response.status_code == 403:
                return False, "API key is revoked"
            else:
                return False, f"Unexpected status: {response.status_code}"
        except Exception as e:
            return False, f"Connection error: {e}"

    def fetch_kill_commands(self) -> list[dict[str, Any]]:
        """
        Fetch pending kill commands from the backend.

        Returns list of kill commands: [{"agent_role": "...", "trace_id": "..."}]
        """
        try:
            response = self.client.get("/v1/control/pending-kills")
            if response.status_code == 200:
                return response.json().get("commands", [])
            return []
        except Exception:
            return []

    def report_kill_executed(self, trace_id: str, agent_role: str) -> None:
        """Report that a kill command was executed."""
        try:
            self.client.post(
                "/v1/control/kill-executed",
                json={"trace_id": trace_id, "agent_role": agent_role},
            )
        except Exception:
            pass

    def close(self) -> None:
        """Close the client and cleanup resources."""
        self._stop_ws.set()

        if self._ws_thread:
            self._ws_thread.join(timeout=2)

        if self._client:
            self._client.close()
            self._client = None


class AsyncMonitorClient:
    """
    Async version of the monitor client for use with async crews.

    TODO: Implement async version using httpx.AsyncClient
    """

    pass
