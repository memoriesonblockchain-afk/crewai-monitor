"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

interface LiveEvent {
  id: string;
  type: string;
  agent?: string;
  tool?: string;
  timestamp: Date;
  error?: boolean;
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

    const eventTypes = [
      { type: "tool_started", agent: "Researcher", tool: "search_web" },
      { type: "llm_started", agent: "Writer" },
      { type: "tool_finished", agent: "Researcher", tool: "search_web" },
      { type: "agent_completed", agent: "Editor" },
      { type: "tool_started", agent: "Publisher", tool: "write_file" },
    ];

    const interval = setInterval(() => {
      const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const newEvent: LiveEvent = {
        id: `evt-${Date.now()}`,
        type: randomEvent.type,
        agent: randomEvent.agent,
        tool: randomEvent.tool,
        timestamp: new Date(),
        error: Math.random() > 0.95, // 5% chance of error
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
                liveEvents.map((event) => (
                  <LiveEventCard key={event.id} event={event} />
                ))
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
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border animate-in slide-in-from-top-2",
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
        {event.tool && (
          <p className="text-xs text-muted-foreground">Tool: {event.tool}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {event.timestamp.toLocaleTimeString()}
      </span>
      {event.error && <AlertTriangle className="h-4 w-4 text-destructive" />}
    </div>
  );
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
