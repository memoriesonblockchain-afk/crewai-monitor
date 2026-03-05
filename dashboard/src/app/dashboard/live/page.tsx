"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore, useDashboardStore } from "@/lib/store";
import { tracesAPI, controlAPI, type TraceSummary, type TraceEvent } from "@/lib/api";
import { formatDuration, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Activity,
  Radio,
  Pause,
  Play,
  Bot,
  Wrench,
  MessageSquare,
  AlertTriangle,
  Shield,
  RefreshCw,
  Zap,
  DollarSign,
  Hash,
  Clock,
  Search,
  FileText,
  Database,
} from "lucide-react";

interface LiveEvent {
  id: string;
  type: string;
  agent?: string;
  tool?: string;
  timestamp: Date;
  error?: boolean;
  // Enhanced payload data
  payload?: {
    // LLM data
    model?: string;
    messages?: { role: string; content: string }[];
    response?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost?: number;
    temperature?: number;
    // Tool data
    tool_input?: Record<string, unknown>;
    tool_output?: string;
    duration_ms?: number;
    // Agent data
    goal?: string;
    backstory?: string;
    tools?: string[];
    // Task data
    description?: string;
    expected_output?: string;
    // RAG data
    chunks_retrieved?: number;
    avg_similarity?: number;
    // General
    error_message?: string;
  };
}

export default function LiveViewPage() {
  const token = useAuthStore((state) => state.token);
  const { autoRefresh, setAutoRefresh, refreshInterval } = useDashboardStore();
  const { toast } = useToast();

  const [runningTraces, setRunningTraces] = useState<TraceSummary[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const eventsContainerRef = useRef<HTMLDivElement>(null);

  // Fetch running traces
  useEffect(() => {
    async function fetchRunning() {
      if (!token) return;

      try {
        const data = await tracesAPI.list(token, { status: "running" });
        setRunningTraces(data.traces);

        // Auto-select first running trace
        if (data.traces.length > 0 && !selectedTrace) {
          setSelectedTrace(data.traces[0].trace_id);
        }
      } catch (error) {
        console.error("Failed to fetch running traces:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRunning();

    if (autoRefresh) {
      const interval = setInterval(fetchRunning, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [token, autoRefresh, refreshInterval, selectedTrace]);

  // Simulate live events (in production, this would be WebSocket)
  useEffect(() => {
    if (!autoRefresh || !selectedTrace) return;

    const eventTemplates: Omit<LiveEvent, "id" | "timestamp">[] = [
      // LLM Events
      {
        type: "llm_started",
        agent: "Senior Researcher",
        payload: {
          model: "gpt-4-turbo",
          temperature: 0.7,
          messages: [
            { role: "system", content: "You are an expert AI researcher analyzing multi-agent frameworks..." },
            { role: "user", content: "Compare the architectures of CrewAI, AutoGen, and LangGraph..." }
          ]
        }
      },
      {
        type: "llm_completed",
        agent: "Senior Researcher",
        payload: {
          model: "gpt-4-turbo",
          response: "Based on my analysis, the three frameworks differ primarily in their orchestration approach. CrewAI uses role-based agents with hierarchical processes, AutoGen focuses on conversational multi-agent patterns, and LangGraph provides graph-based state machines for fine-grained control...",
          input_tokens: 850,
          output_tokens: 1250,
          total_tokens: 2100,
          cost: 0.065,
          duration_ms: 4500
        }
      },
      {
        type: "llm_started",
        agent: "Technical Writer",
        payload: {
          model: "gpt-4-turbo",
          temperature: 0.4,
          messages: [
            { role: "system", content: "You are a technical writer creating executive documentation..." },
            { role: "user", content: "Write an executive summary based on the research findings..." }
          ]
        }
      },
      {
        type: "llm_completed",
        agent: "Technical Writer",
        payload: {
          model: "gpt-4-turbo",
          response: "# Executive Summary\n\nThe AI agent framework landscape has matured significantly in 2024. Enterprise adoption increased 340% YoY. Key recommendations: Start with CrewAI for rapid prototyping, evaluate AutoGen for code-heavy workflows, consider LangGraph for production systems.",
          input_tokens: 1200,
          output_tokens: 3200,
          total_tokens: 4400,
          cost: 0.152,
          duration_ms: 8000
        }
      },
      // Tool Events - Web Search
      {
        type: "tool_started",
        agent: "Senior Researcher",
        tool: "web_search",
        payload: {
          tool_input: { query: "AI agent frameworks comparison 2024" }
        }
      },
      {
        type: "tool_finished",
        agent: "Senior Researcher",
        tool: "web_search",
        payload: {
          tool_output: "Found 25 relevant articles:\n1. 'CrewAI vs AutoGen: Complete Comparison' - Medium\n2. 'LangGraph: Building Stateful Agents' - LangChain Blog\n3. 'Top AI Agent Frameworks for Enterprise' - Forbes",
          duration_ms: 2500
        }
      },
      // Tool Events - RAG Query
      {
        type: "tool_started",
        agent: "Senior Researcher",
        tool: "rag_query",
        payload: {
          tool_input: { query: "CrewAI architecture", top_k: 5, index: "ai_docs" }
        }
      },
      {
        type: "tool_finished",
        agent: "Senior Researcher",
        tool: "rag_query",
        payload: {
          tool_output: "Retrieved 5 relevant chunks from knowledge base",
          chunks_retrieved: 5,
          avg_similarity: 0.89,
          duration_ms: 850
        }
      },
      // Tool Events - ArXiv Search
      {
        type: "tool_started",
        agent: "Senior Researcher",
        tool: "arxiv_search",
        payload: {
          tool_input: { query: "multi-agent LLM systems", max_results: 10 }
        }
      },
      {
        type: "tool_finished",
        agent: "Senior Researcher",
        tool: "arxiv_search",
        payload: {
          tool_output: "Found 10 papers:\n1. 'AgentVerse: Facilitating Multi-Agent Collaboration'\n2. 'CAMEL: Communicative Agents'\n3. 'MetaGPT: Meta Programming'",
          duration_ms: 2200
        }
      },
      // Tool Events - GitHub Search
      {
        type: "tool_started",
        agent: "Senior Researcher",
        tool: "github_search",
        payload: {
          tool_input: { query: "AI agent framework", sort: "stars", limit: 5 }
        }
      },
      {
        type: "tool_finished",
        agent: "Senior Researcher",
        tool: "github_search",
        payload: {
          tool_output: "Top repos:\n1. langchain-ai/langchain (★75k)\n2. joaomdmoura/crewAI (★12k)\n3. microsoft/autogen (★18k)",
          duration_ms: 1500
        }
      },
      // Tool Events - Write File
      {
        type: "tool_started",
        agent: "Technical Writer",
        tool: "write_file",
        payload: {
          tool_input: { path: "/output/report.md", content: "[report content]" }
        }
      },
      {
        type: "tool_finished",
        agent: "Technical Writer",
        tool: "write_file",
        payload: {
          tool_output: "Successfully wrote 8,234 bytes to /output/report.md",
          duration_ms: 450
        }
      },
      // Tool Events - Read File
      {
        type: "tool_started",
        agent: "Senior Editor",
        tool: "read_file",
        payload: {
          tool_input: { path: "/output/report.md" }
        }
      },
      {
        type: "tool_finished",
        agent: "Senior Editor",
        tool: "read_file",
        payload: {
          tool_output: "Read 8,234 bytes from /output/report.md",
          duration_ms: 320
        }
      },
      // Agent Events
      {
        type: "agent_started",
        agent: "Senior Researcher",
        payload: {
          goal: "Research and analyze AI agent frameworks comprehensively",
          backstory: "Expert AI researcher with 15 years experience in ML systems",
          tools: ["web_search", "arxiv_search", "github_search", "rag_query"]
        }
      },
      {
        type: "agent_completed",
        agent: "Senior Researcher",
        payload: {
          duration_ms: 23000,
          description: "Research task completed successfully"
        }
      },
      {
        type: "agent_started",
        agent: "Technical Writer",
        payload: {
          goal: "Write comprehensive technical documentation",
          backstory: "Experienced technical writer specializing in AI/ML documentation",
          tools: ["read_file", "write_file", "format_markdown"]
        }
      },
      {
        type: "agent_completed",
        agent: "Technical Writer",
        payload: {
          duration_ms: 13000,
          description: "Documentation task completed"
        }
      },
      {
        type: "agent_started",
        agent: "Senior Editor",
        payload: {
          goal: "Review and polish reports for executive audience",
          backstory: "20 years editing experience at top tech publications",
          tools: ["read_file", "write_file", "grammar_check"]
        }
      },
      {
        type: "agent_completed",
        agent: "Senior Editor",
        payload: {
          duration_ms: 8000,
          description: "Editorial review completed"
        }
      },
      // Task Events
      {
        type: "task_started",
        agent: "Senior Researcher",
        payload: {
          description: "Research AI agent frameworks including CrewAI, AutoGen, LangGraph",
          expected_output: "Comprehensive research report with comparisons"
        }
      },
      {
        type: "task_completed",
        agent: "Senior Researcher",
        payload: {
          description: "Research AI agent frameworks",
          duration_ms: 22000
        }
      },
      // Error Event
      {
        type: "tool_error",
        agent: "Senior Researcher",
        tool: "read_file",
        error: true,
        payload: {
          tool_input: { path: "/data/missing_file.txt" },
          error_message: "FileNotFoundError: No such file or directory: '/data/missing_file.txt'"
        }
      }
    ];

    const interval = setInterval(() => {
      const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
      const newEvent: LiveEvent = {
        id: `evt-${Date.now()}`,
        type: template.type,
        agent: template.agent,
        tool: template.tool,
        timestamp: new Date(),
        error: template.error || false,
        payload: template.payload,
      };

      setLiveEvents((prev) => [newEvent, ...prev].slice(0, 100));
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedTrace]);

  // Auto-scroll to latest events
  useEffect(() => {
    if (eventsContainerRef.current && autoRefresh) {
      eventsContainerRef.current.scrollTop = 0;
    }
  }, [liveEvents, autoRefresh]);

  const handleKillAll = async () => {
    if (!token) return;

    try {
      await controlAPI.clearAll(token);
      toast({
        title: "Kill command sent",
        description: "All agents will be stopped.",
      });
    } catch (error) {
      toast({
        title: "Failed to kill agents",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Radio className="h-8 w-8" />
            Live View
            {autoRefresh && (
              <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            )}
          </h1>
          <p className="text-muted-foreground">
            Real-time monitoring of your running agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </>
            )}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleKillAll}>
            <Shield className="h-4 w-4 mr-2" />
            Kill All
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Running Traces */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Running Traces</CardTitle>
            <CardDescription>
              {runningTraces.length} active {runningTraces.length === 1 ? "trace" : "traces"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : runningTraces.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No running traces</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runningTraces.map((trace) => (
                  <button
                    key={trace.trace_id}
                    onClick={() => setSelectedTrace(trace.trace_id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors",
                      selectedTrace === trace.trace_id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="font-medium">{trace.project_name}</span>
                      </div>
                      <Badge variant="secondary">{trace.agent_count}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {trace.event_count} events
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Event Stream */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Event Stream
              {autoRefresh && (
                <span className="text-xs font-normal text-muted-foreground">
                  (updating every 2s)
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Live events from {selectedTrace ? "selected trace" : "all traces"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={eventsContainerRef}
              className="h-[500px] overflow-y-auto space-y-2"
            >
              {liveEvents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Waiting for events...</p>
                    {!autoRefresh && (
                      <p className="text-sm mt-1">
                        Click Resume to start monitoring
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <TooltipProvider delayDuration={300}>
                  {liveEvents.map((event) => (
                    <LiveEventCard key={event.id} event={event} />
                  ))}
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Active Agents</CardTitle>
          <CardDescription>
            Real-time status of all agents in running traces
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {["Researcher", "Writer", "Editor", "Reviewer", "Publisher"].map(
              (agent) => (
                <AgentStatusCard
                  key={agent}
                  name={agent}
                  status={Math.random() > 0.3 ? "active" : "idle"}
                  lastAction={
                    Math.random() > 0.5 ? "search_web" : "write_file"
                  }
                />
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Get tooltip preview content based on event type
function getEventTooltipPreview(event: LiveEvent): React.ReactNode {
  const payload = event.payload;
  if (!payload) return null;

  // LLM Events
  if (event.type === "llm_started" || event.type === "llm_completed") {
    return (
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {payload.model && (
            <Badge variant="outline" className="text-[10px]">
              <Zap className="h-2 w-2 mr-1" />
              {payload.model}
            </Badge>
          )}
          {payload.temperature !== undefined && (
            <span>temp: {payload.temperature}</span>
          )}
        </div>

        {payload.messages && payload.messages.length > 0 && (
          <div className="border-l-2 border-blue-500 pl-2">
            <div className="text-[10px] text-muted-foreground uppercase">Prompt</div>
            <div className="text-xs line-clamp-2">
              {payload.messages[payload.messages.length - 1]?.content?.slice(0, 150)}...
            </div>
          </div>
        )}

        {payload.response && (
          <div className="border-l-2 border-green-500 pl-2">
            <div className="text-[10px] text-muted-foreground uppercase">Response</div>
            <div className="text-xs line-clamp-2">{payload.response.slice(0, 150)}...</div>
          </div>
        )}

        {(payload.input_tokens || payload.output_tokens || payload.cost) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
            {payload.input_tokens && (
              <span><Hash className="h-3 w-3 inline" /> {payload.input_tokens} in</span>
            )}
            {payload.output_tokens && (
              <span><Hash className="h-3 w-3 inline" /> {payload.output_tokens} out</span>
            )}
            {payload.cost && (
              <span className="text-green-600">
                <DollarSign className="h-3 w-3 inline" /> ${payload.cost.toFixed(3)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Tool Events
  if (event.type.startsWith("tool_")) {
    const toolIcon = getToolIcon(event.tool);
    return (
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center gap-2">
          {toolIcon}
          <Badge variant="outline" className="text-[10px]">{event.tool}</Badge>
          {payload.duration_ms && (
            <span className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline" /> {payload.duration_ms}ms
            </span>
          )}
        </div>

        {payload.tool_input && (
          <div className="border-l-2 border-orange-500 pl-2">
            <div className="text-[10px] text-muted-foreground uppercase">Input</div>
            <div className="text-xs font-mono line-clamp-2">
              {JSON.stringify(payload.tool_input).slice(0, 100)}
            </div>
          </div>
        )}

        {payload.tool_output && (
          <div className="border-l-2 border-green-500 pl-2">
            <div className="text-[10px] text-muted-foreground uppercase">Output</div>
            <div className="text-xs line-clamp-2">{payload.tool_output.slice(0, 150)}</div>
          </div>
        )}

        {payload.error_message && (
          <div className="border-l-2 border-red-500 pl-2">
            <div className="text-[10px] text-muted-foreground uppercase">Error</div>
            <div className="text-xs text-red-500 line-clamp-2">{payload.error_message}</div>
          </div>
        )}

        {/* RAG-specific data */}
        {payload.chunks_retrieved && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
            <span><Database className="h-3 w-3 inline" /> {payload.chunks_retrieved} chunks</span>
            {payload.avg_similarity && (
              <span>similarity: {(payload.avg_similarity * 100).toFixed(0)}%</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Agent Events
  if (event.type.startsWith("agent_")) {
    return (
      <div className="space-y-2 max-w-sm">
        <div className="font-medium">{event.agent}</div>

        {payload.goal && (
          <div className="text-xs text-muted-foreground line-clamp-2">{payload.goal}</div>
        )}

        {payload.tools && payload.tools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {payload.tools.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
            ))}
            {payload.tools.length > 4 && (
              <Badge variant="outline" className="text-[10px]">+{payload.tools.length - 4}</Badge>
            )}
          </div>
        )}

        {payload.duration_ms && (
          <div className="text-xs text-muted-foreground pt-1 border-t">
            <Clock className="h-3 w-3 inline mr-1" />
            Duration: {(payload.duration_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  // Task Events
  if (event.type.startsWith("task_")) {
    return (
      <div className="space-y-2 max-w-sm">
        {payload.description && (
          <div className="text-xs line-clamp-3">{payload.description}</div>
        )}

        {payload.expected_output && (
          <div className="text-[10px] text-muted-foreground">
            Expected: {payload.expected_output.slice(0, 80)}...
          </div>
        )}

        {payload.duration_ms && (
          <div className="text-xs text-muted-foreground pt-1 border-t">
            <Clock className="h-3 w-3 inline mr-1" />
            Duration: {(payload.duration_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  return null;
}

// Get tool-specific icon
function getToolIcon(tool?: string): React.ReactNode {
  if (!tool) return <Wrench className="h-3 w-3" />;

  const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search className="h-3 w-3 text-blue-500" />,
    arxiv_search: <FileText className="h-3 w-3 text-purple-500" />,
    github_search: <Search className="h-3 w-3 text-gray-500" />,
    rag_query: <Database className="h-3 w-3 text-green-500" />,
    read_file: <FileText className="h-3 w-3 text-yellow-500" />,
    write_file: <FileText className="h-3 w-3 text-orange-500" />,
  };

  return toolIcons[tool] || <Wrench className="h-3 w-3" />;
}

function LiveEventCard({ event }: { event: LiveEvent }) {
  const icons: Record<string, React.ReactNode> = {
    tool_started: <Wrench className="h-4 w-4 text-blue-500" />,
    tool_finished: <Wrench className="h-4 w-4 text-green-500" />,
    tool_error: <Wrench className="h-4 w-4 text-red-500" />,
    llm_started: <MessageSquare className="h-4 w-4 text-purple-500" />,
    llm_completed: <MessageSquare className="h-4 w-4 text-green-500" />,
    agent_started: <Bot className="h-4 w-4 text-blue-500" />,
    agent_completed: <Bot className="h-4 w-4 text-green-500" />,
    agent_error: <Bot className="h-4 w-4 text-red-500" />,
    task_started: <Activity className="h-4 w-4 text-blue-500" />,
    task_completed: <Activity className="h-4 w-4 text-green-500" />,
  };

  // Quick stats for inline display
  const quickStats: string[] = [];
  if (event.payload) {
    if (event.payload.total_tokens) {
      quickStats.push(`${event.payload.total_tokens} tokens`);
    }
    if (event.payload.cost) {
      quickStats.push(`$${event.payload.cost.toFixed(2)}`);
    }
    if (event.payload.duration_ms && event.type.endsWith("_completed")) {
      quickStats.push(`${(event.payload.duration_ms / 1000).toFixed(1)}s`);
    }
    if (event.payload.chunks_retrieved) {
      quickStats.push(`${event.payload.chunks_retrieved} chunks`);
    }
  }

  const tooltipContent = getEventTooltipPreview(event);

  const cardContent = (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border animate-in slide-in-from-top-2 cursor-pointer hover:bg-muted/50 transition-colors",
        event.error && "border-destructive bg-destructive/5"
      )}
    >
      {icons[event.type] || <Activity className="h-4 w-4" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {event.type.replace(/_/g, " ")}
          {event.agent && (
            <span className="text-muted-foreground font-normal">
              {" "}
              — {event.agent}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {event.tool && (
            <p className="text-xs text-muted-foreground">Tool: {event.tool}</p>
          )}
          {quickStats.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {quickStats.join(" • ")}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {event.timestamp.toLocaleTimeString()}
      </span>
      {event.error && <AlertTriangle className="h-4 w-4 text-destructive" />}
    </div>
  );

  // Wrap with tooltip if we have preview content
  if (tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {cardContent}
        </TooltipTrigger>
        <TooltipContent side="left" className="p-3">
          <div className="text-sm font-medium mb-2">
            {event.type.replace(/_/g, " ")}
            {event.agent && ` — ${event.agent}`}
          </div>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
}

function AgentStatusCard({
  name,
  status,
  lastAction,
}: {
  name: string;
  status: "active" | "idle" | "error";
  lastAction: string;
}) {
  const statusColors = {
    active: "bg-green-500",
    idle: "bg-gray-400",
    error: "bg-red-500",
  };

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("w-2 h-2 rounded-full", statusColors[status])} />
        <span className="font-medium">{name}</span>
      </div>
      <p className="text-xs text-muted-foreground capitalize">{status}</p>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        Last: {lastAction}
      </p>
    </div>
  );
}
