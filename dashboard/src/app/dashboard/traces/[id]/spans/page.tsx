"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/store";
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  Bot,
  Wrench,
  MessageSquare,
  Play,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  DollarSign,
  Hash,
} from "lucide-react";

interface Message {
  role: string;
  content: string;
  truncated?: boolean;
}

// API response types
interface TraceEvent {
  event_id: string;
  trace_id: string;
  event_type: string;
  timestamp: string;
  agent_role: string | null;
  task_description: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_result: string | null;
  duration_ms: number | null;
  error: boolean;
  error_message: string | null;
  payload: Record<string, unknown>;
}

interface TraceDetail {
  trace_id: string;
  project_name: string;
  environment: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  events: TraceEvent[];
  agents: string[];
  tools_used: string[];
  error_count: number;
}

interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  type: "crew" | "agent" | "task" | "tool" | "llm";
  startTime: number;
  endTime: number;
  duration: number;
  status: "success" | "error" | "running";
  attributes: Record<string, unknown>;
  children: Span[];
}

// Transform API events into spans
function transformEventsToSpans(events: TraceEvent[], traceId: string): Span[] {
  const spans: Span[] = [];
  const openSpans: Map<string, { event: TraceEvent; spanId: string; parentSpanId: string | null }> = new Map();
  const parentStack: string[] = []; // Stack of span IDs for parent tracking

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let spanCounter = 0;

  for (const event of sortedEvents) {
    const eventBase = event.event_type.replace(/_started|_completed|_failed/g, "");
    const isStart = event.event_type.endsWith("_started");
    const isEnd = event.event_type.endsWith("_completed") || event.event_type.endsWith("_failed");

    // Determine span type
    let spanType: Span["type"] = "crew";
    if (eventBase === "agent") spanType = "agent";
    else if (eventBase === "task") spanType = "task";
    else if (eventBase === "tool") spanType = "tool";
    else if (eventBase === "llm") spanType = "llm";
    else if (eventBase === "crew") spanType = "crew";

    // Create a unique key for matching start/end events
    const eventKey = `${eventBase}_${event.agent_role || ""}_${event.tool_name || ""}_${event.task_description?.slice(0, 50) || ""}`;

    if (isStart) {
      // Create a new span
      spanCounter++;
      const spanId = `span-${spanCounter.toString().padStart(3, "0")}`;
      const parentSpanId = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;

      openSpans.set(eventKey, { event, spanId, parentSpanId });
      parentStack.push(spanId);

      // Create span name based on type
      let name = eventBase.charAt(0).toUpperCase() + eventBase.slice(1);
      if (event.agent_role) name = `Agent: ${event.agent_role}`;
      else if (event.tool_name) name = `Tool: ${event.tool_name}`;
      else if (event.task_description) name = `Task: ${event.task_description.slice(0, 30)}...`;
      else if (spanType === "llm") name = "LLM Call";
      else if (spanType === "crew") name = "Crew Execution";

      // Build attributes from payload and event fields
      const attributes: Record<string, unknown> = { ...event.payload };
      if (event.agent_role) attributes.role = event.agent_role;
      if (event.task_description) attributes.description = event.task_description;
      if (event.tool_name) attributes.tool_name = event.tool_name;
      if (event.tool_input) attributes.input = event.tool_input;
      if (event.tool_result) attributes.output = event.tool_result;
      if (event.error_message) attributes.error = event.error_message;

      const span: Span = {
        id: spanId,
        traceId,
        parentId: parentSpanId,
        name,
        type: spanType,
        startTime: new Date(event.timestamp).getTime(),
        endTime: new Date(event.timestamp).getTime(), // Will be updated when end event arrives
        duration: 0,
        status: "running",
        attributes,
        children: [],
      };

      spans.push(span);
    } else if (isEnd) {
      // Find and update the matching start span
      const openSpan = openSpans.get(eventKey);
      if (openSpan) {
        const span = spans.find(s => s.id === openSpan.spanId);
        if (span) {
          span.endTime = new Date(event.timestamp).getTime();
          span.duration = span.endTime - span.startTime;
          span.status = event.error || event.event_type.endsWith("_failed") ? "error" : "success";

          // Merge end event payload (e.g., response, tokens, cost from llm_completed)
          if (event.payload) {
            Object.assign(span.attributes, event.payload);
          }
          if (event.tool_result) span.attributes.output = event.tool_result;
          if (event.error_message) span.attributes.error = event.error_message;
          if (event.duration_ms) span.duration = event.duration_ms;
        }

        openSpans.delete(eventKey);
        // Pop from parent stack
        const idx = parentStack.indexOf(openSpan.spanId);
        if (idx >= 0) parentStack.splice(idx, 1);
      }
    }
  }

  // Mark any still-open spans as running
  Array.from(openSpans.values()).forEach(({ spanId }) => {
    const span = spans.find(s => s.id === spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
    }
  });

  return spans;
}

// Fallback: Mock data generator for realistic spans with full telemetry
function generateMockSpans(traceId: string): Span[] {
  const baseTime = Date.now() - 45000; // 45 seconds ago

  const spans: Span[] = [
    {
      id: "span-001",
      traceId,
      parentId: null,
      name: "Crew Execution",
      type: "crew",
      startTime: baseTime,
      endTime: baseTime + 42000,
      duration: 42000,
      status: "success",
      attributes: {
        crew_name: "Research Crew",
        inputs: { topic: "AI Trends 2024" },
        output: "Successfully completed research and report generation on AI Trends 2024. The report covers key areas including generative AI, multimodal models, and enterprise AI adoption.",
      },
      children: [],
    },
    {
      id: "span-002",
      traceId,
      parentId: "span-001",
      name: "Agent: Researcher",
      type: "agent",
      startTime: baseTime + 100,
      endTime: baseTime + 18000,
      duration: 17900,
      status: "success",
      attributes: {
        role: "Researcher",
        goal: "Find comprehensive information about AI trends and compile research findings",
        backstory: "You are an expert AI researcher with 10 years of experience tracking industry trends and technological advancements.",
        model: "gpt-4",
        tools: ["web_search", "read_file", "scrape_website"],
        allow_delegation: false,
      },
      children: [],
    },
    {
      id: "span-003",
      traceId,
      parentId: "span-002",
      name: "Task: Research AI Trends",
      type: "task",
      startTime: baseTime + 200,
      endTime: baseTime + 17500,
      duration: 17300,
      status: "success",
      attributes: {
        description: "Research the latest AI trends for 2024 and compile comprehensive findings including market analysis, key players, and emerging technologies.",
        expected_output: "A detailed research summary with citations and key statistics",
        assigned_agent: "Researcher",
      },
      children: [],
    },
    {
      id: "span-004",
      traceId,
      parentId: "span-003",
      name: "Tool: web_search",
      type: "tool",
      startTime: baseTime + 500,
      endTime: baseTime + 3200,
      duration: 2700,
      status: "success",
      attributes: {
        tool_name: "web_search",
        input: { query: "AI trends 2024 enterprise adoption statistics" },
        output: "Found 15 relevant articles:\n1. 'Enterprise AI Adoption Reaches 72% in 2024' - Forbes\n2. 'Generative AI Market to Hit $1.3T by 2032' - McKinsey\n3. 'Top 10 AI Trends Reshaping Business' - Gartner\n4. 'OpenAI and Google Lead AI Race' - TechCrunch\n5. 'AI Infrastructure Spending Surges 40%' - IDC",
      },
      children: [],
    },
    {
      id: "span-005",
      traceId,
      parentId: "span-003",
      name: "LLM Call",
      type: "llm",
      startTime: baseTime + 3500,
      endTime: baseTime + 8200,
      duration: 4700,
      status: "success",
      attributes: {
        model: "gpt-4-turbo",
        temperature: 0.7,
        max_tokens: 2000,
        input_tokens: 2450,
        output_tokens: 890,
        total_tokens: 3340,
        cost: 0.12,
        messages: [
          { role: "system", content: "You are an expert AI researcher with 10 years of experience tracking industry trends and technological advancements. Your goal is to find comprehensive information about AI trends and compile research findings." },
          { role: "user", content: "Based on the search results, analyze the key AI trends for 2024. Focus on:\n1. Enterprise adoption rates\n2. Market size projections\n3. Key technology areas\n4. Major players\n\nSearch Results:\n- Enterprise AI Adoption Reaches 72% in 2024 (Forbes)\n- Generative AI Market to Hit $1.3T by 2032 (McKinsey)\n- Top 10 AI Trends Reshaping Business (Gartner)..." },
        ],
        response: "Based on my analysis of the search results, here are the key AI trends for 2024:\n\n## 1. Enterprise Adoption\nEnterprise AI adoption has reached an unprecedented 72% in 2024, up from 55% in 2023. This represents a significant acceleration driven by:\n- Improved ROI visibility\n- Better tooling and platforms\n- Increased executive buy-in\n\n## 2. Market Projections\nThe generative AI market is projected to reach $1.3 trillion by 2032, with a CAGR of 42%. Key growth areas include:\n- Content generation\n- Code assistance\n- Customer service automation\n\n## 3. Technology Focus Areas\n- Multimodal AI (text, image, video, audio)\n- Small language models for edge deployment\n- AI agents and autonomous systems\n- Retrieval-augmented generation (RAG)\n\n## 4. Major Players\nOpenAI, Google, Anthropic, and Microsoft continue to lead...",
      },
      children: [],
    },
    {
      id: "span-006",
      traceId,
      parentId: "span-003",
      name: "Tool: web_search",
      type: "tool",
      startTime: baseTime + 8500,
      endTime: baseTime + 11000,
      duration: 2500,
      status: "success",
      attributes: {
        tool_name: "web_search",
        input: { query: "generative AI applications enterprise use cases 2024" },
        output: "Found 12 relevant articles:\n1. 'How Enterprises Use GenAI in Production' - Harvard Business Review\n2. 'Top GenAI Use Cases by Industry' - Deloitte\n3. 'ROI of Generative AI Projects' - Accenture",
      },
      children: [],
    },
    {
      id: "span-007",
      traceId,
      parentId: "span-003",
      name: "Tool: read_file",
      type: "tool",
      startTime: baseTime + 11200,
      endTime: baseTime + 11800,
      duration: 600,
      status: "error",
      attributes: {
        tool_name: "read_file",
        input: { path: "/data/previous_report.txt" },
        error: "FileNotFoundError: [Errno 2] No such file or directory: '/data/previous_report.txt'",
      },
      children: [],
    },
    {
      id: "span-008",
      traceId,
      parentId: "span-003",
      name: "LLM Call",
      type: "llm",
      startTime: baseTime + 12000,
      endTime: baseTime + 17000,
      duration: 5000,
      status: "success",
      attributes: {
        model: "gpt-4-turbo",
        temperature: 0.7,
        max_tokens: 3000,
        input_tokens: 3200,
        output_tokens: 1250,
        total_tokens: 4450,
        cost: 0.18,
        messages: [
          { role: "system", content: "You are an expert AI researcher..." },
          { role: "user", content: "Compile the final research summary incorporating all findings about AI trends 2024, enterprise use cases, and market projections." },
        ],
        response: "# AI Trends 2024: Comprehensive Research Summary\n\n## Executive Summary\nThe AI landscape in 2024 is characterized by rapid enterprise adoption, significant market growth, and technological maturation...\n\n## Key Findings\n\n### 1. Enterprise Adoption at Scale\n- 72% of enterprises now use AI in production\n- Average of 4.2 AI projects per organization\n- 89% report positive ROI within 18 months\n\n### 2. Generative AI Dominance\n- $67B market in 2024, growing to $1.3T by 2032\n- Primary use cases: content creation (34%), code assistance (28%), customer service (22%)\n- 45% of enterprises have deployed GenAI chatbots\n\n### 3. Technology Trends\n- Multimodal AI becoming standard\n- RAG architecture for enterprise knowledge bases\n- AI agents for autonomous task completion\n- Edge AI for latency-sensitive applications...",
      },
      children: [],
    },
    {
      id: "span-009",
      traceId,
      parentId: "span-001",
      name: "Agent: Writer",
      type: "agent",
      startTime: baseTime + 18500,
      endTime: baseTime + 35000,
      duration: 16500,
      status: "success",
      attributes: {
        role: "Writer",
        goal: "Write a comprehensive, well-structured report based on research findings",
        backstory: "You are a skilled technical writer with expertise in explaining complex AI concepts to business audiences.",
        model: "gpt-4",
        tools: ["write_file", "read_file"],
        allow_delegation: false,
      },
      children: [],
    },
    {
      id: "span-010",
      traceId,
      parentId: "span-009",
      name: "Task: Write Report",
      type: "task",
      startTime: baseTime + 18600,
      endTime: baseTime + 34500,
      duration: 15900,
      status: "success",
      attributes: {
        description: "Write a detailed, professional report based on the research findings. Include executive summary, key findings, market analysis, and recommendations.",
        expected_output: "A polished markdown report suitable for executive presentation",
        assigned_agent: "Writer",
        context_tasks: ["Research AI Trends"],
      },
      children: [],
    },
    {
      id: "span-011",
      traceId,
      parentId: "span-010",
      name: "LLM Call",
      type: "llm",
      startTime: baseTime + 19000,
      endTime: baseTime + 28000,
      duration: 9000,
      status: "success",
      attributes: {
        model: "gpt-4-turbo",
        temperature: 0.5,
        max_tokens: 4000,
        input_tokens: 4500,
        output_tokens: 2800,
        total_tokens: 7300,
        cost: 0.32,
        messages: [
          { role: "system", content: "You are a skilled technical writer with expertise in explaining complex AI concepts to business audiences." },
          { role: "user", content: "Based on the following research findings, write a comprehensive executive report on AI Trends 2024:\n\n[Research Summary]\n- Enterprise adoption at 72%\n- Market size $67B growing to $1.3T\n- Key trends: multimodal AI, RAG, AI agents\n..." },
        ],
        response: "# AI Trends 2024: Executive Report\n\n## Executive Summary\n\nThe artificial intelligence landscape in 2024 represents a pivotal moment in technological history. With enterprise adoption reaching 72% and the generative AI market valued at $67 billion, organizations across industries are fundamentally transforming their operations through AI integration.\n\nThis report provides a comprehensive analysis of current AI trends, market dynamics, and strategic recommendations for business leaders navigating this rapidly evolving landscape.\n\n## Key Findings\n\n### Market Overview\n\nThe global AI market has demonstrated unprecedented growth:\n\n| Metric | 2024 Value | 2032 Projection | CAGR |\n|--------|------------|-----------------|------|\n| Total AI Market | $184B | $1.8T | 33% |\n| Generative AI | $67B | $1.3T | 42% |\n| Enterprise AI | $45B | $380B | 35% |\n\n### Adoption Patterns\n\n**Enterprise Integration**\nOrganizations are moving beyond pilot projects to production deployments:\n- 72% have at least one AI system in production\n- Average of 4.2 active AI projects per enterprise\n- 89% report positive ROI within 18 months\n\n**Industry Leaders**\n- Financial Services: 84% adoption\n- Healthcare: 76% adoption\n- Technology: 91% adoption\n- Manufacturing: 68% adoption\n\n## Technology Landscape\n\n### Dominant Trends\n\n1. **Multimodal AI**\n   The convergence of text, image, video, and audio processing...\n\n2. **Retrieval-Augmented Generation (RAG)**\n   Enterprises are combining LLMs with proprietary knowledge bases...\n\n3. **AI Agents**\n   Autonomous systems capable of multi-step task completion...\n\n## Recommendations\n\n1. Prioritize AI governance and ethics frameworks\n2. Invest in data infrastructure and quality\n3. Develop AI literacy across the organization\n4. Start with high-ROI use cases\n5. Build vs. buy decision framework\n\n## Conclusion\n\nThe AI revolution is no longer coming—it is here...",
      },
      children: [],
    },
    {
      id: "span-012",
      traceId,
      parentId: "span-010",
      name: "Tool: write_file",
      type: "tool",
      startTime: baseTime + 28500,
      endTime: baseTime + 29200,
      duration: 700,
      status: "success",
      attributes: {
        tool_name: "write_file",
        input: { path: "/output/ai_trends_2024_report.md", content: "[report content]" },
        output: "Successfully wrote 4,523 bytes to /output/ai_trends_2024_report.md",
      },
      children: [],
    },
    {
      id: "span-013",
      traceId,
      parentId: "span-010",
      name: "LLM Call",
      type: "llm",
      startTime: baseTime + 29500,
      endTime: baseTime + 34000,
      duration: 4500,
      status: "success",
      attributes: {
        model: "gpt-4-turbo",
        temperature: 0.3,
        max_tokens: 1000,
        input_tokens: 1800,
        output_tokens: 650,
        total_tokens: 2450,
        cost: 0.09,
        messages: [
          { role: "system", content: "You are a skilled technical writer..." },
          { role: "user", content: "Generate a brief summary of the report that was just written for the task completion." },
        ],
        response: "The AI Trends 2024 Executive Report has been successfully completed. The report covers:\n\n- Market overview with $184B total AI market growing to $1.8T by 2032\n- Enterprise adoption statistics showing 72% adoption rate\n- Technology trends including multimodal AI, RAG, and AI agents\n- Industry-specific adoption patterns\n- Strategic recommendations for business leaders\n\nThe full report has been saved to /output/ai_trends_2024_report.md",
      },
      children: [],
    },
    {
      id: "span-014",
      traceId,
      parentId: "span-001",
      name: "Agent: Editor",
      type: "agent",
      startTime: baseTime + 35500,
      endTime: baseTime + 41500,
      duration: 6000,
      status: "success",
      attributes: {
        role: "Editor",
        goal: "Review and polish the report for clarity, accuracy, and professional presentation",
        backstory: "You are a senior editor with 15 years of experience in business and technology publications.",
        model: "gpt-4",
        tools: ["read_file", "write_file"],
        allow_delegation: false,
      },
      children: [],
    },
    {
      id: "span-015",
      traceId,
      parentId: "span-014",
      name: "Task: Edit Report",
      type: "task",
      startTime: baseTime + 35600,
      endTime: baseTime + 41000,
      duration: 5400,
      status: "success",
      attributes: {
        description: "Review and edit the report for clarity, grammar, consistency, and professional tone. Ensure all statistics are properly cited.",
        expected_output: "A polished, publication-ready report",
        assigned_agent: "Editor",
        context_tasks: ["Write Report"],
      },
      children: [],
    },
    {
      id: "span-016",
      traceId,
      parentId: "span-015",
      name: "LLM Call",
      type: "llm",
      startTime: baseTime + 36000,
      endTime: baseTime + 40500,
      duration: 4500,
      status: "success",
      attributes: {
        model: "gpt-4-turbo",
        temperature: 0.2,
        max_tokens: 2000,
        input_tokens: 3500,
        output_tokens: 450,
        total_tokens: 3950,
        cost: 0.08,
        messages: [
          { role: "system", content: "You are a senior editor with 15 years of experience in business and technology publications. Your goal is to review and polish the report for clarity, accuracy, and professional presentation." },
          { role: "user", content: "Review the following AI Trends 2024 report and provide editing feedback:\n\n[Full report content...]\n\nFocus on:\n1. Grammar and clarity\n2. Consistency of tone\n3. Statistical accuracy\n4. Professional formatting" },
        ],
        response: "## Editorial Review Complete\n\n### Changes Made:\n1. **Grammar & Clarity**: Fixed 3 minor grammatical issues, improved sentence flow in executive summary\n2. **Tone**: Adjusted 2 sections for more consistent professional tone\n3. **Statistics**: All statistics verified and properly formatted\n4. **Formatting**: Enhanced table alignment, consistent heading hierarchy\n\n### Quality Assessment:\n- Overall quality: Excellent\n- Readability score: Professional/Executive level\n- Recommended for publication: Yes\n\nThe report is now publication-ready.",
      },
      children: [],
    },
  ];

  return spans;
}

// Build tree structure from flat spans
function buildSpanTree(spans: Span[]): Span[] {
  const spanMap = new Map<string, Span>();
  const roots: Span[] = [];

  // First pass: create map and initialize children arrays
  spans.forEach((span) => {
    spanMap.set(span.id, { ...span, children: [] });
  });

  // Second pass: build tree
  spans.forEach((span) => {
    const currentSpan = spanMap.get(span.id)!;
    if (span.parentId && spanMap.has(span.parentId)) {
      spanMap.get(span.parentId)!.children.push(currentSpan);
    } else {
      roots.push(currentSpan);
    }
  });

  return roots;
}

// Get tooltip preview content based on span type
function getTooltipPreview(span: Span): React.ReactNode {
  const attrs = span.attributes;

  switch (span.type) {
    case "llm": {
      const messages = attrs.messages as Message[] | undefined;
      const response = attrs.response as string | undefined;
      const inputTokens = attrs.input_tokens as number | undefined;
      const outputTokens = attrs.output_tokens as number | undefined;
      const cost = attrs.cost as number | undefined;
      const model = attrs.model as string | undefined;

      return (
        <div className="space-y-2 max-w-md">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {model && <Badge variant="outline" className="text-[10px]">{model}</Badge>}
            {inputTokens && <span><Hash className="h-3 w-3 inline" /> {inputTokens} in</span>}
            {outputTokens && <span><Hash className="h-3 w-3 inline" /> {outputTokens} out</span>}
            {cost && <span><DollarSign className="h-3 w-3 inline" /> ${cost.toFixed(3)}</span>}
          </div>
          {messages && messages.length > 0 && (
            <div className="border-l-2 border-blue-500 pl-2">
              <div className="text-[10px] text-muted-foreground uppercase">Prompt</div>
              <div className="text-xs line-clamp-3">
                {messages[messages.length - 1]?.content?.slice(0, 200)}...
              </div>
            </div>
          )}
          {response && (
            <div className="border-l-2 border-green-500 pl-2">
              <div className="text-[10px] text-muted-foreground uppercase">Response</div>
              <div className="text-xs line-clamp-3">{response.slice(0, 200)}...</div>
            </div>
          )}
        </div>
      );
    }
    case "tool": {
      const input = attrs.input as Record<string, unknown> | undefined;
      const output = attrs.output as string | undefined;
      const error = attrs.error as string | undefined;

      return (
        <div className="space-y-2 max-w-md">
          {input && (
            <div className="border-l-2 border-orange-500 pl-2">
              <div className="text-[10px] text-muted-foreground uppercase">Input</div>
              <div className="text-xs font-mono line-clamp-2">
                {JSON.stringify(input).slice(0, 150)}
              </div>
            </div>
          )}
          {output && (
            <div className="border-l-2 border-green-500 pl-2">
              <div className="text-[10px] text-muted-foreground uppercase">Output</div>
              <div className="text-xs line-clamp-2">{output.slice(0, 150)}</div>
            </div>
          )}
          {error && (
            <div className="border-l-2 border-red-500 pl-2">
              <div className="text-[10px] text-muted-foreground uppercase">Error</div>
              <div className="text-xs text-red-500 line-clamp-2">{error}</div>
            </div>
          )}
        </div>
      );
    }
    case "agent": {
      const role = attrs.role as string | undefined;
      const goal = attrs.goal as string | undefined;
      const tools = attrs.tools as string[] | undefined;

      return (
        <div className="space-y-2 max-w-md">
          {role && <div className="font-medium">{role}</div>}
          {goal && (
            <div className="text-xs text-muted-foreground line-clamp-2">{goal}</div>
          )}
          {tools && tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tools.slice(0, 5).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "task": {
      const description = attrs.description as string | undefined;
      const expectedOutput = attrs.expected_output as string | undefined;

      return (
        <div className="space-y-2 max-w-md">
          {description && (
            <div className="text-xs line-clamp-3">{description}</div>
          )}
          {expectedOutput && (
            <div className="text-[10px] text-muted-foreground">
              Expected: {expectedOutput.slice(0, 100)}
            </div>
          )}
        </div>
      );
    }
    default:
      return (
        <div className="text-xs text-muted-foreground">
          Click to view details
        </div>
      );
  }
}

// Span bar component
function SpanBar({
  span,
  totalDuration,
  minTime,
  depth,
  expanded,
  onToggle,
  onSelect,
  selected,
}: {
  span: Span;
  totalDuration: number;
  minTime: number;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const offsetPercent = ((span.startTime - minTime) / totalDuration) * 100;
  const widthPercent = Math.max((span.duration / totalDuration) * 100, 0.5);

  const typeColors: Record<string, string> = {
    crew: "bg-purple-500",
    agent: "bg-blue-500",
    task: "bg-green-500",
    tool: "bg-orange-500",
    llm: "bg-pink-500",
  };

  const typeIcons: Record<string, React.ReactNode> = {
    crew: <Play className="h-3 w-3" />,
    agent: <Bot className="h-3 w-3" />,
    task: <CheckCircle className="h-3 w-3" />,
    tool: <Wrench className="h-3 w-3" />,
    llm: <MessageSquare className="h-3 w-3" />,
  };

  const hasChildren = span.children.length > 0;

  // Quick stats for the span
  const quickStats = [];
  if (span.type === "llm") {
    const tokens = (span.attributes.input_tokens as number || 0) + (span.attributes.output_tokens as number || 0);
    if (tokens) quickStats.push(`${tokens} tokens`);
    if (span.attributes.cost) quickStats.push(`$${(span.attributes.cost as number).toFixed(2)}`);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`group border-b border-border/50 hover:bg-muted/50 cursor-pointer ${
            selected ? "bg-muted" : ""
          }`}
          onClick={onSelect}
        >
          <div className="flex items-center h-10">
            {/* Left side: Name and hierarchy */}
            <div
              className="flex items-center gap-1 min-w-[300px] max-w-[300px] px-2"
              style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className="p-0.5 hover:bg-muted rounded"
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}
              <span
                className={`p-1 rounded ${typeColors[span.type]} text-white`}
              >
                {typeIcons[span.type]}
              </span>
              <span className="text-sm truncate">{span.name}</span>
              {span.status === "error" && (
                <AlertTriangle className="h-3 w-3 text-red-500 ml-1" />
              )}
              {quickStats.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-2">
                  {quickStats.join(" • ")}
                </span>
              )}
            </div>

            {/* Right side: Timeline bar */}
            <div className="flex-1 h-full relative px-2">
              <div className="absolute inset-y-2 left-0 right-0">
                {/* Timeline background */}
                <div className="h-full w-full bg-muted/30 rounded relative">
                  {/* Span bar */}
                  <div
                    className={`absolute h-full rounded ${typeColors[span.type]} ${
                      span.status === "error" ? "opacity-70" : "opacity-90"
                    } transition-all hover:opacity-100`}
                    style={{
                      left: `${offsetPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                  >
                    {/* Duration label */}
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-white font-medium whitespace-nowrap">
                      {span.duration >= 1000
                        ? `${(span.duration / 1000).toFixed(1)}s`
                        : `${span.duration}ms`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="p-3">
        <div className="text-sm font-medium mb-2">{span.name}</div>
        {getTooltipPreview(span)}
      </TooltipContent>
    </Tooltip>
  );
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

// Message bubble component for LLM conversations
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg p-3 ${
          isSystem
            ? "bg-muted border text-sm"
            : isUser
            ? "bg-blue-500 text-white"
            : "bg-green-500 text-white"
        }`}
      >
        <div className="text-[10px] uppercase opacity-70 mb-1">
          {message.role}
        </div>
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
          {message.truncated && (
            <span className="text-xs opacity-70"> [truncated]</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Rich detail panel for span
function SpanDetailPanel({ span }: { span: Span }) {
  const [activeTab, setActiveTab] = useState<"overview" | "messages" | "raw">("overview");
  const attrs = span.attributes;

  const typeColors: Record<string, string> = {
    crew: "bg-purple-500",
    agent: "bg-blue-500",
    task: "bg-green-500",
    tool: "bg-orange-500",
    llm: "bg-pink-500",
  };

  // Render LLM-specific details
  const renderLLMDetails = () => {
    const messages = attrs.messages as Message[] | undefined;
    const response = attrs.response as string | undefined;
    const model = attrs.model as string | undefined;
    const inputTokens = attrs.input_tokens as number | undefined;
    const outputTokens = attrs.output_tokens as number | undefined;
    const totalTokens = attrs.total_tokens as number | undefined;
    const cost = attrs.cost as number | undefined;
    const temperature = attrs.temperature as number | undefined;
    const maxTokens = attrs.max_tokens as number | undefined;

    return (
      <div className="space-y-4">
        {/* Model Info */}
        <div className="flex flex-wrap gap-2">
          {model && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> {model}
            </Badge>
          )}
          {temperature !== undefined && (
            <Badge variant="outline">temp: {temperature}</Badge>
          )}
          {maxTokens && (
            <Badge variant="outline">max: {maxTokens}</Badge>
          )}
        </div>

        {/* Token Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted rounded p-2">
            <div className="text-muted-foreground text-xs">Input Tokens</div>
            <div className="font-mono font-medium">{inputTokens?.toLocaleString() || "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-muted-foreground text-xs">Output Tokens</div>
            <div className="font-mono font-medium">{outputTokens?.toLocaleString() || "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-muted-foreground text-xs">Total Tokens</div>
            <div className="font-mono font-medium">{totalTokens?.toLocaleString() || "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-muted-foreground text-xs">Cost</div>
            <div className="font-mono font-medium text-green-600">
              {cost ? `$${cost.toFixed(4)}` : "—"}
            </div>
          </div>
        </div>

        {/* Tab buttons for LLM */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setActiveTab("messages")}
            className={`px-3 py-1.5 text-sm ${
              activeTab === "messages"
                ? "border-b-2 border-primary font-medium"
                : "text-muted-foreground"
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab("raw")}
            className={`px-3 py-1.5 text-sm ${
              activeTab === "raw"
                ? "border-b-2 border-primary font-medium"
                : "text-muted-foreground"
            }`}
          >
            Raw JSON
          </button>
        </div>

        {/* Messages Tab */}
        {activeTab === "messages" && (
          <div className="space-y-3">
            {messages && messages.length > 0 ? (
              <>
                <div className="text-xs text-muted-foreground font-medium uppercase">
                  Prompt Messages
                </div>
                <div className="space-y-2">
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No messages captured</div>
            )}

            {response && (
              <>
                <div className="text-xs text-muted-foreground font-medium uppercase mt-4">
                  Response
                </div>
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className="bg-green-100 dark:bg-green-900">
                      assistant
                    </Badge>
                    <CopyButton text={response} />
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {response}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Raw JSON Tab */}
        {activeTab === "raw" && (
          <div className="relative">
            <div className="absolute top-2 right-2">
              <CopyButton text={JSON.stringify(attrs, null, 2)} />
            </div>
            <pre className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto">
              {JSON.stringify(attrs, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  // Render Tool-specific details
  const renderToolDetails = () => {
    const toolName = attrs.tool_name as string | undefined;
    const input = attrs.input as Record<string, unknown> | undefined;
    const output = attrs.output as string | undefined;
    const error = attrs.error as string | undefined;

    return (
      <div className="space-y-4">
        {toolName && (
          <Badge variant="outline" className="flex items-center gap-1 w-fit">
            <Wrench className="h-3 w-3" /> {toolName}
          </Badge>
        )}

        {input && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-muted-foreground font-medium uppercase">Input</div>
              <CopyButton text={JSON.stringify(input, null, 2)} />
            </div>
            <pre className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs font-mono overflow-x-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
        )}

        {output && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-muted-foreground font-medium uppercase">Output</div>
              <CopyButton text={output} />
            </div>
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3 text-sm whitespace-pre-wrap">
              {output}
            </div>
          </div>
        )}

        {error && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-2">Error</div>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Agent-specific details
  const renderAgentDetails = () => {
    const role = attrs.role as string | undefined;
    const goal = attrs.goal as string | undefined;
    const backstory = attrs.backstory as string | undefined;
    const tools = attrs.tools as string[] | undefined;
    const model = attrs.model as string | undefined;
    const allowDelegation = attrs.allow_delegation as boolean | undefined;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {model && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> {model}
            </Badge>
          )}
          {allowDelegation !== undefined && (
            <Badge variant={allowDelegation ? "default" : "secondary"}>
              {allowDelegation ? "Can Delegate" : "No Delegation"}
            </Badge>
          )}
        </div>

        {goal && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Goal</div>
            <div className="text-sm bg-muted rounded p-2">{goal}</div>
          </div>
        )}

        {backstory && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Backstory</div>
            <div className="text-sm bg-muted rounded p-2 text-muted-foreground">{backstory}</div>
          </div>
        )}

        {tools && tools.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-2">Available Tools</div>
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  <Wrench className="h-3 w-3 mr-1" /> {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Task-specific details
  const renderTaskDetails = () => {
    const description = attrs.description as string | undefined;
    const expectedOutput = attrs.expected_output as string | undefined;
    const assignedAgent = attrs.assigned_agent as string | undefined;
    const contextTasks = attrs.context_tasks as string[] | undefined;

    return (
      <div className="space-y-4">
        {assignedAgent && (
          <Badge variant="outline" className="flex items-center gap-1 w-fit">
            <Bot className="h-3 w-3" /> {assignedAgent}
          </Badge>
        )}

        {description && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Description</div>
            <div className="text-sm bg-muted rounded p-2">{description}</div>
          </div>
        )}

        {expectedOutput && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Expected Output</div>
            <div className="text-sm bg-muted rounded p-2 text-muted-foreground">{expectedOutput}</div>
          </div>
        )}

        {contextTasks && contextTasks.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase mb-2">Context From</div>
            <div className="space-y-1">
              {contextTasks.map((t, i) => (
                <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render type-specific content
  const renderTypeContent = () => {
    switch (span.type) {
      case "llm":
        return renderLLMDetails();
      case "tool":
        return renderToolDetails();
      case "agent":
        return renderAgentDetails();
      case "task":
        return renderTaskDetails();
      default:
        return (
          <div className="relative">
            <div className="absolute top-2 right-2">
              <CopyButton text={JSON.stringify(attrs, null, 2)} />
            </div>
            <pre className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto">
              {JSON.stringify(attrs, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <span className={`p-1 rounded ${typeColors[span.type]} text-white`}>
            {span.type === "llm" ? <MessageSquare className="h-4 w-4" /> :
             span.type === "tool" ? <Wrench className="h-4 w-4" /> :
             span.type === "agent" ? <Bot className="h-4 w-4" /> :
             span.type === "task" ? <CheckCircle className="h-4 w-4" /> :
             <Play className="h-4 w-4" />}
          </span>
          {span.name}
        </h3>
        <div className="flex gap-2 mt-2">
          <Badge
            variant={span.status === "error" ? "destructive" : "default"}
          >
            {span.status}
          </Badge>
          <Badge variant="outline">{span.type}</Badge>
        </div>
      </div>

      {/* Timing Info */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted rounded p-2">
          <div className="text-muted-foreground text-xs">Duration</div>
          <div className="font-mono font-medium">
            {span.duration >= 1000
              ? `${(span.duration / 1000).toFixed(2)}s`
              : `${span.duration}ms`}
          </div>
        </div>
        <div className="bg-muted rounded p-2">
          <div className="text-muted-foreground text-xs">Start</div>
          <div className="font-mono text-xs">
            {new Date(span.startTime).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Type-specific content */}
      {renderTypeContent()}
    </div>
  );
}

// Recursive span renderer
function SpanTree({
  spans,
  totalDuration,
  minTime,
  depth,
  expandedSpans,
  toggleSpan,
  selectedSpan,
  setSelectedSpan,
}: {
  spans: Span[];
  totalDuration: number;
  minTime: number;
  depth: number;
  expandedSpans: Set<string>;
  toggleSpan: (id: string) => void;
  selectedSpan: string | null;
  setSelectedSpan: (id: string | null) => void;
}) {
  return (
    <>
      {spans.map((span) => (
        <div key={span.id}>
          <SpanBar
            span={span}
            totalDuration={totalDuration}
            minTime={minTime}
            depth={depth}
            expanded={expandedSpans.has(span.id)}
            onToggle={() => toggleSpan(span.id)}
            onSelect={() => setSelectedSpan(span.id)}
            selected={selectedSpan === span.id}
          />
          {expandedSpans.has(span.id) && span.children.length > 0 && (
            <SpanTree
              spans={span.children}
              totalDuration={totalDuration}
              minTime={minTime}
              depth={depth + 1}
              expandedSpans={expandedSpans}
              toggleSpan={toggleSpan}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function SpanViewPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuthStore();
  const traceId = params.id as string;

  const [spans, setSpans] = useState<Span[]>([]);
  const [spanTree, setSpanTree] = useState<Span[]>([]);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchTraceData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
        const response = await fetch(`${apiUrl}/v1/traces/${traceId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch trace: ${response.status}`);
        }

        const data: TraceDetail = await response.json();

        if (data.events && data.events.length > 0) {
          // Transform API events into spans
          const transformedSpans = transformEventsToSpans(data.events, traceId);
          setSpans(transformedSpans);
          setSpanTree(buildSpanTree(transformedSpans));
          setExpandedSpans(new Set(transformedSpans.map((s) => s.id)));
          setUseMockData(false);
        } else {
          // No events, fall back to mock data for demo purposes
          console.log("No events found, using mock data");
          const mockSpans = generateMockSpans(traceId);
          setSpans(mockSpans);
          setSpanTree(buildSpanTree(mockSpans));
          setExpandedSpans(new Set(mockSpans.map((s) => s.id)));
          setUseMockData(true);
        }
      } catch (err) {
        console.error("Error fetching trace:", err);
        // Fall back to mock data on error
        const mockSpans = generateMockSpans(traceId);
        setSpans(mockSpans);
        setSpanTree(buildSpanTree(mockSpans));
        setExpandedSpans(new Set(mockSpans.map((s) => s.id)));
        setUseMockData(true);
        setError(err instanceof Error ? err.message : "Failed to fetch trace data");
      } finally {
        setLoading(false);
      }
    };

    fetchTraceData();
  }, [token, router, traceId]);

  const toggleSpan = (id: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSpans(new Set(spans.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSpans(new Set());
  };

  // Calculate timeline bounds
  const minTime = Math.min(...spans.map((s) => s.startTime));
  const maxTime = Math.max(...spans.map((s) => s.endTime));
  const totalDuration = maxTime - minTime;

  // Get selected span details
  const selectedSpanData = spans.find((s) => s.id === selectedSpan);

  // Calculate stats
  const stats = {
    totalSpans: spans.length,
    totalDuration: totalDuration,
    errorCount: spans.filter((s) => s.status === "error").length,
    toolCalls: spans.filter((s) => s.type === "tool").length,
    llmCalls: spans.filter((s) => s.type === "llm").length,
    totalTokens: spans
      .filter((s) => s.type === "llm")
      .reduce(
        (acc, s) =>
          acc +
          ((s.attributes.tokens_input as number) || 0) +
          ((s.attributes.tokens_output as number) || 0),
        0
      ),
    totalCost: spans
      .filter((s) => s.type === "llm")
      .reduce((acc, s) => acc + ((s.attributes.cost as number) || 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/traces/${traceId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trace
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Span View</h1>
            <p className="text-muted-foreground">
              Trace: {traceId}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Mock data indicator */}
      {useMockData && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            {error
              ? `Using demo data: ${error}`
              : "No trace events found. Showing demo data for preview."}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.totalSpans}</div>
            <p className="text-xs text-muted-foreground">Total Spans</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {(stats.totalDuration / 1000).toFixed(1)}s
            </div>
            <p className="text-xs text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-500">
              {stats.errorCount}
            </div>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-500">
              {stats.toolCalls}
            </div>
            <p className="text-xs text-muted-foreground">Tool Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-pink-500">
              {stats.llmCalls}
            </div>
            <p className="text-xs text-muted-foreground">LLM Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {stats.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">
              ${stats.totalCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Cost</p>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-500" />
          <span>Crew</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span>Agent</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span>Task</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500" />
          <span>Tool</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-pink-500" />
          <span>LLM</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Waterfall View */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Waterfall Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Timeline header */}
            <div className="flex items-center h-8 border-b bg-muted/50 sticky top-0">
              <div className="min-w-[300px] max-w-[300px] px-2 text-sm font-medium">
                Operation
              </div>
              <div className="flex-1 flex justify-between px-2 text-xs text-muted-foreground">
                <span>0ms</span>
                <span>{(totalDuration / 4).toFixed(0)}ms</span>
                <span>{(totalDuration / 2).toFixed(0)}ms</span>
                <span>{((totalDuration * 3) / 4).toFixed(0)}ms</span>
                <span>{totalDuration.toFixed(0)}ms</span>
              </div>
            </div>

            {/* Spans */}
            <div className="max-h-[500px] overflow-y-auto">
              <TooltipProvider delayDuration={300}>
                <SpanTree
                  spans={spanTree}
                  totalDuration={totalDuration}
                  minTime={minTime}
                  depth={0}
                  expandedSpans={expandedSpans}
                  toggleSpan={toggleSpan}
                  selectedSpan={selectedSpan}
                  setSelectedSpan={setSelectedSpan}
                />
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        {/* Span Details */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Span Details</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            {selectedSpanData ? (
              <SpanDetailPanel span={selectedSpanData} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Click on a span to view details
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
