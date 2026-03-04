"""Ingest API for receiving trace events from SDKs."""

import gzip
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from .deps import CurrentAPIKey, DBSession
from ..models.usage import UsageDaily

router = APIRouter()


# Request schemas
class TraceEvent(BaseModel):
    """A single trace event from the SDK."""

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
    payload: dict[str, Any] = Field(default_factory=dict)


class BatchIngestRequest(BaseModel):
    """Batch of events from the SDK."""

    events: list[TraceEvent]
    sdk_version: str = "unknown"
    project_name: str = "default"
    environment: str = "development"


class BatchIngestResponse(BaseModel):
    """Response for batch ingest."""

    accepted: int
    rejected: int
    errors: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str


# Endpoints
@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="0.1.0")


@router.post("/batch", response_model=BatchIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_batch(
    request: Request,
    api_key: CurrentAPIKey,
    db: DBSession,
    content_encoding: str | None = Header(None),
) -> BatchIngestResponse:
    """
    Ingest a batch of trace events.

    Accepts gzip-compressed payloads when Content-Encoding: gzip is set.
    """
    # Read and decompress body if needed
    body = await request.body()

    if content_encoding == "gzip":
        try:
            body = gzip.decompress(body)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to decompress gzip payload",
            )

    # Parse JSON
    try:
        import json
        data = json.loads(body)
        batch_request = BatchIngestRequest(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {str(e)}",
        )

    # Process events
    accepted = 0
    rejected = 0
    errors: list[str] = []
    trace_ids: set[str] = set()

    for event in batch_request.events:
        try:
            # Validate event
            if not event.event_id or not event.trace_id:
                rejected += 1
                errors.append(f"Missing event_id or trace_id")
                continue

            # Store event (in production, this would go to QuestDB)
            # For MVP, we'll just count and store to usage tracking
            accepted += 1
            trace_ids.add(event.trace_id)

            # TODO: Store to QuestDB
            # await store_event_to_questdb(api_key.user_id, event)

        except Exception as e:
            rejected += 1
            errors.append(str(e))

    # Update usage tracking
    if accepted > 0:
        await update_usage(db, api_key.id, accepted, len(trace_ids), len(body))

    return BatchIngestResponse(
        accepted=accepted,
        rejected=rejected,
        errors=errors[:10],  # Limit error messages
    )


@router.post("/event", response_model=BatchIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_single(
    event: TraceEvent,
    api_key: CurrentAPIKey,
    db: DBSession,
) -> BatchIngestResponse:
    """Ingest a single event (for testing)."""
    # Wrap in batch request
    batch = BatchIngestRequest(events=[event])

    # Process
    accepted = 0
    rejected = 0

    try:
        if not event.event_id or not event.trace_id:
            rejected = 1
        else:
            accepted = 1
            # TODO: Store to QuestDB
            await update_usage(db, api_key.id, 1, 1, 0)
    except Exception:
        rejected = 1

    return BatchIngestResponse(accepted=accepted, rejected=rejected)


async def update_usage(
    db: DBSession,
    api_key_id: str,
    event_count: int,
    trace_count: int,
    data_bytes: int,
) -> None:
    """Update daily usage tracking."""
    today = date.today()

    # Try to get existing record
    result = await db.execute(
        select(UsageDaily)
        .where(UsageDaily.api_key_id == api_key_id)
        .where(UsageDaily.date == today)
    )
    usage = result.scalar_one_or_none()

    if usage:
        # Update existing record
        usage.event_count += event_count
        usage.trace_count += trace_count
        usage.data_bytes += data_bytes
    else:
        # Create new record
        usage = UsageDaily(
            api_key_id=api_key_id,
            date=today,
            event_count=event_count,
            trace_count=trace_count,
            data_bytes=data_bytes,
        )
        db.add(usage)

    await db.commit()
