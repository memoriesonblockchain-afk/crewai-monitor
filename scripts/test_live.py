#!/usr/bin/env python3
"""
Live test script for CrewAI Monitor - simulates real agent activity.

Usage:
    export API_KEY="cm_live_..."
    python scripts/test_live.py
"""

import os
import sys
import time
import random
import uuid

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import crewai_monitor
from crewai_monitor import get_collector


def simulate_crew_run():
    """Simulate a complete crew execution with multiple agents."""
    collector = get_collector()
    trace_id = str(uuid.uuid4())[:8]

    # Set trace ID
    collector._current_trace_id = f"live-{trace_id}"

    print(f"\n{'='*60}")
    print(f"Starting simulated crew run: live-{trace_id}")
    print(f"{'='*60}")

    # Crew started
    collector._add_event(event_type="crew_started", payload={"crew_name": "Research Crew"})
    print(">> Crew started")
    time.sleep(0.5)

    agents = ["Researcher", "Analyst", "Writer"]
    tools = ["web_search", "read_file", "write_file", "analyze_data", "summarize"]

    for agent in agents:
        # Agent started
        collector._add_event(event_type="agent_started", agent_role=agent)
        print(f"   >> Agent '{agent}' started")
        time.sleep(0.3)

        # Simulate tool calls
        num_tools = random.randint(2, 5)
        for i in range(num_tools):
            tool = random.choice(tools)

            # Tool started
            collector._add_event(
                event_type="tool_started",
                agent_role=agent,
                tool_name=tool,
            )
            print(f"      >> {agent} using tool: {tool}")

            # Simulate tool execution time
            duration = random.uniform(0.2, 1.0)
            time.sleep(duration)

            # Randomly add errors (10% chance)
            if random.random() < 0.1:
                collector._add_event(
                    event_type="tool_error",
                    agent_role=agent,
                    tool_name=tool,
                    error=True,
                    error_message=f"Simulated error in {tool}",
                )
                print(f"      !! ERROR in {tool}")
            else:
                collector._add_event(
                    event_type="tool_finished",
                    agent_role=agent,
                    tool_name=tool,
                    duration_ms=duration * 1000,
                )

        # Agent completed
        collector._add_event(event_type="agent_completed", agent_role=agent)
        print(f"   << Agent '{agent}' completed")
        time.sleep(0.2)

    # Crew completed
    collector._add_event(event_type="crew_completed", payload={"output": "Task completed successfully"})
    print("<< Crew completed")

    # Flush events
    crewai_monitor.flush()
    print(f"\nEvents flushed for trace: live-{trace_id}")


def main():
    api_key = os.environ.get("API_KEY")
    if not api_key:
        print("Error: API_KEY environment variable not set")
        print("Usage: export API_KEY='cm_live_...' && python scripts/test_live.py")
        sys.exit(1)

    api_url = os.environ.get("API_URL", "http://localhost:8001")

    print(f"CrewAI Monitor Live Test")
    print(f"========================")
    print(f"API URL: {api_url}")
    print(f"API Key: {api_key[:20]}...")
    print()
    print("This script simulates crew runs continuously.")
    print("Open http://localhost:3002/dashboard/live to watch events.")
    print("Press Ctrl+C to stop.")
    print()

    crewai_monitor.init(
        api_key=api_key,
        api_url=api_url,
        project_name="live-test",
        environment="development",
        debug=True,
    )

    try:
        run_count = 0
        while True:
            run_count += 1
            print(f"\n[Run #{run_count}]")
            simulate_crew_run()

            # Wait between runs
            wait_time = random.randint(3, 8)
            print(f"\nWaiting {wait_time}s before next run...")
            time.sleep(wait_time)

    except KeyboardInterrupt:
        print("\n\nStopping...")
        crewai_monitor.shutdown()
        print("Done!")


if __name__ == "__main__":
    main()
