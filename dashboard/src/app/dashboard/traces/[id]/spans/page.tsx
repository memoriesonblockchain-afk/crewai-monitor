"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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

// Mock data generator for realistic spans
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
        goal: "Find comprehensive information about AI trends",
        model: "gpt-4",
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
        description: "Research the latest AI trends and compile findings",
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
        input: { query: "AI trends 2024" },
        output: "Found 15 relevant articles...",
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
        model: "gpt-4",
        tokens_input: 2450,
        tokens_output: 890,
        cost: 0.12,
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
        input: { query: "generative AI applications" },
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
        input: { path: "/data/report.txt" },
        error: "File not found",
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
        model: "gpt-4",
        tokens_input: 3200,
        tokens_output: 1250,
        cost: 0.18,
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
        goal: "Write a comprehensive report",
        model: "gpt-4",
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
        description: "Write a detailed report based on research findings",
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
        model: "gpt-4",
        tokens_input: 4500,
        tokens_output: 2800,
        cost: 0.32,
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
        input: { path: "/output/report.md" },
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
        model: "gpt-4",
        tokens_input: 1800,
        tokens_output: 650,
        cost: 0.09,
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
        goal: "Review and polish the report",
        model: "gpt-4",
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
        description: "Review and edit the report for clarity",
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
        model: "gpt-4",
        tokens_input: 3500,
        tokens_output: 450,
        cost: 0.08,
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

  return (
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

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    // Load mock spans
    const mockSpans = generateMockSpans(traceId);
    setSpans(mockSpans);
    setSpanTree(buildSpanTree(mockSpans));

    // Expand all by default
    setExpandedSpans(new Set(mockSpans.map((s) => s.id)));
    setLoading(false);
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
            </div>
          </CardContent>
        </Card>

        {/* Span Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Span Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedSpanData ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">{selectedSpanData.name}</h3>
                  <div className="flex gap-2 mt-2">
                    <Badge
                      variant={
                        selectedSpanData.status === "error"
                          ? "destructive"
                          : "default"
                      }
                    >
                      {selectedSpanData.status}
                    </Badge>
                    <Badge variant="outline">{selectedSpanData.type}</Badge>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-mono">
                      {selectedSpanData.duration >= 1000
                        ? `${(selectedSpanData.duration / 1000).toFixed(2)}s`
                        : `${selectedSpanData.duration}ms`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Time</span>
                    <span className="font-mono text-xs">
                      {new Date(selectedSpanData.startTime).toISOString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Time</span>
                    <span className="font-mono text-xs">
                      {new Date(selectedSpanData.endTime).toISOString()}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Attributes</h4>
                  <div className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto">
                    <pre>
                      {JSON.stringify(selectedSpanData.attributes, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
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
