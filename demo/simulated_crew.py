#!/usr/bin/env python3
"""
Demo CrewAI simulation that generates real telemetry events.

This script simulates a multi-agent CrewAI crew without requiring
OpenAI API keys - it directly sends events to the monitoring backend
to showcase the visualization capabilities.

Usage:
    # For local backend
    python demo/simulated_crew.py --api-key YOUR_API_KEY

    # For deployed backend (Render)
    python demo/simulated_crew.py --api-key YOUR_API_KEY --api-url https://crewai-monitor-api.onrender.com
"""

import argparse
import json
import random
import sys
import time
import uuid
from datetime import datetime
from typing import Any

import requests

# Simulated agent configurations
AGENTS = [
    {
        "role": "Research Analyst",
        "goal": "Gather comprehensive data and insights on the given topic",
        "backstory": "An experienced researcher with expertise in data analysis and information synthesis",
        "tools": ["web_search", "document_reader", "data_analyzer"],
        "model": "gpt-4",
    },
    {
        "role": "Content Writer",
        "goal": "Create engaging and well-structured content based on research",
        "backstory": "A skilled writer who transforms complex information into clear narratives",
        "tools": ["text_editor", "grammar_checker", "plagiarism_detector"],
        "model": "gpt-4",
    },
    {
        "role": "Quality Reviewer",
        "goal": "Ensure content accuracy, clarity, and adherence to standards",
        "backstory": "A meticulous editor with an eye for detail and quality",
        "tools": ["fact_checker", "readability_analyzer", "style_guide"],
        "model": "gpt-4",
    },
]

# Simulated task descriptions
TASKS = [
    {
        "description": "Research the latest trends in AI agent frameworks",
        "expected_output": "A comprehensive report on AI agent trends with key findings",
        "agent_index": 0,
    },
    {
        "description": "Write an article summarizing the research findings",
        "expected_output": "A well-structured 1000-word article for a technical audience",
        "agent_index": 1,
    },
    {
        "description": "Review and improve the article for publication",
        "expected_output": "Edited article with feedback and final approval",
        "agent_index": 2,
    },
]

# Sample LLM prompts and responses
LLM_SAMPLES = {
    "Research Analyst": {
        "prompts": [
            "Analyze the current landscape of AI agent frameworks including CrewAI, AutoGPT, and LangChain agents.",
            "Identify the key differentiators between various multi-agent orchestration approaches.",
            "Summarize the technical requirements for building production-ready AI agent systems.",
        ],
        "responses": [
            "Based on my analysis, the AI agent framework landscape in 2024 shows several key trends:\n\n1. **Multi-Agent Collaboration**: Frameworks like CrewAI enable multiple specialized agents to work together on complex tasks.\n\n2. **Tool Integration**: Modern frameworks prioritize easy integration with external tools and APIs.\n\n3. **Memory Systems**: Long-term memory and context management have become essential features.\n\n4. **Observability**: Production systems require robust monitoring and tracing capabilities.",
            "The key differentiators include: orchestration patterns (hierarchical vs. flat), memory architectures, tool ecosystems, and deployment flexibility. CrewAI excels in role-based agent design.",
            "Production requirements include: rate limiting, error handling, cost tracking, kill switches for runaway agents, and comprehensive logging for debugging.",
        ],
    },
    "Content Writer": {
        "prompts": [
            "Create an engaging introduction for the article on AI agent frameworks.",
            "Structure the main body to cover research findings in a logical flow.",
            "Write a compelling conclusion with actionable takeaways.",
        ],
        "responses": [
            "# The Rise of AI Agent Frameworks: A Technical Deep Dive\n\nThe landscape of artificial intelligence is evolving rapidly, with AI agents emerging as one of the most transformative technologies of our time. Unlike traditional AI models that respond to single queries, AI agents can autonomously plan, execute, and adapt to achieve complex goals.",
            "## Key Findings\n\n### 1. Multi-Agent Architecture\n\nModern applications increasingly rely on teams of specialized agents rather than monolithic systems. This approach mirrors human organizational structures...\n\n### 2. Observability is Critical\n\nAs agents become more autonomous, the need for comprehensive monitoring grows...",
            "## Conclusion\n\nThe future of AI development lies in intelligent agent systems. Organizations should focus on:\n\n1. **Starting Small**: Begin with well-defined use cases\n2. **Investing in Monitoring**: Implement robust observability from day one\n3. **Building for Safety**: Include kill switches and rate limiting",
        ],
    },
    "Quality Reviewer": {
        "prompts": [
            "Review the article for technical accuracy and clarity.",
            "Check for consistency in terminology and tone throughout.",
            "Provide final recommendations for publication readiness.",
        ],
        "responses": [
            "Technical Review Complete:\n- All claims are supported by current industry data\n- Code examples are syntactically correct\n- Architecture diagrams accurately represent the concepts\n\nMinor corrections needed in section 2 regarding token limits.",
            "Consistency Check:\n- Terminology is consistent throughout\n- Tone maintains professional but accessible voice\n- Acronyms are properly defined on first use\n\nSuggested: Change 'AI system' to 'AI agent' in paragraph 3 for consistency.",
            "Publication Readiness: APPROVED\n\nThe article meets all quality standards. Recommended next steps:\n1. Final proofread by technical editor\n2. Add metadata and SEO optimization\n3. Schedule for publication",
        ],
    },
}

# Sample tool interactions
TOOL_SAMPLES = {
    "web_search": {
        "inputs": [
            {"query": "CrewAI framework latest features 2024"},
            {"query": "multi-agent AI systems comparison"},
            {"query": "AI agent observability best practices"},
        ],
        "outputs": [
            "Found 15 relevant results including official documentation, blog posts, and research papers.",
            "Retrieved comparison articles from TechCrunch, Towards Data Science, and official framework docs.",
            "Collected monitoring guides from Anthropic, OpenAI, and various observability platforms.",
        ],
    },
    "document_reader": {
        "inputs": [
            {"file": "crewai_documentation.pdf", "pages": "1-10"},
            {"file": "agent_patterns_whitepaper.pdf"},
        ],
        "outputs": [
            "Extracted key concepts: Agents, Tasks, Crews, Tools, Memory, Callbacks",
            "Identified 5 common agent design patterns with implementation examples.",
        ],
    },
    "data_analyzer": {
        "inputs": [
            {"data": "usage_metrics.csv", "analysis_type": "trend"},
        ],
        "outputs": [
            "Trend analysis complete: 340% growth in AI agent adoption over 12 months.",
        ],
    },
    "text_editor": {
        "inputs": [
            {"action": "format", "style": "markdown"},
            {"action": "structure", "outline": True},
        ],
        "outputs": [
            "Document formatted with proper headings, code blocks, and bullet points.",
            "Created structured outline with 5 main sections and 12 subsections.",
        ],
    },
    "fact_checker": {
        "inputs": [
            {"claims": ["CrewAI supports multi-agent workflows", "GPT-4 has 175B parameters"]},
        ],
        "outputs": [
            "Verification complete: Claim 1 verified. Claim 2 needs correction (GPT-4 params not publicly disclosed).",
        ],
    },
}


class TelemetrySimulator:
    """Simulates CrewAI execution and sends telemetry to the monitoring backend."""

    def __init__(self, api_key: str, api_url: str, project_name: str = "Demo Research Crew"):
        self.api_key = api_key
        self.api_url = api_url.rstrip("/")
        self.project_name = project_name
        self.trace_id = str(uuid.uuid4())
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })
        self.event_count = 0
        self.start_time = time.time()

    def send_event(self, event_type: str, **kwargs) -> bool:
        """Send a single event to the backend."""
        event = {
            "event_id": str(uuid.uuid4()),
            "trace_id": self.trace_id,
            "event_type": event_type,
            "timestamp": time.time(),
            "project_name": self.project_name,
            "environment": "demo",
            **kwargs
        }

        try:
            response = self.session.post(
                f"{self.api_url}/v1/ingest/event",
                json=event,
                timeout=10
            )
            self.event_count += 1
            if response.status_code in (200, 201, 202):
                return True
            else:
                print(f"  Warning: Event send returned {response.status_code}: {response.text[:100]}")
                return False
        except Exception as e:
            print(f"  Error sending event: {e}")
            return False

    def simulate_llm_call(self, agent: dict, prompt_idx: int = 0) -> float:
        """Simulate an LLM call with realistic timing."""
        role = agent["role"]
        samples = LLM_SAMPLES.get(role, LLM_SAMPLES["Research Analyst"])

        prompt = samples["prompts"][prompt_idx % len(samples["prompts"])]
        response = samples["responses"][prompt_idx % len(samples["responses"])]

        # Simulate request
        print(f"    LLM call: {prompt[:50]}...")

        self.send_event(
            "llm_started",
            agent_role=role,
            payload={
                "model": agent["model"],
                "messages": [
                    {"role": "system", "content": f"You are a {role}. {agent['goal']}"},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
            }
        )

        # Simulate processing time (1-3 seconds)
        duration_ms = random.uniform(1000, 3000)
        time.sleep(duration_ms / 1000)

        # Calculate tokens (rough estimate)
        input_tokens = len(prompt.split()) * 1.3
        output_tokens = len(response.split()) * 1.3

        self.send_event(
            "llm_completed",
            agent_role=role,
            duration_ms=duration_ms,
            payload={
                "model": agent["model"],
                "response": response,
                "input_tokens": int(input_tokens),
                "output_tokens": int(output_tokens),
                "total_tokens": int(input_tokens + output_tokens),
                "cost": round((input_tokens * 0.00003 + output_tokens * 0.00006), 6),
            }
        )

        return duration_ms

    def simulate_tool_call(self, agent: dict, tool_name: str) -> float:
        """Simulate a tool call with realistic timing."""
        role = agent["role"]
        samples = TOOL_SAMPLES.get(tool_name, {"inputs": [{}], "outputs": ["Tool executed successfully"]})

        tool_input = random.choice(samples["inputs"])
        tool_output = random.choice(samples["outputs"])

        print(f"    Tool: {tool_name} - {json.dumps(tool_input)[:50]}...")

        self.send_event(
            "tool_started",
            agent_role=role,
            tool_name=tool_name,
            tool_input=tool_input,
        )

        # Simulate tool execution (0.5-2 seconds)
        duration_ms = random.uniform(500, 2000)
        time.sleep(duration_ms / 1000)

        self.send_event(
            "tool_finished",
            agent_role=role,
            tool_name=tool_name,
            tool_result=tool_output,
            duration_ms=duration_ms,
        )

        return duration_ms

    def simulate_agent_execution(self, agent: dict, task: dict) -> None:
        """Simulate a single agent executing a task."""
        role = agent["role"]
        print(f"\n  Agent: {role}")
        print(f"  Task: {task['description'][:60]}...")

        # Agent started
        self.send_event(
            "agent_started",
            agent_role=role,
            payload={
                "goal": agent["goal"],
                "backstory": agent["backstory"],
                "tools": agent["tools"],
                "model": agent["model"],
            }
        )

        # Task started
        self.send_event(
            "task_started",
            agent_role=role,
            task_description=task["description"],
            payload={
                "expected_output": task["expected_output"],
                "assigned_agent": role,
            }
        )

        # Simulate work: alternate between LLM calls and tool usage
        num_iterations = random.randint(2, 4)
        for i in range(num_iterations):
            # LLM reasoning
            self.simulate_llm_call(agent, i)

            # Tool usage (sometimes)
            if agent["tools"] and random.random() > 0.3:
                tool = random.choice(agent["tools"])
                self.simulate_tool_call(agent, tool)

        # Final LLM call to generate output
        self.simulate_llm_call(agent, num_iterations)

        # Task completed
        self.send_event(
            "task_completed",
            agent_role=role,
            payload={
                "output": f"Task '{task['description'][:30]}...' completed successfully with high-quality output.",
            }
        )

        # Agent completed
        self.send_event(
            "agent_completed",
            agent_role=role,
            payload={
                "output": f"{role} has completed the assigned task and handed off results.",
            }
        )

    def run_crew(self, continuous: bool = False) -> None:
        """Run a full crew simulation."""
        while True:
            self.trace_id = str(uuid.uuid4())
            self.start_time = time.time()

            print(f"\n{'='*60}")
            print(f"Starting Crew Execution: {self.project_name}")
            print(f"Trace ID: {self.trace_id}")
            print(f"API URL: {self.api_url}")
            print(f"{'='*60}")

            # Crew kickoff
            self.send_event(
                "crew_started",
                payload={
                    "crew_name": self.project_name,
                    "inputs": {"topic": "AI Agent Frameworks", "output_format": "article"},
                }
            )

            # Execute each task with its assigned agent
            for task in TASKS:
                agent = AGENTS[task["agent_index"]]
                self.simulate_agent_execution(agent, task)

            # Crew completed
            total_duration = (time.time() - self.start_time) * 1000
            self.send_event(
                "crew_completed",
                duration_ms=total_duration,
                payload={
                    "crew_name": self.project_name,
                    "output": "Crew execution completed successfully. Article ready for publication.",
                }
            )

            print(f"\n{'='*60}")
            print(f"Crew Execution Complete!")
            print(f"Total Events: {self.event_count}")
            print(f"Duration: {total_duration/1000:.1f}s")
            print(f"{'='*60}\n")

            if not continuous:
                break

            # Wait before next run
            wait_time = random.randint(30, 60)
            print(f"Next crew execution in {wait_time} seconds...")
            time.sleep(wait_time)


def main():
    parser = argparse.ArgumentParser(description="Simulate CrewAI execution with telemetry")
    parser.add_argument("--api-key", required=True, help="Your API key (starts with cm_live_ or cm_test_)")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    parser.add_argument("--project", default="Demo Research Crew", help="Project name")
    parser.add_argument("--continuous", action="store_true", help="Run continuously with delays between executions")

    args = parser.parse_args()

    if not args.api_key.startswith(("cm_live_", "cm_test_")):
        print("Error: API key must start with 'cm_live_' or 'cm_test_'")
        sys.exit(1)

    simulator = TelemetrySimulator(
        api_key=args.api_key,
        api_url=args.api_url,
        project_name=args.project,
    )

    try:
        simulator.run_crew(continuous=args.continuous)
    except KeyboardInterrupt:
        print("\n\nSimulation stopped by user.")
        print(f"Total events sent: {simulator.event_count}")


if __name__ == "__main__":
    main()
