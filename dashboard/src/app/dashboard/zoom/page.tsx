"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  EdgeMarker,
} from "reactflow";
import { motion, AnimatePresence } from "framer-motion";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/lib/store";
import { tracesAPI, type TraceSummary, type TraceEvent } from "@/lib/api";
import {
  Bot,
  Zap,
  MessageSquare,
  Wrench,
  Brain,
  RefreshCw,
  Play,
  Pause,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

// Types for visualization
interface VisualEvent {
  id: string;
  timestamp: Date;
  type: string;
  agentId: string;
  agentName: string;
  toolName?: string;
  data: {
    content?: string;
    model?: string;
    tokens?: number;
    duration?: number;
    error?: boolean;
  };
}

interface EventBubble {
  id: string;
  event: VisualEvent;
  exiting: boolean;
}

interface AgentStats {
  llmCalls: number;
  toolCalls: number;
  errors: number;
}

// Custom Agent Node Component
function AgentNode({ data }: NodeProps) {
  const isActive = data.isActive;
  const hasError = data.hasError;

  return (
    <motion.div
      className={`relative px-6 py-4 rounded-xl border-2 shadow-lg min-w-[180px] transition-all duration-300 ${
        isActive
          ? "bg-blue-500/20 border-blue-500 shadow-blue-500/50 shadow-xl"
          : hasError
          ? "bg-red-500/10 border-red-400"
          : "bg-card border-border"
      }`}
      animate={{
        scale: isActive ? 1.05 : 1,
        boxShadow: isActive
          ? "0 0 30px rgba(59, 130, 246, 0.5)"
          : "0 4px 6px rgba(0, 0, 0, 0.1)",
      }}
      transition={{ duration: 0.3 }}
    >
      {isActive && (
        <motion.div
          className="absolute -inset-2 rounded-xl border-2 border-blue-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <Handle type="target" position={Position.Left} className="!bg-primary !w-3 !h-3" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" id="right" />

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isActive ? "bg-blue-500 text-white" : hasError ? "bg-red-500 text-white" : "bg-muted"}`}>
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold text-sm">{data.label}</p>
          <p className="text-xs text-muted-foreground">Agent</p>
        </div>
      </div>

      {data.currentAction && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 pt-3 border-t border-border"
        >
          <div className="flex items-center gap-2 text-xs">
            {data.currentAction.type === "llm" && <Brain className="h-3 w-3 text-purple-500" />}
            {data.currentAction.type === "tool" && <Wrench className="h-3 w-3 text-orange-500" />}
            {data.currentAction.type === "error" && <XCircle className="h-3 w-3 text-red-500" />}
            <span className="truncate max-w-[120px]">{data.currentAction.label}</span>
          </div>
        </motion.div>
      )}

      <div className="flex gap-1 mt-2">
        {data.stats?.llmCalls > 0 && (
          <Badge variant="secondary" className="text-xs py-0 px-1.5">
            <Brain className="h-2.5 w-2.5 mr-0.5" />
            {data.stats.llmCalls}
          </Badge>
        )}
        {data.stats?.toolCalls > 0 && (
          <Badge variant="secondary" className="text-xs py-0 px-1.5">
            <Wrench className="h-2.5 w-2.5 mr-0.5" />
            {data.stats.toolCalls}
          </Badge>
        )}
        {data.stats?.errors > 0 && (
          <Badge variant="destructive" className="text-xs py-0 px-1.5">
            <XCircle className="h-2.5 w-2.5 mr-0.5" />
            {data.stats.errors}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

// Custom Tool Node Component
function ToolNode({ data }: NodeProps) {
  const isActive = data.isActive;

  return (
    <motion.div
      className={`relative px-4 py-3 rounded-lg border-2 min-w-[140px] ${
        isActive
          ? "bg-orange-500/20 border-orange-500"
          : "bg-card border-border"
      }`}
      animate={{ scale: isActive ? 1.05 : 1 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-2 !h-2" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-orange-500 !w-2 !h-2" id="right" />

      <div className="flex items-center gap-2">
        <Wrench className={`h-4 w-4 ${isActive ? "text-orange-500" : "text-muted-foreground"}`} />
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.callCount > 0 && (
        <p className="text-xs text-muted-foreground mt-1">{data.callCount} calls</p>
      )}
    </motion.div>
  );
}

// Custom Task/Crew Node Component
function CrewNode({ data }: NodeProps) {
  return (
    <div className={`relative px-5 py-3 rounded-lg border-2 min-w-[200px] ${
      data.status === "completed" ? "bg-green-500/10 border-green-500" :
      data.status === "failed" ? "bg-red-500/10 border-red-500" :
      data.status === "running" ? "bg-amber-500/10 border-amber-500" :
      "bg-muted/50 border-border"
    }`}>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3" />

      <div className="flex items-center gap-2">
        {data.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
        {data.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
        {data.status === "running" && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
        {!data.status && <Zap className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-semibold">{data.label}</span>
      </div>
      {data.environment && (
        <Badge variant="outline" className="mt-1 text-xs">{data.environment}</Badge>
      )}
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  crew: CrewNode,
};

// Helper to create a slug ID from a name
function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Layout helper - arrange nodes in a grid
function layoutNodes(
  agents: string[],
  tools: string[],
  crewName: string,
  status: string,
  environment: string
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Crew node at top center
  const crewId = "crew-main";
  nodes.push({
    id: crewId,
    type: "crew",
    position: { x: 300, y: 0 },
    data: { label: crewName, status, environment },
  });

  // Arrange agents in a row below the crew
  const agentStartX = 50;
  const agentY = 150;
  const agentSpacing = 220;

  agents.forEach((agent, i) => {
    const agentId = `agent-${slugify(agent)}`;
    nodes.push({
      id: agentId,
      type: "agent",
      position: { x: agentStartX + i * agentSpacing, y: agentY },
      data: {
        label: agent,
        isActive: false,
        hasError: false,
        stats: { llmCalls: 0, toolCalls: 0, errors: 0 },
        currentAction: null,
      },
    });

    // Connect crew to each agent
    edges.push({
      id: `${crewId}-${agentId}`,
      source: crewId,
      target: agentId,
      type: "smoothstep",
      style: { stroke: "#666", strokeWidth: 1, strokeDasharray: "5,5" },
    });
  });

  // Arrange tools in a row below agents
  const toolStartX = 80;
  const toolY = 350;
  const toolSpacing = 180;

  tools.forEach((tool, i) => {
    const toolId = `tool-${slugify(tool)}`;
    nodes.push({
      id: toolId,
      type: "tool",
      position: { x: toolStartX + i * toolSpacing, y: toolY },
      data: { label: tool, isActive: false, callCount: 0 },
    });
  });

  // Connect agents to adjacent agents (chain pattern)
  for (let i = 0; i < agents.length - 1; i++) {
    const sourceId = `agent-${slugify(agents[i])}`;
    const targetId = `agent-${slugify(agents[i + 1])}`;
    edges.push({
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      sourceHandle: "right",
      targetHandle: "left",
      type: "smoothstep",
      animated: false,
      style: { stroke: "#666", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
    });
  }

  return { nodes, edges };
}

// Convert API events to visual events
function apiEventToVisual(event: TraceEvent): VisualEvent {
  const agentRole = event.agent_role || "unknown";
  return {
    id: event.event_id,
    timestamp: new Date(event.timestamp),
    type: event.event_type,
    agentId: `agent-${slugify(agentRole)}`,
    agentName: agentRole,
    toolName: event.tool_name || undefined,
    data: {
      duration: event.duration_ms || undefined,
      error: event.error,
      content: event.error_message || undefined,
    },
  };
}

// Demo data generator for when no traces exist
function generateDemoData(): { traces: TraceSummary[]; events: Map<string, TraceEvent[]> } {
  const now = new Date();
  const traces: TraceSummary[] = [
    {
      trace_id: "demo-trace-001",
      project_name: "Demo Research Crew",
      environment: "demo",
      started_at: new Date(now.getTime() - 5 * 60000).toISOString(),
      ended_at: null,
      status: "running",
      event_count: 24,
      agent_count: 3,
      error_count: 0,
      duration_ms: null,
    },
  ];

  const demoEvents: TraceEvent[] = [];
  const baseTime = now.getTime() - 5 * 60000;
  let eventIndex = 0;

  const agents = ["Research Analyst", "Content Writer", "Quality Reviewer"];
  const tools = ["web_search", "document_reader", "text_editor", "fact_checker"];

  // Generate a sequence of events
  agents.forEach((agent, agentIdx) => {
    // Agent start
    demoEvents.push({
      event_id: `demo-event-${eventIndex++}`,
      trace_id: "demo-trace-001",
      event_type: "agent_started",
      timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
      agent_role: agent,
      tool_name: null,
      duration_ms: null,
      error: false,
      error_message: null,
    });

    // LLM calls
    for (let i = 0; i < 2; i++) {
      demoEvents.push({
        event_id: `demo-event-${eventIndex++}`,
        trace_id: "demo-trace-001",
        event_type: "llm_started",
        timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
        agent_role: agent,
        tool_name: null,
        duration_ms: null,
        error: false,
        error_message: null,
      });
      demoEvents.push({
        event_id: `demo-event-${eventIndex++}`,
        trace_id: "demo-trace-001",
        event_type: "llm_completed",
        timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
        agent_role: agent,
        tool_name: null,
        duration_ms: 1200 + Math.random() * 800,
        error: false,
        error_message: null,
      });
    }

    // Tool call
    const tool = tools[agentIdx % tools.length];
    demoEvents.push({
      event_id: `demo-event-${eventIndex++}`,
      trace_id: "demo-trace-001",
      event_type: "tool_started",
      timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
      agent_role: agent,
      tool_name: tool,
      duration_ms: null,
      error: false,
      error_message: null,
    });
    demoEvents.push({
      event_id: `demo-event-${eventIndex++}`,
      trace_id: "demo-trace-001",
      event_type: "tool_finished",
      timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
      agent_role: agent,
      tool_name: tool,
      duration_ms: 500 + Math.random() * 500,
      error: false,
      error_message: null,
    });

    // Agent end
    demoEvents.push({
      event_id: `demo-event-${eventIndex++}`,
      trace_id: "demo-trace-001",
      event_type: "agent_completed",
      timestamp: new Date(baseTime + eventIndex * 5000).toISOString(),
      agent_role: agent,
      tool_name: null,
      duration_ms: null,
      error: false,
      error_message: null,
    });
  });

  const events = new Map<string, TraceEvent[]>();
  events.set("demo-trace-001", demoEvents);

  return { traces, events };
}

// Main Component
export default function ZoomViewPage() {
  const token = useAuthStore((state) => state.token);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [eventBubbles, setEventBubbles] = useState<EventBubble[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});
  const [useDemoData, setUseDemoData] = useState(false);
  const demoDataRef = useRef<{ traces: TraceSummary[]; events: Map<string, TraceEvent[]> } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch traces
  useEffect(() => {
    async function fetchTraces() {
      if (!token) return;
      setLoading(true);
      try {
        const data = await tracesAPI.list(token, { page_size: "20" });
        if (data.traces.length === 0) {
          // Use demo data
          const demo = generateDemoData();
          demoDataRef.current = demo;
          setTraces(demo.traces);
          setUseDemoData(true);
          setSelectedTraceId(demo.traces[0].trace_id);
        } else {
          setTraces(data.traces);
          setUseDemoData(false);
          // Auto-select most recent trace
          if (!selectedTraceId) {
            setSelectedTraceId(data.traces[0].trace_id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch traces:", error);
        // Fallback to demo
        const demo = generateDemoData();
        demoDataRef.current = demo;
        setTraces(demo.traces);
        setUseDemoData(true);
        setSelectedTraceId(demo.traces[0].trace_id);
      } finally {
        setLoading(false);
      }
    }
    fetchTraces();
  }, [token]);

  // Fetch events for selected trace
  useEffect(() => {
    async function fetchEvents() {
      if (!selectedTraceId || !token) return;

      if (useDemoData && demoDataRef.current) {
        const events = demoDataRef.current.events.get(selectedTraceId) || [];
        setAllEvents(events);
        setPlaybackIndex(0);
        return;
      }

      try {
        const detail = await tracesAPI.get(token, selectedTraceId);
        setAllEvents(detail.events);
        setPlaybackIndex(0);
      } catch (error) {
        console.error("Failed to fetch trace events:", error);
      }
    }
    fetchEvents();
  }, [selectedTraceId, token, useDemoData]);

  // Build graph from events
  useEffect(() => {
    if (allEvents.length === 0) return;

    // Extract unique agents and tools
    const agents = new Set<string>();
    const tools = new Set<string>();

    allEvents.forEach((event) => {
      if (event.agent_role) agents.add(event.agent_role);
      if (event.tool_name) tools.add(event.tool_name);
    });

    const trace = traces.find((t) => t.trace_id === selectedTraceId);
    const { nodes: newNodes, edges: newEdges } = layoutNodes(
      Array.from(agents),
      Array.from(tools),
      trace?.project_name || "Crew",
      trace?.status || "unknown",
      trace?.environment || ""
    );

    setNodes(newNodes);
    setEdges(newEdges);

    // Reset stats
    const initialStats: Record<string, AgentStats> = {};
    agents.forEach((a) => {
      initialStats[`agent-${slugify(a)}`] = { llmCalls: 0, toolCalls: 0, errors: 0 };
    });
    setAgentStats(initialStats);

    const initialToolCounts: Record<string, number> = {};
    tools.forEach((t) => {
      initialToolCounts[`tool-${slugify(t)}`] = 0;
    });
    setToolCounts(initialToolCounts);
  }, [allEvents, selectedTraceId, traces, setNodes, setEdges]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || allEvents.length === 0) return;

    const interval = setInterval(() => {
      setPlaybackIndex((prev) => {
        if (prev >= allEvents.length) {
          // Loop back or stop
          return 0;
        }
        return prev + 1;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isPlaying, allEvents.length]);

  // Process current event
  useEffect(() => {
    if (playbackIndex === 0 || playbackIndex > allEvents.length) return;

    const event = allEvents[playbackIndex - 1];
    const visualEvent = apiEventToVisual(event);

    // Update active agent
    setActiveAgentId(visualEvent.agentId);

    // Update active tool
    if (event.tool_name) {
      const toolId = `tool-${slugify(event.tool_name)}`;
      setActiveToolId(toolId);
      setTimeout(() => setActiveToolId(null), 600);
    }

    // Update stats
    if (event.event_type === "llm_completed") {
      setAgentStats((prev) => ({
        ...prev,
        [visualEvent.agentId]: {
          ...prev[visualEvent.agentId],
          llmCalls: (prev[visualEvent.agentId]?.llmCalls || 0) + 1,
        },
      }));
    } else if (event.event_type === "tool_finished" && event.tool_name) {
      const toolId = `tool-${slugify(event.tool_name)}`;
      setAgentStats((prev) => ({
        ...prev,
        [visualEvent.agentId]: {
          ...prev[visualEvent.agentId],
          toolCalls: (prev[visualEvent.agentId]?.toolCalls || 0) + 1,
        },
      }));
      setToolCounts((prev) => ({
        ...prev,
        [toolId]: (prev[toolId] || 0) + 1,
      }));
    } else if (event.error) {
      setAgentStats((prev) => ({
        ...prev,
        [visualEvent.agentId]: {
          ...prev[visualEvent.agentId],
          errors: (prev[visualEvent.agentId]?.errors || 0) + 1,
        },
      }));
    }

    // Add event bubble
    const bubble: EventBubble = { id: visualEvent.id, event: visualEvent, exiting: false };
    setEventBubbles((prev) => [...prev.slice(-4), bubble]);

    setTimeout(() => {
      setEventBubbles((prev) =>
        prev.map((b) => (b.id === bubble.id ? { ...b, exiting: true } : b))
      );
      setTimeout(() => {
        setEventBubbles((prev) => prev.filter((b) => b.id !== bubble.id));
      }, 300);
    }, 3000);
  }, [playbackIndex, allEvents]);

  // Update node data based on state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === "agent") {
          const isActive = node.id === activeAgentId;
          const stats = agentStats[node.id] || { llmCalls: 0, toolCalls: 0, errors: 0 };
          const hasError = stats.errors > 0;

          // Find current action
          let currentAction = null;
          if (isActive && playbackIndex > 0 && playbackIndex <= allEvents.length) {
            const event = allEvents[playbackIndex - 1];
            if (event.event_type.includes("llm")) {
              currentAction = { type: "llm", label: "LLM Call" };
            } else if (event.event_type.includes("tool")) {
              currentAction = { type: "tool", label: event.tool_name || "Tool" };
            } else if (event.error) {
              currentAction = { type: "error", label: "Error" };
            }
          }

          return {
            ...node,
            data: { ...node.data, isActive, hasError, stats, currentAction },
          };
        }
        if (node.type === "tool") {
          const isActive = node.id === activeToolId;
          const callCount = toolCounts[node.id] || 0;
          return {
            ...node,
            data: { ...node.data, isActive, callCount },
          };
        }
        return node;
      })
    );
  }, [activeAgentId, activeToolId, agentStats, toolCounts, playbackIndex, allEvents, setNodes]);

  // Animate edges when tool is active
  useEffect(() => {
    if (!activeToolId || !activeAgentId) return;

    setEdges((eds) =>
      eds.map((edge) => {
        // Highlight edge from active agent
        const isActive = edge.source === activeAgentId || edge.target === activeAgentId;
        const markerEnd = edge.markerEnd as EdgeMarker | undefined;

        return {
          ...edge,
          animated: isActive,
          style: {
            ...edge.style,
            stroke: isActive ? "#22c55e" : "#666",
            strokeWidth: isActive ? 3 : 2,
          },
          markerEnd: markerEnd
            ? { ...markerEnd, color: isActive ? "#22c55e" : "#666" }
            : undefined,
        };
      })
    );

    // Reset after delay
    const timeout = setTimeout(() => {
      setEdges((eds) =>
        eds.map((edge) => {
          const markerEnd = edge.markerEnd as EdgeMarker | undefined;
          return {
            ...edge,
            animated: false,
            style: { ...edge.style, stroke: "#666", strokeWidth: 2 },
            markerEnd: markerEnd ? { ...markerEnd, color: "#666" } : undefined,
          };
        })
      );
    }, 600);

    return () => clearTimeout(timeout);
  }, [activeToolId, activeAgentId, setEdges]);

  const handleReset = () => {
    setPlaybackIndex(0);
    setEventBubbles([]);
    setActiveAgentId(null);
    setActiveToolId(null);

    // Reset stats
    const resetStats: Record<string, AgentStats> = {};
    Object.keys(agentStats).forEach((k) => {
      resetStats[k] = { llmCalls: 0, toolCalls: 0, errors: 0 };
    });
    setAgentStats(resetStats);

    const resetToolCounts: Record<string, number> = {};
    Object.keys(toolCounts).forEach((k) => {
      resetToolCounts[k] = 0;
    });
    setToolCounts(resetToolCounts);
  };

  const getEventIcon = (type: string) => {
    if (type.includes("llm")) return <Brain className="h-3 w-3" />;
    if (type.includes("tool")) return <Wrench className="h-3 w-3" />;
    if (type.includes("agent")) return <Bot className="h-3 w-3" />;
    return <Activity className="h-3 w-3" />;
  };

  const getEventColor = (type: string, error?: boolean) => {
    if (error) return "bg-red-500/20 border-red-500 text-red-400";
    if (type.includes("llm")) return "bg-purple-500/20 border-purple-500 text-purple-400";
    if (type.includes("tool")) return "bg-orange-500/20 border-orange-500 text-orange-400";
    return "bg-blue-500/20 border-blue-500 text-blue-400";
  };

  const selectedTrace = traces.find((t) => t.trace_id === selectedTraceId);

  return (
    <div className="h-[calc(100vh-120px)] relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold">Zoom View</h1>
          <p className="text-muted-foreground">
            Real-time visualization of agent execution flow
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Trace selector */}
          <Select value={selectedTraceId || ""} onValueChange={setSelectedTraceId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a trace..." />
            </SelectTrigger>
            <SelectContent>
              {traces.map((trace) => (
                <SelectItem key={trace.trace_id} value={trace.trace_id}>
                  <div className="flex items-center gap-2">
                    {trace.status === "running" && (
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                    )}
                    {trace.status === "completed" && (
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                    )}
                    {trace.status === "failed" && (
                      <span className="w-2 h-2 bg-red-500 rounded-full" />
                    )}
                    <span className="truncate">{trace.project_name}</span>
                    <span className="text-muted-foreground text-xs">
                      ({trace.event_count} events)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={isPlaying ? "default" : "outline"}
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Play
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Demo mode indicator */}
      {useDemoData && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            Demo mode: Run the demo simulator to see real data. <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">python demo/simulated_crew.py --api-key YOUR_KEY</code>
          </span>
        </div>
      )}

      {/* Main visualization */}
      <div className="h-[calc(100%-120px)] rounded-xl border bg-background/50 backdrop-blur overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Activity className="h-12 w-12 mb-4 opacity-50" />
            <p>No events to visualize</p>
            <p className="text-sm">Select a trace or run the demo simulator</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background color="#333" gap={20} />
            <Controls className="!bg-background !border-border" />
            <MiniMap
              className="!bg-background !border-border"
              nodeColor={(node) => {
                if (node.id === activeAgentId) return "#3b82f6";
                if (node.type === "tool") return "#f97316";
                if (node.type === "crew") return "#f59e0b";
                return "#666";
              }}
            />
          </ReactFlow>
        )}

        {/* Event Bubbles */}
        <div className="absolute bottom-4 right-4 w-80 space-y-2 pointer-events-none">
          <AnimatePresence mode="popLayout">
            {eventBubbles.map((bubble) => (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 0, x: 100, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`p-3 rounded-lg border backdrop-blur-sm pointer-events-auto ${getEventColor(
                  bubble.event.type,
                  bubble.event.data.error
                )}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{getEventIcon(bubble.event.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{bubble.event.agentName}</span>
                      <Badge variant="outline" className="text-xs py-0">
                        {bubble.event.type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {bubble.event.toolName && (
                      <p className="text-xs mt-1 opacity-80">
                        Tool: {bubble.event.toolName}
                      </p>
                    )}
                    {bubble.event.data.duration && (
                      <p className="text-xs mt-1 opacity-80">
                        {bubble.event.data.duration.toFixed(0)}ms
                      </p>
                    )}
                    {bubble.event.data.content && (
                      <p className="text-xs mt-1 opacity-80 truncate">
                        {bubble.event.data.content}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Progress indicator */}
        <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${isPlaying ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">
              {playbackIndex} / {allEvents.length} events
            </span>
          </div>
          {selectedTrace && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedTrace.project_name}
            </p>
          )}
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg border p-3 text-xs space-y-2">
          <p className="font-medium">Legend</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span>Active Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span>Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-green-500" />
            <span>Data Flow</span>
          </div>
        </div>
      </div>
    </div>
  );
}
