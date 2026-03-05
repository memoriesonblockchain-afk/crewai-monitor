"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Zap,
  MessageSquare,
  Wrench,
  Brain,
  Database,
  RefreshCw,
  Play,
  Pause,
  Activity,
} from "lucide-react";

// Types for our visualization
interface AgentEvent {
  id: string;
  timestamp: Date;
  type: "llm_start" | "llm_end" | "tool_start" | "tool_end" | "agent_start" | "agent_end" | "task_start" | "task_end" | "message";
  agentId: string;
  agentName: string;
  targetAgentId?: string;
  data: {
    content?: string;
    tool?: string;
    model?: string;
    tokens?: number;
    duration?: number;
  };
}

interface EventBubble {
  id: string;
  event: AgentEvent;
  exiting: boolean;
}

// Custom Agent Node Component
function AgentNode({ data, selected }: NodeProps) {
  const isActive = data.isActive;
  const isCommunicating = data.isCommunicating;

  return (
    <motion.div
      className={`relative px-6 py-4 rounded-xl border-2 shadow-lg min-w-[180px] transition-all duration-300 ${
        isActive
          ? "bg-blue-500/20 border-blue-500 shadow-blue-500/50 shadow-xl"
          : isCommunicating
          ? "bg-green-500/10 border-green-400"
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
      {/* Active indicator ring */}
      {isActive && (
        <motion.div
          className="absolute -inset-2 rounded-xl border-2 border-blue-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <Handle type="target" position={Position.Left} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" />

      {/* Agent icon and info */}
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${
            isActive ? "bg-blue-500 text-white" : "bg-muted"
          }`}
        >
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold text-sm">{data.label}</p>
          <p className="text-xs text-muted-foreground">{data.role}</p>
        </div>
      </div>

      {/* Current action indicator */}
      {data.currentAction && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 pt-3 border-t border-border"
        >
          <div className="flex items-center gap-2 text-xs">
            {data.currentAction.type === "llm" && <Brain className="h-3 w-3 text-purple-500" />}
            {data.currentAction.type === "tool" && <Wrench className="h-3 w-3 text-orange-500" />}
            {data.currentAction.type === "message" && <MessageSquare className="h-3 w-3 text-green-500" />}
            <span className="truncate max-w-[120px]">{data.currentAction.label}</span>
          </div>
        </motion.div>
      )}

      {/* Stats badges */}
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
      </div>
    </motion.div>
  );
}

// Custom Task Node Component
function TaskNode({ data }: NodeProps) {
  const isActive = data.isActive;

  return (
    <motion.div
      className={`relative px-4 py-3 rounded-lg border-2 min-w-[200px] ${
        isActive
          ? "bg-amber-500/20 border-amber-500"
          : data.completed
          ? "bg-green-500/10 border-green-500"
          : "bg-muted/50 border-dashed border-muted-foreground/30"
      }`}
      animate={{ scale: isActive ? 1.02 : 1 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-2 !h-2" />

      <div className="flex items-center gap-2">
        <Zap className={`h-4 w-4 ${isActive ? "text-amber-500" : "text-muted-foreground"}`} />
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.description && (
        <p className="text-xs text-muted-foreground mt-1 truncate">{data.description}</p>
      )}
    </motion.div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
};

// Demo agents and events generator
const demoAgents = [
  { id: "researcher", name: "Researcher", role: "Data Gatherer" },
  { id: "analyst", name: "Analyst", role: "Data Processor" },
  { id: "writer", name: "Writer", role: "Content Creator" },
  { id: "reviewer", name: "Reviewer", role: "Quality Check" },
];

function generateDemoEvent(agents: typeof demoAgents, eventIndex: number): AgentEvent {
  const eventSequence: Array<{
    type: AgentEvent["type"];
    agentIndex: number;
    targetAgentIndex?: number;
    data: AgentEvent["data"];
  }> = [
    { type: "agent_start", agentIndex: 0, data: { content: "Starting research task" } },
    { type: "llm_start", agentIndex: 0, data: { model: "gpt-4", content: "Analyzing query..." } },
    { type: "llm_end", agentIndex: 0, data: { model: "gpt-4", tokens: 450, duration: 1200 } },
    { type: "tool_start", agentIndex: 0, data: { tool: "web_search", content: "Searching for data..." } },
    { type: "tool_end", agentIndex: 0, data: { tool: "web_search", duration: 800 } },
    { type: "message", agentIndex: 0, targetAgentIndex: 1, data: { content: "Research data collected" } },
    { type: "agent_start", agentIndex: 1, data: { content: "Analyzing research data" } },
    { type: "llm_start", agentIndex: 1, data: { model: "gpt-4", content: "Processing insights..." } },
    { type: "llm_end", agentIndex: 1, data: { model: "gpt-4", tokens: 680, duration: 1500 } },
    { type: "tool_start", agentIndex: 1, data: { tool: "data_analyzer", content: "Running analysis..." } },
    { type: "tool_end", agentIndex: 1, data: { tool: "data_analyzer", duration: 600 } },
    { type: "message", agentIndex: 1, targetAgentIndex: 2, data: { content: "Analysis complete" } },
    { type: "agent_start", agentIndex: 2, data: { content: "Writing content" } },
    { type: "llm_start", agentIndex: 2, data: { model: "gpt-4", content: "Generating draft..." } },
    { type: "llm_end", agentIndex: 2, data: { model: "gpt-4", tokens: 1200, duration: 2000 } },
    { type: "message", agentIndex: 2, targetAgentIndex: 3, data: { content: "Draft ready for review" } },
    { type: "agent_start", agentIndex: 3, data: { content: "Reviewing content" } },
    { type: "llm_start", agentIndex: 3, data: { model: "gpt-4", content: "Quality checking..." } },
    { type: "llm_end", agentIndex: 3, data: { model: "gpt-4", tokens: 320, duration: 900 } },
    { type: "agent_end", agentIndex: 3, data: { content: "Review complete - approved" } },
  ];

  const event = eventSequence[eventIndex % eventSequence.length];
  const agent = agents[event.agentIndex];

  return {
    id: `event-${Date.now()}-${eventIndex}`,
    timestamp: new Date(),
    type: event.type,
    agentId: agent.id,
    agentName: agent.name,
    targetAgentId: event.targetAgentIndex !== undefined ? agents[event.targetAgentIndex].id : undefined,
    data: event.data,
  };
}

// Main Zoom View Component
export default function ZoomViewPage() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [eventBubbles, setEventBubbles] = useState<EventBubble[]>([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [communicatingPair, setCommunicatingPair] = useState<[string, string] | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, { llmCalls: number; toolCalls: number }>>({});

  // Create initial nodes
  const initialNodes: Node[] = useMemo(
    () => [
      // Task node at top
      {
        id: "task-main",
        type: "task",
        position: { x: 300, y: 0 },
        data: { label: "Research & Write Report", description: "Multi-agent collaboration", isActive: false, completed: false },
      },
      // Agent nodes in a grid
      {
        id: "researcher",
        type: "agent",
        position: { x: 50, y: 150 },
        data: { label: "Researcher", role: "Data Gatherer", isActive: false, isCommunicating: false, stats: { llmCalls: 0, toolCalls: 0 } },
      },
      {
        id: "analyst",
        type: "agent",
        position: { x: 350, y: 150 },
        data: { label: "Analyst", role: "Data Processor", isActive: false, isCommunicating: false, stats: { llmCalls: 0, toolCalls: 0 } },
      },
      {
        id: "writer",
        type: "agent",
        position: { x: 50, y: 350 },
        data: { label: "Writer", role: "Content Creator", isActive: false, isCommunicating: false, stats: { llmCalls: 0, toolCalls: 0 } },
      },
      {
        id: "reviewer",
        type: "agent",
        position: { x: 350, y: 350 },
        data: { label: "Reviewer", role: "Quality Check", isActive: false, isCommunicating: false, stats: { llmCalls: 0, toolCalls: 0 } },
      },
    ],
    []
  );

  // Create edges with animation states
  const initialEdges: Edge[] = useMemo(
    () => [
      // Task to agents
      {
        id: "task-researcher",
        source: "task-main",
        target: "researcher",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#666", strokeWidth: 1, strokeDasharray: "5,5" },
      },
      {
        id: "task-analyst",
        source: "task-main",
        target: "analyst",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#666", strokeWidth: 1, strokeDasharray: "5,5" },
      },
      // Agent to agent communication paths
      {
        id: "researcher-analyst",
        source: "researcher",
        target: "analyst",
        sourceHandle: "right",
        targetHandle: "left",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#666", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
      },
      {
        id: "analyst-writer",
        source: "analyst",
        target: "writer",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#666", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
      },
      {
        id: "writer-reviewer",
        source: "writer",
        target: "reviewer",
        sourceHandle: "right",
        targetHandle: "left",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#666", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
      },
    ],
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes based on current state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === "agent") {
          const isActive = node.id === activeAgentId;
          const isCommunicating = communicatingPair?.includes(node.id) || false;
          const stats = agentStats[node.id] || { llmCalls: 0, toolCalls: 0 };

          // Find current action for this agent
          const latestEvent = [...events].reverse().find((e) => e.agentId === node.id);
          let currentAction = null;
          if (isActive && latestEvent) {
            if (latestEvent.type.startsWith("llm")) {
              currentAction = { type: "llm" as const, label: latestEvent.data.model || "LLM Call" };
            } else if (latestEvent.type.startsWith("tool")) {
              currentAction = { type: "tool" as const, label: latestEvent.data.tool || "Tool" };
            } else if (latestEvent.type === "message") {
              currentAction = { type: "message" as const, label: latestEvent.data.content?.slice(0, 30) || "Message" };
            }
          }

          return {
            ...node,
            data: { ...node.data, isActive, isCommunicating, stats, currentAction },
          };
        }
        return node;
      })
    );
  }, [activeAgentId, communicatingPair, agentStats, events, setNodes]);

  // Update edges based on communication
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const isActive =
          communicatingPair &&
          ((edge.source === communicatingPair[0] && edge.target === communicatingPair[1]) ||
            (edge.source === communicatingPair[1] && edge.target === communicatingPair[0]));

        const markerEnd = edge.markerEnd as EdgeMarker | undefined;
        return {
          ...edge,
          animated: isActive || false,
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
  }, [communicatingPair, setEdges]);

  // Event simulation loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const newEvent = generateDemoEvent(demoAgents, currentEventIndex);
      setEvents((prev) => [...prev.slice(-50), newEvent]); // Keep last 50 events

      // Update active agent
      setActiveAgentId(newEvent.agentId);

      // Update communication pair
      if (newEvent.type === "message" && newEvent.targetAgentId) {
        setCommunicatingPair([newEvent.agentId, newEvent.targetAgentId]);
        setTimeout(() => setCommunicatingPair(null), 1500);
      }

      // Update agent stats
      if (newEvent.type === "llm_end") {
        setAgentStats((prev) => ({
          ...prev,
          [newEvent.agentId]: {
            ...prev[newEvent.agentId],
            llmCalls: (prev[newEvent.agentId]?.llmCalls || 0) + 1,
            toolCalls: prev[newEvent.agentId]?.toolCalls || 0,
          },
        }));
      } else if (newEvent.type === "tool_end") {
        setAgentStats((prev) => ({
          ...prev,
          [newEvent.agentId]: {
            ...prev[newEvent.agentId],
            llmCalls: prev[newEvent.agentId]?.llmCalls || 0,
            toolCalls: (prev[newEvent.agentId]?.toolCalls || 0) + 1,
          },
        }));
      }

      // Add event bubble
      const bubble: EventBubble = { id: newEvent.id, event: newEvent, exiting: false };
      setEventBubbles((prev) => [...prev.slice(-4), bubble]);

      // Remove bubble after delay
      setTimeout(() => {
        setEventBubbles((prev) =>
          prev.map((b) => (b.id === bubble.id ? { ...b, exiting: true } : b))
        );
        setTimeout(() => {
          setEventBubbles((prev) => prev.filter((b) => b.id !== bubble.id));
        }, 300);
      }, 3000);

      setCurrentEventIndex((prev) => prev + 1);
    }, 1500);

    return () => clearInterval(interval);
  }, [isPlaying, currentEventIndex]);

  const handleReset = () => {
    setEvents([]);
    setEventBubbles([]);
    setCurrentEventIndex(0);
    setActiveAgentId(null);
    setCommunicatingPair(null);
    setAgentStats({});
  };

  // Get icon for event type
  const getEventIcon = (type: AgentEvent["type"]) => {
    switch (type) {
      case "llm_start":
      case "llm_end":
        return <Brain className="h-3 w-3" />;
      case "tool_start":
      case "tool_end":
        return <Wrench className="h-3 w-3" />;
      case "message":
        return <MessageSquare className="h-3 w-3" />;
      case "agent_start":
      case "agent_end":
        return <Bot className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  // Get color for event type
  const getEventColor = (type: AgentEvent["type"]) => {
    if (type.startsWith("llm")) return "bg-purple-500/20 border-purple-500 text-purple-400";
    if (type.startsWith("tool")) return "bg-orange-500/20 border-orange-500 text-orange-400";
    if (type === "message") return "bg-green-500/20 border-green-500 text-green-400";
    return "bg-blue-500/20 border-blue-500 text-blue-400";
  };

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
        <div className="flex gap-2">
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

      {/* Main flow visualization */}
      <div className="h-[calc(100%-80px)] rounded-xl border bg-background/50 backdrop-blur overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.5}
          maxZoom={1.5}
        >
          <Background color="#333" gap={20} />
          <Controls className="!bg-background !border-border" />
          <MiniMap
            className="!bg-background !border-border"
            nodeColor={(node) => {
              if (node.id === activeAgentId) return "#3b82f6";
              if (node.type === "task") return "#f59e0b";
              return "#666";
            }}
          />
        </ReactFlow>

        {/* Event Bubbles - Bottom Right Corner */}
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
                  bubble.event.type
                )}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{getEventIcon(bubble.event.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{bubble.event.agentName}</span>
                      <Badge variant="outline" className="text-xs py-0">
                        {bubble.event.type.replace("_", " ")}
                      </Badge>
                    </div>
                    {bubble.event.data.content && (
                      <p className="text-xs mt-1 opacity-80 truncate">
                        {bubble.event.data.content}
                      </p>
                    )}
                    {bubble.event.data.tool && (
                      <p className="text-xs mt-1 opacity-80">
                        Tool: {bubble.event.data.tool}
                      </p>
                    )}
                    {bubble.event.data.tokens && (
                      <p className="text-xs mt-1 opacity-80">
                        {bubble.event.data.tokens} tokens
                        {bubble.event.data.duration && ` • ${bubble.event.data.duration}ms`}
                      </p>
                    )}
                    {bubble.event.targetAgentId && (
                      <p className="text-xs mt-1 opacity-80">
                        → {demoAgents.find((a) => a.id === bubble.event.targetAgentId)?.name}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Legend - Top Right */}
        <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg border p-3 text-xs space-y-2">
          <p className="font-medium">Legend</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span>Active Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Communicating</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-green-500" />
            <span>Data Flow</span>
          </div>
        </div>

        {/* Event Counter - Top Left */}
        <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${isPlaying ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{events.length} events</span>
          </div>
        </div>
      </div>
    </div>
  );
}
