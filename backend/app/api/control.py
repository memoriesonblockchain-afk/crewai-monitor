"""Control API for kill switch and agent management."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from .deps import CurrentAPIKey, CurrentUser, DBSession

router = APIRouter()


# In-memory store for kill commands (in production, use Redis)
# Structure: {api_key_id: {trace_id: {agent_role: timestamp}}}
_kill_commands: dict[str, dict[str, dict[str, float]]] = {}

# In-memory store for pending kills to be fetched by SDK
# Structure: {api_key_id: [{"trace_id": ..., "agent_role": ...}]}
_pending_kills: dict[str, list[dict[str, str]]] = {}


# Request/Response schemas
class KillRequest(BaseModel):
    """Request to kill an agent."""

    trace_id: str | None = None  # If None, kill in all traces
    agent_role: str


class KillResponse(BaseModel):
    """Response after kill command."""

    status: str
    message: str


class ResumeRequest(BaseModel):
    """Request to resume a killed agent."""

    trace_id: str | None = None
    agent_role: str


class AgentStatus(BaseModel):
    """Status of an agent."""

    agent_role: str
    trace_id: str | None
    killed: bool
    killed_at: datetime | None


class StatusResponse(BaseModel):
    """Response with agent statuses."""

    agents: list[AgentStatus]


class PendingKillsResponse(BaseModel):
    """Pending kill commands for SDK to execute."""

    commands: list[dict[str, str]]


class KillExecutedRequest(BaseModel):
    """Report that a kill command was executed."""

    trace_id: str
    agent_role: str


# Endpoints
@router.post("/kill", response_model=KillResponse)
async def kill_agent(
    request: KillRequest,
    api_key: CurrentAPIKey,
    db: DBSession,
) -> KillResponse:
    """
    Send a kill command to stop an agent.

    The SDK will receive this command and block the agent's tool calls.
    """
    api_key_id = api_key.id

    # Initialize storage for this API key
    if api_key_id not in _kill_commands:
        _kill_commands[api_key_id] = {}
    if api_key_id not in _pending_kills:
        _pending_kills[api_key_id] = []

    # Record kill command
    trace_id = request.trace_id or "*"  # "*" means all traces
    if trace_id not in _kill_commands[api_key_id]:
        _kill_commands[api_key_id][trace_id] = {}

    _kill_commands[api_key_id][trace_id][request.agent_role] = datetime.now(
        timezone.utc
    ).timestamp()

    # Add to pending kills for SDK to fetch
    _pending_kills[api_key_id].append({
        "trace_id": trace_id,
        "agent_role": request.agent_role,
    })

    return KillResponse(
        status="sent",
        message=f"Kill command sent for agent '{request.agent_role}'",
    )


@router.post("/resume", response_model=KillResponse)
async def resume_agent(
    request: ResumeRequest,
    api_key: CurrentAPIKey,
    db: DBSession,
) -> KillResponse:
    """
    Resume a killed agent.

    Removes the kill flag so the agent can continue executing.
    """
    api_key_id = api_key.id

    if api_key_id not in _kill_commands:
        return KillResponse(
            status="not_found",
            message=f"No kill commands found for agent '{request.agent_role}'",
        )

    trace_id = request.trace_id or "*"

    # Remove kill command
    if trace_id in _kill_commands[api_key_id]:
        if request.agent_role in _kill_commands[api_key_id][trace_id]:
            del _kill_commands[api_key_id][trace_id][request.agent_role]

    # Add resume command to pending
    if api_key_id not in _pending_kills:
        _pending_kills[api_key_id] = []

    _pending_kills[api_key_id].append({
        "trace_id": trace_id,
        "agent_role": request.agent_role,
        "action": "resume",
    })

    return KillResponse(
        status="sent",
        message=f"Resume command sent for agent '{request.agent_role}'",
    )


@router.get("/status", response_model=StatusResponse)
async def get_agent_status(
    api_key: CurrentAPIKey,
    db: DBSession,
) -> StatusResponse:
    """Get the kill status of all agents."""
    api_key_id = api_key.id
    agents: list[AgentStatus] = []

    if api_key_id in _kill_commands:
        for trace_id, agent_kills in _kill_commands[api_key_id].items():
            for agent_role, timestamp in agent_kills.items():
                agents.append(
                    AgentStatus(
                        agent_role=agent_role,
                        trace_id=trace_id if trace_id != "*" else None,
                        killed=True,
                        killed_at=datetime.fromtimestamp(timestamp, tz=timezone.utc),
                    )
                )

    return StatusResponse(agents=agents)


@router.get("/pending-kills", response_model=PendingKillsResponse)
async def get_pending_kills(
    api_key: CurrentAPIKey,
    db: DBSession,
) -> PendingKillsResponse:
    """
    Get pending kill commands for the SDK.

    The SDK polls this endpoint to receive kill commands.
    """
    api_key_id = api_key.id

    commands = _pending_kills.get(api_key_id, [])

    # Clear pending after fetching
    _pending_kills[api_key_id] = []

    return PendingKillsResponse(commands=commands)


@router.post("/kill-executed", status_code=status.HTTP_204_NO_CONTENT)
async def report_kill_executed(
    request: KillExecutedRequest,
    api_key: CurrentAPIKey,
    db: DBSession,
) -> None:
    """
    Report that a kill command was executed by the SDK.

    Used for tracking and confirmation.
    """
    # In production, log this to QuestDB for audit trail
    pass


@router.delete("/all-kills", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_kills(
    api_key: CurrentAPIKey,
    db: DBSession,
) -> None:
    """Clear all kill commands (resume all agents)."""
    api_key_id = api_key.id

    if api_key_id in _kill_commands:
        _kill_commands[api_key_id] = {}

    if api_key_id in _pending_kills:
        # Add resume commands for all killed agents
        pass

    _pending_kills[api_key_id] = [{"action": "resume_all"}]
