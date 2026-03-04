# CrewAI Monitor - Production Implementation Guide

## Real-time Monitoring, Tracing, and Kill Switch for CrewAI Agents

---

# Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start for Users](#quick-start-for-users)
4. [Production Deployment](#production-deployment)
5. [SDK Reference](#sdk-reference)
6. [Dashboard Features](#dashboard-features)
7. [Alert System](#alert-system)
8. [Kill Switch](#kill-switch)
9. [Pricing Model](#pricing-model)
10. [Security](#security)

---

# Overview

CrewAI Monitor is a comprehensive monitoring solution for CrewAI-based AI agent applications. It provides real-time visibility into agent behavior, automatic anomaly detection, and emergency controls to stop runaway agents.

## The Problem

AI agents powered by CrewAI can:
- Enter infinite loops, calling the same tool repeatedly
- Accumulate massive API costs from uncontrolled LLM calls
- Behave unpredictably without visibility into their actions
- Cause damage before anyone notices something is wrong

## The Solution

CrewAI Monitor provides:
- **Real-time Tracing**: See every agent action as it happens
- **Anomaly Detection**: Automatic alerts for suspicious behavior
- **Kill Switch**: Stop any agent instantly with one click
- **Cost Control**: Prevent runaway API expenses

---

# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER'S APPLICATION                              │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    CrewAI Application                           │   │
│   │                                                                 │   │
│   │   import crewai_monitor                                         │   │
│   │   crewai_monitor.init(api_key="cm_live_xxx")  # One line!      │   │
│   │                                                                 │   │
│   │   crew = Crew(agents=[...], tasks=[...])                       │   │
│   │   result = crew.kickoff()                                       │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                         ┌──────────┴──────────┐                         │
│                         │  crewai-monitor SDK │                         │
│                         │  • Event capture    │                         │
│                         │  • Batching         │                         │
│                         │  • Kill switch      │                         │
│                         └──────────┬──────────┘                         │
│                                    │                                    │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │ HTTPS (TLS 1.3)
                                     │ Batched & Compressed
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CREWAI MONITOR CLOUD                               │
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │  Ingest API │    │  Query API  │    │ Control API │                │
│   │             │    │             │    │             │                │
│   │  Receives   │    │  Dashboard  │    │ Kill switch │                │
│   │  events     │    │  queries    │    │ commands    │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             │                                           │
│   ┌─────────────────────────┴───────────────────────────────────────┐  │
│   │                      Data Layer                                  │  │
│   │                                                                  │  │
│   │  ┌───────────┐  ┌───────────────┐  ┌───────────┐                │  │
│   │  │ PostgreSQL│  │   QuestDB     │  │   Redis   │                │  │
│   │  │           │  │               │  │           │                │  │
│   │  │ • Users   │  │ • Time-series │  │ • Caching │                │  │
│   │  │ • API keys│  │ • Traces      │  │ • Pub/Sub │                │  │
│   │  │ • Billing │  │ • Metrics     │  │ • Sessions│                │  │
│   │  └───────────┘  └───────────────┘  └───────────┘                │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Alert Engine                                  │  │
│   │  • Repeated tool call detection                                  │  │
│   │  • Error rate monitoring                                         │  │
│   │  • Rate limit enforcement                                        │  │
│   │  • Custom rule evaluation                                        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WEB DASHBOARD                                   │
│                                                                         │
│   • Real-time trace visualization                                       │
│   • Agent activity timeline                                             │
│   • Kill switch controls                                                │
│   • Alert management                                                    │
│   • Usage analytics                                                     │
│   • API key management                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Event Capture**: SDK hooks into CrewAI's event system
2. **Batching**: Events are batched (100 events or 5 seconds)
3. **Compression**: Batches are gzip compressed
4. **Transmission**: Sent via HTTPS to the cloud API
5. **Processing**: Events are validated and stored
6. **Alerting**: Rules engine evaluates events in real-time
7. **Visualization**: Dashboard queries and displays data

---

# Quick Start for Users

## Installation

```bash
pip install crewai-monitor
```

## Basic Integration

```python
import crewai_monitor
from crewai import Crew, Agent, Task

# Initialize monitoring (add this ONE line)
crewai_monitor.init(api_key="cm_live_your_api_key_here")

# Your existing CrewAI code works unchanged
researcher = Agent(
    role="Researcher",
    goal="Find information",
    backstory="Expert researcher",
    tools=[search_tool]
)

task = Task(
    description="Research AI trends",
    agent=researcher
)

crew = Crew(
    agents=[researcher],
    tasks=[task]
)

# All events are automatically captured and sent
result = crew.kickoff()
```

## Configuration Options

```python
crewai_monitor.init(
    # Required
    api_key="cm_live_xxxxx",

    # Optional - Project identification
    project_name="my-ai-app",
    environment="production",  # or "staging", "development"

    # Optional - Performance tuning
    batch_size=100,              # Events per batch
    flush_interval_seconds=5.0,  # Max time between sends
    enable_compression=True,     # Gzip compression

    # Optional - Features
    enable_local_anomaly_detection=True,
    enable_kill_switch=True,

    # Optional - Callbacks
    on_anomaly_detected=my_anomaly_handler,
    on_kill_switch_activated=my_kill_handler,

    # Optional - Debug
    debug=False,
)
```

## Callback Examples

```python
def on_anomaly_detected(agent_role: str, reason: str):
    """Called when anomalous behavior is detected."""
    print(f"WARNING: Agent '{agent_role}' anomaly: {reason}")
    # Send to your alerting system
    slack_webhook.send(f"Agent anomaly detected: {agent_role}")

def on_kill_switch_activated(agent_role: str):
    """Called when kill switch stops an agent."""
    print(f"KILLED: Agent '{agent_role}' was stopped")
    # Log the incident
    incident_tracker.create(agent=agent_role, action="killed")

crewai_monitor.init(
    api_key="cm_live_xxxxx",
    on_anomaly_detected=on_anomaly_detected,
    on_kill_switch_activated=on_kill_switch_activated,
)
```

---

# Production Deployment

## Environment Setup

### Environment Variables

```bash
# Required
export CREWAI_MONITOR_API_KEY="cm_live_xxxxx"

# Optional
export CREWAI_MONITOR_API_URL="https://api.crewai-monitor.com"
export CREWAI_MONITOR_PROJECT="my-production-app"
export CREWAI_MONITOR_ENVIRONMENT="production"
```

### Production Code

```python
import os
import crewai_monitor

# Load from environment
crewai_monitor.init(
    api_key=os.environ["CREWAI_MONITOR_API_KEY"],
    project_name=os.environ.get("CREWAI_MONITOR_PROJECT", "default"),
    environment=os.environ.get("CREWAI_MONITOR_ENVIRONMENT", "production"),
)
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run
CMD ["python", "main.py"]
```

### requirements.txt

```
crewai>=0.80.0
crewai-monitor>=0.1.0
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  ai-agent:
    build: .
    environment:
      - CREWAI_MONITOR_API_KEY=${CREWAI_MONITOR_API_KEY}
      - CREWAI_MONITOR_PROJECT=production-agents
      - CREWAI_MONITOR_ENVIRONMENT=production
    restart: unless-stopped
```

## Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: ai-agent
        image: your-registry/ai-agent:latest
        env:
        - name: CREWAI_MONITOR_API_KEY
          valueFrom:
            secretKeyRef:
              name: crewai-monitor-secrets
              key: api-key
        - name: CREWAI_MONITOR_ENVIRONMENT
          value: "production"
```

---

# SDK Reference

## Core Functions

### `crewai_monitor.init(**kwargs)`

Initialize the monitoring system. Must be called before creating any Crew.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_key` | str | required | Your API key (cm_live_xxx or cm_test_xxx) |
| `api_url` | str | production URL | API endpoint |
| `project_name` | str | "default" | Project identifier |
| `environment` | str | "development" | Environment name |
| `batch_size` | int | 100 | Events per batch |
| `flush_interval_seconds` | float | 5.0 | Max seconds between flushes |
| `enable_compression` | bool | True | Enable gzip compression |
| `enable_local_anomaly_detection` | bool | True | Local anomaly checks |
| `enable_kill_switch` | bool | True | Remote kill capability |
| `debug` | bool | False | Enable debug logging |

### `crewai_monitor.flush()`

Force send all pending events immediately.

```python
# Useful before application exit
crewai_monitor.flush()
```

### `crewai_monitor.shutdown()`

Gracefully shutdown the monitor.

```python
# Clean shutdown
crewai_monitor.shutdown()
```

## Events Captured

| Event Type | Description | Data Included |
|------------|-------------|---------------|
| `crew_started` | Crew execution begins | crew_name, inputs |
| `crew_completed` | Crew execution ends | output, duration |
| `crew_failed` | Crew execution fails | error message |
| `agent_started` | Agent begins work | agent_role |
| `agent_completed` | Agent finishes | output |
| `agent_error` | Agent encounters error | error message |
| `task_started` | Task begins | description |
| `task_completed` | Task finishes | output |
| `tool_started` | Tool call begins | tool_name, input |
| `tool_finished` | Tool call ends | result, duration |
| `tool_error` | Tool call fails | error message |
| `llm_started` | LLM request begins | - |
| `llm_completed` | LLM request ends | tokens_used, duration |

---

# Dashboard Features

## Overview Page

The main dashboard shows:
- **Total Traces**: Number of crew executions
- **Total Events**: All events across traces
- **Error Count**: Total errors detected
- **Average Duration**: Mean execution time
- **Top Tools**: Most frequently used tools

## Traces Page

View all crew executions with:
- Status (running, completed, failed)
- Duration
- Event count
- Error count
- Agent list

Click any trace to see the detailed timeline.

## Live View

Real-time streaming of events as they happen:
- Color-coded by event type
- Agent identification
- Tool names
- Error highlighting

## Kill Switch Page

Emergency controls:
- List of active agents
- One-click kill button per agent
- Kill confirmation dialog
- Resume capability

## Alerts Page

Configure automatic alerts:
- Create/edit alert rules
- View alert history
- Acknowledge alerts
- Configure notifications

---

# Alert System

## Built-in Alert Types

### Repeated Tool Calls

Triggers when the same tool is called excessively.

```
Configuration:
- Threshold: 10 calls
- Window: 30 seconds
- Action: Alert or Kill
```

**Use Case**: Detect infinite loops where an agent keeps calling the same API.

### High Error Rate

Triggers when errors exceed a threshold.

```
Configuration:
- Threshold: 5 errors
- Window: 60 seconds
- Action: Alert
```

**Use Case**: Detect when an agent is failing repeatedly.

### Rate Limit

Triggers when event volume is too high.

```
Configuration:
- Max Events: 100
- Window: 60 seconds
- Action: Alert and Kill
```

**Use Case**: Prevent runaway agents from generating excessive events.

### Long Running

Triggers when a trace exceeds time limit.

```
Configuration:
- Max Duration: 300000ms (5 minutes)
- Action: Alert
```

**Use Case**: Detect stuck or hung agents.

## Notification Channels

### Email

```json
{
  "email": {
    "enabled": true,
    "address": "alerts@yourcompany.com"
  }
}
```

### Slack

```json
{
  "slack": {
    "enabled": true,
    "webhook_url": "https://hooks.slack.com/services/xxx"
  }
}
```

### Webhook

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://your-api.com/alerts",
    "headers": {
      "Authorization": "Bearer xxx"
    }
  }
}
```

---

# Kill Switch

## How It Works

```
1. Dashboard: User clicks "Kill Agent"
          │
          ▼
2. Control API: POST /v1/control/kill
          │
          ▼
3. Redis: Publish to channel "kill:{api_key}"
          │
          ▼
4. SDK: Receives kill command via subscription
          │
          ▼
5. Hook: before_tool_call checks kill flag
          │
          ▼
6. Agent: Raises KillSwitchException, stops executing
```

## Response Time

- Typical latency: < 500ms
- Kill flag persists until explicitly resumed
- All SDK instances for the same API key receive the command

## Code Behavior

When kill switch is activated:

```python
# SDK automatically raises this exception
class KillSwitchException(Exception):
    """Raised when kill switch stops an agent."""
    pass

# Your code can catch it if needed
try:
    result = crew.kickoff()
except KillSwitchException as e:
    print(f"Agent was killed: {e}")
    # Handle gracefully
```

---

# Pricing Model

## Tiers

| Tier | Monthly Price | Included Events | Overage |
|------|---------------|-----------------|---------|
| **Free** | $0 | 10,000 | N/A (hard cap) |
| **Starter** | $29 | 100,000 | $0.50 per 1,000 |
| **Pro** | $99 | 1,000,000 | $0.30 per 1,000 |
| **Enterprise** | Custom | Custom | Custom |

## What Counts as an Event?

Each of these counts as 1 event:
- crew_started, crew_completed
- agent_started, agent_completed
- tool_started, tool_finished
- llm_started, llm_completed
- Any error event

## Example Usage

A typical crew run might generate:
- 1 crew_started + 1 crew_completed = 2 events
- 3 agents × 2 events each = 6 events
- 3 agents × 5 tool calls × 2 events = 30 events
- 3 agents × 3 LLM calls × 2 events = 18 events

**Total: ~56 events per crew run**

With Free tier (10,000 events): ~178 crew runs/month
With Starter tier (100,000 events): ~1,785 crew runs/month

---

# Security

## Data Protection

- **Encryption in Transit**: TLS 1.3 for all API communication
- **Encryption at Rest**: AES-256 for stored data
- **API Key Security**: Keys are hashed (SHA-256), never stored in plain text

## Data Isolation

- Each API key is isolated to a single tenant
- Users cannot access other users' data
- All queries are filtered by tenant_id

## API Key Best Practices

```python
# DO: Use environment variables
api_key = os.environ["CREWAI_MONITOR_API_KEY"]

# DON'T: Hardcode in source code
api_key = "cm_live_xxxxx"  # Never do this!

# DO: Use test keys for development
api_key = "cm_test_xxxxx"  # Test keys don't incur charges
```

## Data Retention

| Tier | Retention |
|------|-----------|
| Free | 7 days |
| Starter | 30 days |
| Pro | 90 days |
| Enterprise | Custom |

---

# Support

## Documentation

Full documentation available at: https://docs.crewai-monitor.com

## Community

- GitHub Issues: https://github.com/memoriesonblockchain-afk/crewai-monitor
- Discord: https://discord.gg/crewai-monitor

## Enterprise Support

Contact: enterprise@crewai-monitor.com

---

*CrewAI Monitor - Take Control of Your AI Agents*

© 2024 CrewAI Monitor. All rights reserved.
