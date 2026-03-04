"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store";
import { tracesAPI, type MetricsSummary, type TraceSummary } from "@/lib/api";
import { formatNumber, formatDuration, getRelativeTime } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Clock,
  Users,
  Wrench,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!token) return;

      try {
        const [metricsData, tracesData] = await Promise.all([
          tracesAPI.getMetrics(token),
          tracesAPI.list(token, { page_size: "5" }),
        ]);
        setMetrics(metricsData);
        setRecentTraces(tracesData.traces);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your CrewAI agent activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Traces"
          value={formatNumber(metrics?.total_traces || 0)}
          icon={<Activity className="h-4 w-4" />}
          description="All time"
        />
        <StatsCard
          title="Total Events"
          value={formatNumber(metrics?.total_events || 0)}
          icon={<TrendingUp className="h-4 w-4" />}
          description="All time"
        />
        <StatsCard
          title="Errors"
          value={formatNumber(metrics?.total_errors || 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${metrics?.total_events ? ((metrics.total_errors / metrics.total_events) * 100).toFixed(1) : 0}% error rate`}
          variant={metrics?.total_errors ? "destructive" : "default"}
        />
        <StatsCard
          title="Avg Duration"
          value={metrics?.avg_duration_ms ? formatDuration(metrics.avg_duration_ms) : "N/A"}
          icon={<Clock className="h-4 w-4" />}
          description="Per trace"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Tools Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Top Tools
            </CardTitle>
            <CardDescription>Most frequently used tools</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics?.top_tools || []}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Traces */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Traces
            </CardTitle>
            <CardDescription>Latest agent executions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTraces.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No traces yet. Start monitoring your CrewAI agents!
                </p>
              ) : (
                recentTraces.map((trace) => (
                  <div
                    key={trace.trace_id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={trace.status} />
                      <div>
                        <p className="font-medium text-sm">
                          {trace.project_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trace.agent_count} agents • {trace.event_count} events
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {getRelativeTime(trace.started_at)}
                      </p>
                      {trace.duration_ms && (
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(trace.duration_ms)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Active Agents
          </CardTitle>
          <CardDescription>
            {metrics?.active_agents || 0} unique agent roles detected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["Researcher", "Writer", "Editor", "Reviewer", "Publisher"].map(
              (agent) => (
                <Badge key={agent} variant="secondary">
                  {agent}
                </Badge>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  description,
  variant = "default",
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  variant?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={variant === "destructive" ? "text-destructive" : "text-muted-foreground"}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variant === "destructive" ? "text-destructive" : ""}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
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
