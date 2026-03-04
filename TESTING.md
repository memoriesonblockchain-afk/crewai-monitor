# Testing Guide for CrewAI Monitor

This guide walks you through testing all components of the CrewAI Monitor system.

## Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- A CrewAI project (or use the example below)

---

## Step 1: Start Infrastructure

```bash
cd /Users/alexstolb/Documents/Repos/crewai-monitor

# Start all services (Postgres, QuestDB, Redis, API)
docker-compose up -d

# Check services are running
docker-compose ps

# View logs
docker-compose logs -f api
```

Services will be available at:
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **QuestDB Console**: http://localhost:9000
- **Dashboard**: http://localhost:3000 (after starting)

---

## Step 2: Test Backend API Manually

### 2.1 Register a User

```bash
curl -X POST http://localhost:8000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
  }'
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

Save this token:
```bash
export TOKEN="eyJ..."  # paste your token here
```

### 2.2 Create an API Key

```bash
curl -X POST http://localhost:8000/v1/auth/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Development Key",
    "environment": "live"
  }'
```

Response:
```json
{
  "id": "uuid...",
  "prefix": "cm_live_abc123",
  "key": "cm_live_abc123def456...",  // SAVE THIS - only shown once!
  "name": "Development Key",
  "environment": "live"
}
```

Save the full API key:
```bash
export API_KEY="cm_live_..."  # paste your full key here
```

### 2.3 Create Default Alert Rules

```bash
curl -X POST http://localhost:8000/v1/alerts/rules/create-defaults \
  -H "Authorization: Bearer $TOKEN"
```

### 2.4 List Alert Rules

```bash
curl http://localhost:8000/v1/alerts/rules \
  -H "Authorization: Bearer $TOKEN"
```

---

## Step 3: Test the SDK

### 3.1 Install the SDK

```bash
cd /Users/alexstolb/Documents/Repos/crewai-monitor/sdk

# Install in development mode
pip install -e .
```

### 3.2 Create a Test Script

Create `test_sdk.py`:

```python
"""Test script for CrewAI Monitor SDK."""

import os
import time
import crewai_monitor

# Initialize the monitor
crewai_monitor.init(
    api_key=os.environ.get("API_KEY", "cm_live_your_key_here"),
    api_url="http://localhost:8000",
    project_name="test-project",
    environment="development",
    debug=True,  # Enable debug logging
)

# Simulate some events manually (without CrewAI)
from crewai_monitor.collector import get_collector

collector = get_collector()

# Simulate tool calls
for i in range(15):
    collector._send_event({
        "event_type": "tool_started",
        "trace_id": "test-trace-001",
        "agent_role": "researcher",
        "tool_name": "web_search",
        "timestamp": time.time(),
    })
    time.sleep(0.1)

# Simulate some errors
for i in range(3):
    collector._send_event({
        "event_type": "tool_error",
        "trace_id": "test-trace-001",
        "agent_role": "researcher",
        "tool_name": "web_search",
        "error": True,
        "error_message": f"Connection timeout #{i+1}",
        "timestamp": time.time(),
    })
    time.sleep(0.1)

# Flush and shutdown
print("Flushing events...")
crewai_monitor.flush()
time.sleep(2)

print("Shutting down...")
crewai_monitor.shutdown()

print("Done! Check the dashboard for events and alerts.")
```

### 3.3 Run the Test

```bash
export API_KEY="cm_live_..."  # Your API key from step 2.2
python test_sdk.py
```

---

## Step 4: Test with Real CrewAI

### 4.1 Create a Sample CrewAI App

Create `test_crew.py`:

```python
"""Test CrewAI app with monitoring."""

import os
import crewai_monitor
from crewai import Agent, Task, Crew
from crewai.tools import tool

# Initialize monitoring BEFORE creating crew
crewai_monitor.init(
    api_key=os.environ.get("API_KEY"),
    api_url="http://localhost:8000",
    project_name="test-crew",
    environment="development",
    debug=True,
)

# Create a simple tool
@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    # Simulate search
    return f"Results for: {query}"

@tool
def calculate(expression: str) -> str:
    """Calculate a mathematical expression."""
    try:
        result = eval(expression)
        return f"Result: {result}"
    except Exception as e:
        return f"Error: {e}"

# Create agents
researcher = Agent(
    role="Researcher",
    goal="Research topics thoroughly",
    backstory="You are an expert researcher.",
    tools=[search_web],
    verbose=True,
)

calculator = Agent(
    role="Calculator",
    goal="Perform calculations accurately",
    backstory="You are a math expert.",
    tools=[calculate],
    verbose=True,
)

# Create tasks
research_task = Task(
    description="Research the topic: What is machine learning?",
    expected_output="A brief summary of machine learning",
    agent=researcher,
)

calc_task = Task(
    description="Calculate 42 * 17 + 100",
    expected_output="The numerical result",
    agent=calculator,
)

# Create and run crew
crew = Crew(
    agents=[researcher, calculator],
    tasks=[research_task, calc_task],
    verbose=True,
)

try:
    result = crew.kickoff()
    print(f"\nResult: {result}")
except Exception as e:
    print(f"Error: {e}")
finally:
    # Always flush and shutdown
    crewai_monitor.flush()
    crewai_monitor.shutdown()
```

### 4.2 Run the CrewAI Test

```bash
export API_KEY="cm_live_..."
export OPENAI_API_KEY="sk-..."  # Your OpenAI key

python test_crew.py
```

---

## Step 5: Test the Dashboard

### 5.1 Start the Dashboard

```bash
cd /Users/alexstolb/Documents/Repos/crewai-monitor/dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3000

### 5.2 Dashboard Testing Checklist

1. **Login/Register**
   - [ ] Register with email/password
   - [ ] Login with credentials
   - [ ] Verify redirect to dashboard

2. **API Keys**
   - [ ] Navigate to API Keys page
   - [ ] Create a new API key
   - [ ] Copy the key (shown only once)
   - [ ] Revoke an API key

3. **Traces**
   - [ ] View trace list (after running SDK tests)
   - [ ] Click on a trace to see details
   - [ ] View event timeline

4. **Kill Switch**
   - [ ] View list of agents
   - [ ] Test "Kill" button on an agent
   - [ ] Test "Resume" button
   - [ ] Test "Kill All" emergency button

5. **Alerts**
   - [ ] View alert rules list
   - [ ] Create a new alert rule
   - [ ] Enable/disable rules
   - [ ] View triggered alerts
   - [ ] Acknowledge alerts
   - [ ] Check for toast notifications on new alerts

6. **Live View**
   - [ ] Open Live View page
   - [ ] Run SDK test script
   - [ ] Verify events appear in real-time

---

## Step 6: Test Alert Triggers

### 6.1 Trigger "Repeated Calls" Alert

The default rule triggers after 10 calls in 30 seconds:

```python
import os
import time
import crewai_monitor
from crewai_monitor.collector import get_collector

crewai_monitor.init(
    api_key=os.environ["API_KEY"],
    api_url="http://localhost:8000",
    debug=True,
)

collector = get_collector()

# Send 15 rapid tool calls - should trigger alert
print("Sending 15 rapid tool calls...")
for i in range(15):
    collector._send_event({
        "event_type": "tool_started",
        "trace_id": "alert-test-001",
        "agent_role": "spammer",
        "tool_name": "rapid_tool",
        "timestamp": time.time(),
    })
    time.sleep(0.1)

crewai_monitor.flush()
time.sleep(2)
crewai_monitor.shutdown()

print("Check dashboard for 'Repeated Tool Calls' alert!")
```

### 6.2 Trigger "Error Rate" Alert

The default rule triggers after 5 errors in 60 seconds:

```python
import os
import time
import crewai_monitor
from crewai_monitor.collector import get_collector

crewai_monitor.init(
    api_key=os.environ["API_KEY"],
    api_url="http://localhost:8000",
    debug=True,
)

collector = get_collector()

# Send 6 errors - should trigger alert
print("Sending 6 error events...")
for i in range(6):
    collector._send_event({
        "event_type": "tool_error",
        "trace_id": "error-test-001",
        "agent_role": "buggy_agent",
        "tool_name": "failing_tool",
        "error": True,
        "error_message": f"Simulated error #{i+1}",
        "timestamp": time.time(),
    })
    time.sleep(0.5)

crewai_monitor.flush()
time.sleep(2)
crewai_monitor.shutdown()

print("Check dashboard for 'High Error Rate' alert!")
```

---

## Step 7: Test Kill Switch

### 7.1 Test Kill Switch via API

```bash
# Kill an agent
curl -X POST http://localhost:8000/v1/control/kill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_role": "researcher"}'

# Check status
curl http://localhost:8000/v1/control/status \
  -H "Authorization: Bearer $TOKEN"

# Resume the agent
curl -X POST http://localhost:8000/v1/control/resume \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_role": "researcher"}'
```

### 7.2 Test Kill Switch in CrewAI

```python
import os
import time
import threading
import crewai_monitor
from crewai_monitor.hooks import check_kill_switch

crewai_monitor.init(
    api_key=os.environ["API_KEY"],
    api_url="http://localhost:8000",
    debug=True,
)

def simulate_agent():
    """Simulate an agent that checks kill switch before each action."""
    for i in range(20):
        agent_role = "test_agent"

        # Check if killed
        if check_kill_switch(agent_role):
            print(f"[{i}] Agent '{agent_role}' is KILLED - stopping")
            break

        print(f"[{i}] Agent '{agent_role}' is running...")
        time.sleep(1)

# Start agent in background
agent_thread = threading.Thread(target=simulate_agent)
agent_thread.start()

# In another terminal or dashboard, kill the agent:
# curl -X POST http://localhost:8000/v1/control/kill \
#   -H "Authorization: Bearer $TOKEN" \
#   -d '{"agent_role": "test_agent"}'

agent_thread.join()
crewai_monitor.shutdown()
```

---

## Step 8: Run Automated Tests

### 8.1 Backend Tests

```bash
cd /Users/alexstolb/Documents/Repos/crewai-monitor/backend

# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/ -v
```

### 8.2 SDK Tests

```bash
cd /Users/alexstolb/Documents/Repos/crewai-monitor/sdk

# Run tests
pytest tests/ -v
```

---

## Troubleshooting

### API Not Responding

```bash
# Check if containers are running
docker-compose ps

# View API logs
docker-compose logs api

# Restart services
docker-compose restart
```

### Database Connection Issues

```bash
# Check Postgres
docker-compose exec postgres psql -U user -d crewai_monitor -c "SELECT 1"

# Check QuestDB
curl http://localhost:9000/exec?query=SELECT%201
```

### SDK Not Sending Events

1. Enable debug mode: `crewai_monitor.init(..., debug=True)`
2. Check API URL is correct (default: http://localhost:8000)
3. Verify API key is valid
4. Check for network issues

### Dashboard Not Loading

```bash
# Check for build errors
npm run build

# Clear Next.js cache
rm -rf .next
npm run dev
```

### Alerts Not Triggering

1. Verify alert rules are enabled
2. Check rule configuration (threshold, window)
3. View worker logs: `docker-compose logs worker`
4. Manually test via API

---

## Quick Test Sequence

```bash
# 1. Start infrastructure
cd /Users/alexstolb/Documents/Repos/crewai-monitor
docker-compose up -d

# 2. Register and get API key
curl -X POST http://localhost:8000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123", "name": "Test"}'

# Save the token, then:
curl -X POST http://localhost:8000/v1/auth/keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key"}'

# 3. Create default alerts
curl -X POST http://localhost:8000/v1/alerts/rules/create-defaults \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Start dashboard
cd dashboard && npm install && npm run dev &

# 5. Install and test SDK
cd ../sdk && pip install -e .
export API_KEY="cm_live_..."
python test_sdk.py

# 6. Open http://localhost:3000 and verify everything works!
```
