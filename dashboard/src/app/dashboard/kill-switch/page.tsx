"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { controlAPI, tracesAPI, type AgentStatus } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/utils";
import {
  Shield,
  Bot,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Activity,
} from "lucide-react";

export default function KillSwitchPage() {
  const token = useAuthStore((state) => state.token);
  const { toast } = useToast();

  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [allAgents, setAllAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token) return;

    try {
      const [statusData, agentsData] = await Promise.all([
        controlAPI.getStatus(token),
        tracesAPI.getAgents(token),
      ]);
      setAgentStatuses(statusData.agents);
      setAllAgents(agentsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleKill = async (agentRole: string) => {
    if (!token) return;
    setActionLoading(agentRole);

    try {
      await controlAPI.kill(token, agentRole);
      toast({
        title: "Kill switch activated",
        description: `Agent "${agentRole}" has been stopped.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to kill agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (agentRole: string) => {
    if (!token) return;
    setActionLoading(agentRole);

    try {
      await controlAPI.resume(token, agentRole);
      toast({
        title: "Agent resumed",
        description: `Agent "${agentRole}" can now continue executing.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to resume agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleKillAll = async () => {
    if (!token) return;
    setActionLoading("all");

    try {
      for (const agent of allAgents) {
        await controlAPI.kill(token, agent);
      }
      toast({
        title: "All agents stopped",
        description: "Kill switch activated for all agents.",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to kill all agents",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumeAll = async () => {
    if (!token) return;
    setActionLoading("all");

    try {
      await controlAPI.clearAll(token);
      toast({
        title: "All agents resumed",
        description: "All kill switches have been cleared.",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to resume agents",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const killedAgents = agentStatuses.filter((a) => a.killed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Kill Switch
          </h1>
          <p className="text-muted-foreground">
            Emergency controls to stop runaway agents
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Emergency Controls */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Emergency Controls
          </CardTitle>
          <CardDescription>
            Use these buttons to immediately stop or resume all agents
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            variant="destructive"
            size="lg"
            onClick={handleKillAll}
            disabled={actionLoading === "all"}
            className="flex-1"
          >
            <Pause className="h-5 w-5 mr-2" />
            Kill All Agents
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleResumeAll}
            disabled={actionLoading === "all" || killedAgents.length === 0}
            className="flex-1"
          >
            <Play className="h-5 w-5 mr-2" />
            Resume All Agents
          </Button>
        </CardContent>
      </Card>

      {/* Killed Agents */}
      {killedAgents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Killed Agents
              <Badge variant="destructive">{killedAgents.length}</Badge>
            </CardTitle>
            <CardDescription>
              These agents are currently stopped and will not execute any tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {killedAgents.map((status) => (
                <div
                  key={status.agent_role}
                  className="flex items-center justify-between p-4 border border-destructive rounded-lg bg-destructive/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium">{status.agent_role}</p>
                      {status.killed_at && (
                        <p className="text-sm text-muted-foreground">
                          Killed at {formatDateTime(status.killed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleResume(status.agent_role)}
                    disabled={actionLoading === status.agent_role}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            All Agents
          </CardTitle>
          <CardDescription>
            {allAgents.length} unique agent roles detected
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : allAgents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No agents detected yet</p>
              <p className="text-sm">
                Agents will appear here once they start executing
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allAgents.map((agent) => {
                const isKilled = killedAgents.some(
                  (k) => k.agent_role === agent
                );
                return (
                  <div
                    key={agent}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      isKilled ? "border-destructive bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Bot
                        className={`h-5 w-5 ${
                          isKilled ? "text-destructive" : "text-muted-foreground"
                        }`}
                      />
                      <div>
                        <p className="font-medium">{agent}</p>
                        <Badge
                          variant={isKilled ? "destructive" : "success"}
                          className="text-xs"
                        >
                          {isKilled ? "Stopped" : "Active"}
                        </Badge>
                      </div>
                    </div>
                    {isKilled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResume(agent)}
                        disabled={actionLoading === agent}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleKill(agent)}
                        disabled={actionLoading === agent}
                      >
                        Kill
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
