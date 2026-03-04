# CrewAI Monitor SDK

Real-time monitoring, tracing, and kill switch for CrewAI agents.

## Installation

```bash
pip install crewai-monitor
```

## Quick Start

```python
import crewai_monitor
from crewai import Crew, Agent, Task

# Initialize once at startup
crewai_monitor.init(
    api_key="cm_live_xxxxx",           # Your API key
    project_name="my-crew-app",         # Project name for grouping
    environment="production",           # Environment (development/staging/production)
)

# Everything else is automatic - all crews are traced
crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()

# Optional: graceful shutdown
crewai_monitor.shutdown()
```

## Features

### Automatic Tracing

Once initialized, all CrewAI events are automatically captured:

- Crew lifecycle (start, complete, fail)
- Agent execution (start, complete, error)
- Task execution (start, complete, fail)
- Tool usage (start, finish, error)
- LLM calls (start, complete, fail)

### Anomaly Detection

Local anomaly detection catches runaway agents:

```python
crewai_monitor.init(
    api_key="...",
    enable_local_anomaly_detection=True,
    max_repeated_tool_calls=10,           # Block after 10 repeated calls
    max_calls_per_minute=100,             # Rate limit
    on_anomaly_detected=lambda agent, reason: print(f"Anomaly: {agent} - {reason}"),
)
```

### Kill Switch

Block specific agents remotely via the dashboard or programmatically:

```python
from crewai_monitor.hooks import KillSwitchManager

# Get the kill switch manager
manager = KillSwitchManager(crewai_monitor.get_collector())

# Kill a specific agent
manager.kill("Researcher", reason="Stuck in loop")

# Resume the agent
manager.resume("Researcher")

# Kill all agents
manager.kill_all(reason="Emergency stop")
```

### Custom Callbacks

```python
def on_anomaly(agent_role: str, reason: str):
    print(f"Anomaly detected: {agent_role} - {reason}")
    # Send Slack notification, etc.

def on_kill_switch(agent_role: str):
    print(f"Kill switch activated: {agent_role}")

crewai_monitor.init(
    api_key="...",
    on_anomaly_detected=on_anomaly,
    on_kill_switch_activated=on_kill_switch,
)
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api_key` | str | required | Your API key |
| `api_url` | str | `http://localhost:8000` | Backend URL |
| `project_name` | str | `default` | Project name |
| `environment` | str | `development` | Environment name |
| `batch_size` | int | `100` | Events per batch |
| `flush_interval_seconds` | float | `5.0` | Max time between flushes |
| `enable_local_anomaly_detection` | bool | `True` | Enable local anomaly detection |
| `enable_kill_switch` | bool | `True` | Enable kill switch |
| `enable_compression` | bool | `True` | Compress payloads |
| `debug` | bool | `False` | Enable debug logging |

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linting
ruff check .

# Type checking
mypy .
```

## License

MIT
