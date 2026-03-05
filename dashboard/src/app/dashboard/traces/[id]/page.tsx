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

  useEffect(() => {
    async function fetchTrace() {
      if (!token || !traceId) return;

      try {
        const data = await tracesAPI.get(token, traceId);
        setTrace(data);
      } catch (error) {
        console.error("Failed to fetch trace:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
    const interval = setInterval(fetchTrace, 5000);
    return () => clearInterval(interval);
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
