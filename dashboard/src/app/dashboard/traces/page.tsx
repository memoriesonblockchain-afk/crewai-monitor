"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/store";
import { tracesAPI, type TraceSummary } from "@/lib/api";
import { formatDuration, getRelativeTime } from "@/lib/utils";
import {
  Activity,
  Search,
  Filter,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

// Generate demo traces for showcase when no real traces exist
function generateDemoTraces(): TraceSummary[] {
  const now = new Date();
  return [
    {
      trace_id: "trace-demo-research-001",
      project_name: "AI Research Crew",
      environment: "production",
      started_at: new Date(now.getTime() - 5 * 60000).toISOString(), // 5 min ago
      ended_at: new Date(now.getTime() - 2 * 60000).toISOString(),
      status: "completed",
      event_count: 34,
      agent_count: 3,
      error_count: 0,
      duration_ms: 180000,
    },
    {
      trace_id: "trace-demo-content-002",
      project_name: "Content Generation Crew",
      environment: "production",
      started_at: new Date(now.getTime() - 15 * 60000).toISOString(),
      ended_at: new Date(now.getTime() - 8 * 60000).toISOString(),
      status: "completed",
      event_count: 28,
      agent_count: 2,
      error_count: 1,
      duration_ms: 420000,
    },
    {
      trace_id: "trace-demo-analysis-003",
      project_name: "Data Analysis Crew",
      environment: "staging",
      started_at: new Date(now.getTime() - 2 * 60000).toISOString(),
      ended_at: null,
      status: "running",
      event_count: 12,
      agent_count: 4,
      error_count: 0,
      duration_ms: null,
    },
    {
      trace_id: "trace-demo-support-004",
      project_name: "Customer Support Crew",
      environment: "production",
      started_at: new Date(now.getTime() - 30 * 60000).toISOString(),
      ended_at: new Date(now.getTime() - 25 * 60000).toISOString(),
      status: "completed",
      event_count: 45,
      agent_count: 3,
      error_count: 0,
      duration_ms: 300000,
    },
    {
      trace_id: "trace-demo-code-005",
      project_name: "Code Review Crew",
      environment: "development",
      started_at: new Date(now.getTime() - 60 * 60000).toISOString(),
      ended_at: new Date(now.getTime() - 58 * 60000).toISOString(),
      status: "failed",
      event_count: 18,
      agent_count: 2,
      error_count: 3,
      duration_ms: 120000,
    },
    {
      trace_id: "trace-demo-marketing-006",
      project_name: "Marketing Analysis Crew",
      environment: "production",
      started_at: new Date(now.getTime() - 120 * 60000).toISOString(),
      ended_at: new Date(now.getTime() - 110 * 60000).toISOString(),
      status: "completed",
      event_count: 52,
      agent_count: 4,
      error_count: 0,
      duration_ms: 600000,
    },
  ];
}

export default function TracesPage() {
  const token = useAuthStore((state) => state.token);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [useDemoData, setUseDemoData] = useState(false);

  const fetchTraces = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page_size: "50" };
      if (statusFilter) params.status = statusFilter;
      const data = await tracesAPI.list(token, params);

      if (data.traces.length === 0 && !statusFilter) {
        // No traces found, use demo data
        setTraces(generateDemoTraces());
        setUseDemoData(true);
      } else {
        setTraces(data.traces);
        setUseDemoData(false);
      }
    } catch (error) {
      console.error("Failed to fetch traces:", error);
      // On error, show demo data
      setTraces(generateDemoTraces());
      setUseDemoData(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, [token, statusFilter]);

  // Filter demo traces by status if needed
  let displayTraces = traces;
  if (useDemoData && statusFilter) {
    displayTraces = traces.filter(t => t.status === statusFilter);
  }

  const filteredTraces = displayTraces.filter((trace) =>
    search
      ? trace.project_name.toLowerCase().includes(search.toLowerCase()) ||
        trace.trace_id.includes(search)
      : true
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Traces</h1>
          <p className="text-muted-foreground">
            View and analyze your agent execution traces
          </p>
        </div>
        <Button onClick={fetchTraces} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Demo mode indicator */}
      {useDemoData && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            Demo mode: Showing sample traces. Ingest real events with the SDK to see your data.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by project or trace ID..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(null)}
          >
            All
          </Button>
          <Button
            variant={statusFilter === "running" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("running")}
          >
            Running
          </Button>
          <Button
            variant={statusFilter === "completed" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </Button>
          <Button
            variant={statusFilter === "failed" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("failed")}
          >
            Failed
          </Button>
        </div>
      </div>

      {/* Traces List */}
      <Card>
        <CardHeader>
          <CardTitle>All Traces</CardTitle>
          <CardDescription>
            {filteredTraces.length} traces found
            {useDemoData && " (demo data)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTraces.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No traces found</p>
              <p className="text-sm">
                Start monitoring your CrewAI agents to see traces here
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTraces.map((trace) => (
                <Link
                  key={trace.trace_id}
                  href={`/dashboard/traces/${trace.trace_id}`}
                  className="flex items-center justify-between py-4 hover:bg-muted/50 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <StatusBadge status={trace.status} />
                    <div>
                      <p className="font-medium">{trace.project_name}</p>
                      <p className="text-sm text-muted-foreground">
                        <code className="text-xs">{trace.trace_id.slice(0, 8)}...</code>
                        {" • "}
                        {trace.environment}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm">
                        {trace.agent_count} agents • {trace.event_count} events
                      </p>
                      {trace.error_count > 0 && (
                        <p className="text-sm text-destructive">
                          {trace.error_count} errors
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground w-24">
                      <p>{getRelativeTime(trace.started_at)}</p>
                      {trace.duration_ms && (
                        <p>{formatDuration(trace.duration_ms)}</p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
    <Badge variant={variants[status] || "secondary"} className="w-24 justify-center">
      {status === "running" && (
        <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5 animate-pulse" />
      )}
      {status}
    </Badge>
  );
}
