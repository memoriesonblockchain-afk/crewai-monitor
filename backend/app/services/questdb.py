"""QuestDB client for storing and querying trace events."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx

from ..core.config import settings


class QuestDBClient:
    """
    Client for interacting with QuestDB.

    Uses the REST API for queries and ILP (InfluxDB Line Protocol) for inserts.
    """

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
    ) -> None:
        self.host = host or settings.questdb_host
        self.port = port or settings.questdb_port
        self.base_url = f"http://{self.host}:{self.port}"
        self._client: httpx.AsyncClient | None = None

    async def get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=30.0,
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def init_tables(self) -> None:
        """Create the necessary tables if they don't exist."""
        # Events table
        await self.execute("""
            CREATE TABLE IF NOT EXISTS events (
                timestamp TIMESTAMP,
                tenant_id SYMBOL,
                trace_id SYMBOL,
                event_id SYMBOL,
                event_type SYMBOL,
                agent_role SYMBOL,
                task_id SYMBOL,
                tool_name SYMBOL,
                payload STRING,
                duration_ms LONG,
                error BOOLEAN
            ) TIMESTAMP(timestamp) PARTITION BY DAY;
        """)

        # Metrics table
        await self.execute("""
            CREATE TABLE IF NOT EXISTS metrics_hourly (
                timestamp TIMESTAMP,
                tenant_id SYMBOL,
                agent_role SYMBOL,
                event_count LONG,
                error_count LONG,
                avg_duration_ms DOUBLE
            ) TIMESTAMP(timestamp) PARTITION BY MONTH;
        """)

    async def execute(self, query: str) -> dict[str, Any]:
        """Execute a SQL query."""
        client = await self.get_client()
        response = await client.get(
            "/exec",
            params={"query": query},
        )
        response.raise_for_status()
        return response.json()

    async def insert_event(
        self,
        tenant_id: str,
        trace_id: str,
        event_id: str,
        event_type: str,
        timestamp: datetime,
        agent_role: str | None = None,
        task_id: str | None = None,
        tool_name: str | None = None,
        payload: dict[str, Any] | None = None,
        duration_ms: int | None = None,
        error: bool = False,
    ) -> None:
        """Insert a single event using REST API."""
        # Build INSERT statement
        columns = ["timestamp", "tenant_id", "trace_id", "event_id", "event_type", "error"]
        values = [
            f"'{timestamp.isoformat()}'",
            f"'{tenant_id}'",
            f"'{trace_id}'",
            f"'{event_id}'",
            f"'{event_type}'",
            str(error).lower(),
        ]

        if agent_role:
            columns.append("agent_role")
            values.append(f"'{agent_role}'")

        if task_id:
            columns.append("task_id")
            values.append(f"'{task_id}'")

        if tool_name:
            columns.append("tool_name")
            values.append(f"'{tool_name}'")

        if payload:
            columns.append("payload")
            # Escape single quotes in JSON
            payload_str = json.dumps(payload).replace("'", "''")
            values.append(f"'{payload_str}'")

        if duration_ms is not None:
            columns.append("duration_ms")
            values.append(str(duration_ms))

        query = f"INSERT INTO events ({', '.join(columns)}) VALUES ({', '.join(values)})"
        await self.execute(query)

    async def insert_events_batch(
        self,
        tenant_id: str,
        events: list[dict[str, Any]],
    ) -> int:
        """Insert multiple events in a batch."""
        inserted = 0
        for event in events:
            try:
                await self.insert_event(
                    tenant_id=tenant_id,
                    trace_id=event["trace_id"],
                    event_id=event["event_id"],
                    event_type=event["event_type"],
                    timestamp=datetime.fromtimestamp(event["timestamp"]),
                    agent_role=event.get("agent_role"),
                    task_id=event.get("task_id"),
                    tool_name=event.get("tool_name"),
                    payload=event.get("payload"),
                    duration_ms=event.get("duration_ms"),
                    error=event.get("error", False),
                )
                inserted += 1
            except Exception:
                pass
        return inserted

    async def query_traces(
        self,
        tenant_id: str,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query traces for a tenant."""
        query = f"""
            SELECT
                trace_id,
                MIN(timestamp) as started_at,
                MAX(timestamp) as ended_at,
                COUNT(*) as event_count,
                COUNT(DISTINCT agent_role) as agent_count,
                SUM(CASE WHEN error THEN 1 ELSE 0 END) as error_count
            FROM events
            WHERE tenant_id = '{tenant_id}'
        """

        if from_time:
            query += f" AND timestamp >= '{from_time.isoformat()}'"
        if to_time:
            query += f" AND timestamp <= '{to_time.isoformat()}'"

        query += f"""
            GROUP BY trace_id
            ORDER BY started_at DESC
            LIMIT {limit}
        """

        result = await self.execute(query)
        return self._parse_result(result)

    async def query_trace_events(
        self,
        tenant_id: str,
        trace_id: str,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Query events for a specific trace."""
        query = f"""
            SELECT *
            FROM events
            WHERE tenant_id = '{tenant_id}' AND trace_id = '{trace_id}'
            ORDER BY timestamp ASC
            LIMIT {limit}
        """

        result = await self.execute(query)
        return self._parse_result(result)

    async def query_metrics(
        self,
        tenant_id: str,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
    ) -> dict[str, Any]:
        """Query aggregated metrics."""
        query = f"""
            SELECT
                COUNT(DISTINCT trace_id) as total_traces,
                COUNT(*) as total_events,
                SUM(CASE WHEN error THEN 1 ELSE 0 END) as total_errors,
                AVG(duration_ms) as avg_duration_ms,
                COUNT(DISTINCT agent_role) as active_agents
            FROM events
            WHERE tenant_id = '{tenant_id}'
        """

        if from_time:
            query += f" AND timestamp >= '{from_time.isoformat()}'"
        if to_time:
            query += f" AND timestamp <= '{to_time.isoformat()}'"

        result = await self.execute(query)
        rows = self._parse_result(result)
        return rows[0] if rows else {}

    def _parse_result(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse QuestDB query result into list of dicts."""
        columns = result.get("columns", [])
        dataset = result.get("dataset", [])

        if not columns or not dataset:
            return []

        col_names = [col["name"] for col in columns]
        return [dict(zip(col_names, row)) for row in dataset]


# Global client instance
_questdb_client: QuestDBClient | None = None


def get_questdb_client() -> QuestDBClient:
    """Get the global QuestDB client."""
    global _questdb_client
    if _questdb_client is None:
        _questdb_client = QuestDBClient()
    return _questdb_client


async def init_questdb() -> None:
    """Initialize QuestDB tables."""
    client = get_questdb_client()
    await client.init_tables()


async def close_questdb() -> None:
    """Close QuestDB client."""
    global _questdb_client
    if _questdb_client:
        await _questdb_client.close()
        _questdb_client = None
