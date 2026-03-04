#!/usr/bin/env python3
"""
Simple test script for CrewAI Monitor SDK.

Usage:
    export API_KEY="cm_live_..."
    python scripts/test_sdk.py
"""

import os
import sys
import time

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import crewai_monitor
from crewai_monitor import get_collector


def main():
    api_key = os.environ.get("API_KEY")
    if not api_key:
        print("Error: API_KEY environment variable not set")
        print("Usage: export API_KEY='cm_live_...' && python scripts/test_sdk.py")
        sys.exit(1)

    api_url = os.environ.get("API_URL", "http://localhost:8001")

    print(f"Initializing CrewAI Monitor...")
    print(f"  API URL: {api_url}")
    print(f"  API Key: {api_key[:20]}...")

    crewai_monitor.init(
        api_key=api_key,
        api_url=api_url,
        project_name="test-project",
        environment="development",
        debug=True,
    )

    collector = get_collector()
    trace_id = f"test-{int(time.time())}"

    # Set the trace ID for this test session
    collector._current_trace_id = trace_id

    print(f"\n--- Test 1: Sending normal tool calls ---")
    for i in range(5):
        collector._add_event(
            event_type="tool_started",
            agent_role="researcher",
            tool_name="web_search",
        )
        print(f"  Sent tool_started event #{i+1}")
        time.sleep(0.2)

    print(f"\n--- Test 2: Sending rapid calls (should trigger alert) ---")
    for i in range(12):
        collector._add_event(
            event_type="tool_started",
            agent_role="spammer",
            tool_name="rapid_tool",
        )
        print(f"  Sent rapid call #{i+1}")
        time.sleep(0.05)

    print(f"\n--- Test 3: Sending error events ---")
    for i in range(3):
        collector._add_event(
            event_type="tool_error",
            agent_role="buggy_agent",
            tool_name="failing_tool",
            error=True,
            error_message=f"Simulated error #{i+1}",
        )
        print(f"  Sent error event #{i+1}")
        time.sleep(0.3)

    print(f"\n--- Flushing events ---")
    crewai_monitor.flush()
    time.sleep(2)

    print(f"\n--- Shutting down ---")
    crewai_monitor.shutdown()

    print(f"\n✅ Test complete!")
    print(f"\nNext steps:")
    print(f"  1. Open http://localhost:3002 (dashboard)")
    print(f"  2. Go to Traces page - you should see trace '{trace_id}'")
    print(f"  3. Go to Alerts page - check for 'Repeated Tool Calls' alert")
    print(f"  4. Check for toast notifications")


if __name__ == "__main__":
    main()
