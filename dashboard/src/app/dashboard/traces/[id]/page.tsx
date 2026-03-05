"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { tracesAPI, controlAPI, type TraceDetail, type TraceEvent } from "@/lib/api";
import { formatDateTime, formatDuration, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Activity,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Wrench,
  Bot,
  MessageSquare,
  CheckCircle,
  XCircle,
  Shield,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

// Demo trace configurations
const demoTraceConfigs: Record<string, { name: string; status: string; agents: string[]; tools: string[] }> = {
  "trace-demo-research-001": {
    name: "AI Research Crew",
    status: "completed",
    agents: ["Senior Researcher", "Technical Writer", "Senior Editor"],
    tools: ["web_search", "arxiv_search", "rag_query", "write_file"],
  },
  "trace-demo-content-002": {
    name: "Content Generation Crew",
    status: "completed",
    agents: ["Content Strategist", "Copywriter"],
    tools: ["web_search", "write_file", "seo_analyzer"],
  },
  "trace-demo-analysis-003": {
    name: "Data Analysis Crew",
    status: "running",
    agents: ["Data Analyst", "Statistician", "Visualizer", "Report Writer"],
    tools: ["sql_query", "python_exec", "chart_generator", "export_csv"],
  },
  "trace-demo-support-004": {
    name: "Customer Support Crew",
    status: "completed",
    agents: ["Support Agent", "Escalation Manager", "Knowledge Base Expert"],
    tools: ["ticket_search", "knowledge_lookup", "send_email"],
  },
  "trace-demo-code-005": {
    name: "Code Review Crew",
    status: "failed",
    agents: ["Code Reviewer", "Security Analyst"],
    tools: ["git_diff", "lint_code", "security_scan"],
  },
  "trace-demo-marketing-006": {
    name: "Marketing Analysis Crew",
    status: "completed",
    agents: ["Market Analyst", "Competitor Researcher", "Strategy Lead", "Report Writer"],
    tools: ["market_data", "social_analytics", "competitor_analysis", "report_generator"],
  },
};

// Generate demo trace detail with events
function generateDemoTrace(traceId: string): TraceDetail | null {
  const config = demoTraceConfigs[traceId];
  if (!config) return null;

  const now = new Date();
  const startTime = new Date(now.getTime() - 300000); // 5 min ago
  let eventTime = startTime.getTime();

  const events: TraceEvent[] = [];
  let eventCounter = 1;

  const addEvent = (type: string, agent?: string, tool?: string, duration?: number, error?: boolean, errorMsg?: string) => {
    events.push({
      event_id: `evt-demo-${eventCounter++}`,
      trace_id: traceId,
      event_type: type,
      timestamp: new Date(eventTime).toISOString(),
      agent_role: agent || null,
      tool_name: tool || null,
      duration_ms: duration || null,
      error: error || false,
      error_message: errorMsg || null,
    });
    eventTime += Math.random() * 5000 + 1000; // 1-6 seconds between events
  };

  // Crew started
  addEvent("crew_started");

  // Generate events for each agent
  config.agents.forEach((agent, agentIdx) => {
    addEvent("agent_started", agent);

    // Each agent does some work
    const agentTools = config.tools.slice(agentIdx % config.tools.length, (agentIdx % config.tools.length) + 2);
    agentTools.forEach(tool => {
      addEvent("tool_started", agent, tool);
      if (config.status === "failed" && tool === "security_scan") {
        addEvent("tool_error", agent, tool, 1500, true, "Security vulnerability detected: SQL injection risk in user input handling");
      } else {
        addEvent("tool_finished", agent, tool, Math.floor(Math.random() * 3000) + 500);
      }
    });

    // LLM call
    addEvent("llm_started", agent);
    addEvent("llm_completed", agent, undefined, Math.floor(Math.random() * 5000) + 2000);

    // Agent completion
    if (config.status === "failed" && agentIdx === config.agents.length - 1) {
      addEvent("agent_error", agent, undefined, undefined, true, "Agent failed due to upstream tool error");
    } else {
      addEvent("agent_completed", agent, undefined, Math.floor(Math.random() * 20000) + 10000);
    }
  });

  // Crew completion
  if (config.status === "failed") {
    addEvent("crew_failed", undefined, undefined, undefined, true, "Crew execution failed");
  } else if (config.status === "completed") {
    addEvent("crew_completed", undefined, undefined, 180000);
  }
  // Running traces don't have completion event

  return {
    trace_id: traceId,
    project_name: config.name,
    environment: "production",
    started_at: startTime.toISOString(),
    ended_at: config.status === "running" ? null : new Date(eventTime).toISOString(),
    status: config.status,
    events,
    agents: config.agents,
    tools_used: config.tools,
    error_count: config.status === "failed" ? 3 : config.name.includes("Content") ? 1 : 0,
  };
}

const eventIcons: Record<string, React.ReactNode> = {
  crew_started: <Activity className="h-4 w-4" />,
  crew_completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  crew_failed: <XCircle className="h-4 w-4 text-red-500" />,
  agent_started: <Bot className="h-4 w-4" />,
  agent_completed: <Bot className="h-4 w-4 text-green-500" />,
  agent_error: <Bot className="h-4 w-4 text-red-500" />,
  tool_started: <Wrench className="h-4 w-4" />,
  tool_finished: <Wrench className="h-4 w-4 text-green-500" />,
  tool_error: <Wrench className="h-4 w-4 text-red-500" />,
  llm_started: <MessageSquare className="h-4 w-4" />,
  llm_completed: <MessageSquare className="h-4 w-4 text-green-500" />,
  llm_failed: <MessageSquare className="h-4 w-4 text-red-500" />,
  task_started: <Activity className="h-4 w-4" />,
  task_completed: <Activity className="h-4 w-4 text-green-500" />,
  task_failed: <Activity className="h-4 w-4 text-red-500" />,
};

export default function TraceDetailPage() {
  const params = useParams();
  const traceId = params.id as string;
  const token = useAuthStore((state) => state.token);
  const { toast } = useToast();

  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [killingAgent, setKillingAgent] = useState<string | null>(null);
  const [useDemoData, setUseDemoData] = useState(false);

  useEffect(() => {
    async function fetchTrace() {
      if (!token || !traceId) return;

      // Check if this is a demo trace ID
      if (traceId.startsWith("trace-demo-")) {
        const demoTrace = generateDemoTrace(traceId);
        if (demoTrace) {
          setTrace(demoTrace);
          setUseDemoData(true);
          setLoading(false);
          return;
        }
      }

      try {
        const data = await tracesAPI.get(token, traceId);
        setTrace(data);
        setUseDemoData(false);
      } catch (error) {
        console.error("Failed to fetch trace:", error);
        // Try demo data as fallback
        const demoTrace = generateDemoTrace(traceId);
        if (demoTrace) {
          setTrace(demoTrace);
          setUseDemoData(true);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
    // Only poll for real traces
    if (!traceId.startsWith("trace-demo-")) {
      const interval = setInterval(fetchTrace, 5000);
      return () => clearInterval(interval);
    }
  }, [token, traceId]);

  const handleKillAgent = async (agentRole: string) => {
    if (!token) return;
    setKillingAgent(agentRole);

    try {
      await controlAPI.kill(token, agentRole, traceId);
      toast({
        title: "Kill command sent",
        description: `Agent "${agentRole}" will be stopped.`,
      });
    } catch (error) {
      toast({
        title: "Failed to kill agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setKillingAgent(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Trace not found</p>
        <Link href="/dashboard/traces">
          <Button variant="link">Back to traces</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Demo mode indicator */}
      {useDemoData && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            Demo mode: Showing sample trace data for preview.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/traces">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{trace.project_name}</h1>
            <StatusBadge status={trace.status} />
          </div>
          <p className="text-muted-foreground">
            <code className="text-sm">{trace.trace_id}</code>
          </p>
        </div>
        <Link href={`/dashboard/traces/${traceId}/spans`}>
          <Button variant="outline" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Span View
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Started</span>
            </div>
            <p className="font-medium">{formatDateTime(trace.started_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Bot className="h-4 w-4" />
              <span className="text-sm">Agents</span>
            </div>
            <p className="font-medium">{trace.agents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Events</span>
            </div>
            <p className="font-medium">{trace.events.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Errors</span>
            </div>
            <p className={cn("font-medium", trace.error_count > 0 && "text-destructive")}>
              {trace.error_count}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Event Timeline</CardTitle>
            <CardDescription>
              Chronological view of all events in this trace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trace.events.map((event, index) => (
                <EventRow key={event.event_id} event={event} index={index} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Agents & Kill Switch */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Kill Switch
              </CardTitle>
              <CardDescription>
                Stop agents immediately
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {trace.agents.map((agent) => (
                <div
                  key={agent}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{agent}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={killingAgent === agent || trace.status !== "running"}
                    onClick={() => handleKillAgent(agent)}
                  >
                    {killingAgent === agent ? "Killing..." : "Kill"}
                  </Button>
                </div>
              ))}
              {trace.agents.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No agents detected
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Tools Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {trace.tools_used.map((tool) => (
                  <Badge key={tool} variant="secondary">
                    {tool}
                  </Badge>
                ))}
                {trace.tools_used.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No tools used yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, index }: { event: TraceEvent; index: number }) {
  const icon = eventIcons[event.event_type] || <Activity className="h-4 w-4" />;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center border",
            event.error ? "border-destructive bg-destructive/10" : "border-border bg-muted"
          )}
        >
          {icon}
        </div>
        {index < 999 && <div className="w-px h-full bg-border flex-1 min-h-4" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {event.event_type.replace(/_/g, " ")}
              {event.agent_role && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  — {event.agent_role}
                </span>
              )}
            </p>
            {event.tool_name && (
              <p className="text-sm text-muted-foreground">
                Tool: {event.tool_name}
              </p>
            )}
            {event.error_message && (
              <p className="text-sm text-destructive mt-1">
                {event.error_message}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{new Date(event.timestamp).toLocaleTimeString()}</p>
            {event.duration_ms && <p>{formatDuration(event.duration_ms)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
    running: "warning",
    completed: "success",
    failed: "destructive",
  };

  return (
    <Badge variant={variants[status] || "secondary"}>
      {status === "running" && (
        <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5 animate-pulse" />
      )}
      {status}
    </Badge>
  );
}
