"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/store";
import {
  alertsAPI,
  type AlertRule,
  type AlertEvent,
  type CreateAlertRuleRequest,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import {
  Bell,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Trash2,
  Edit,
  Activity,
  Zap,
  Clock,
  Repeat,
  XCircle,
} from "lucide-react";

const severityConfig = {
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    badge: "default" as const,
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    badge: "warning" as const,
  },
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    badge: "destructive" as const,
  },
  critical: {
    icon: XCircle,
    color: "text-red-700",
    bg: "bg-red-700/10",
    badge: "destructive" as const,
  },
};

const ruleTypeConfig = {
  repeated_calls: { label: "Repeated Calls", icon: Repeat },
  error_rate: { label: "Error Rate", icon: AlertTriangle },
  rate_limit: { label: "Rate Limit", icon: Zap },
  long_running: { label: "Long Running", icon: Clock },
  custom: { label: "Custom", icon: Activity },
};

export default function AlertsPage() {
  const token = useAuthStore((state) => state.token);
  const { toast } = useToast();

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  // Form state for creating/editing rules
  const [formData, setFormData] = useState<CreateAlertRuleRequest>({
    name: "",
    description: "",
    rule_type: "repeated_calls",
    config: { threshold: 10, window_seconds: 30 },
    action: "alert",
  });

  const fetchData = async () => {
    if (!token) return;

    try {
      const [rulesData, eventsData] = await Promise.all([
        alertsAPI.listRules(token),
        alertsAPI.listEvents(token, { limit: "50" }),
      ]);
      setRules(rulesData.rules);
      setEvents(eventsData.events);
    } catch (error) {
      console.error("Failed to fetch alerts data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [token]);

  const handleCreateRule = async () => {
    if (!token || !formData.name) return;
    setActionLoading("create");

    try {
      await alertsAPI.createRule(token, formData);
      toast({
        title: "Rule created",
        description: `Alert rule "${formData.name}" has been created.`,
      });
      setCreateDialogOpen(false);
      setFormData({
        name: "",
        description: "",
        rule_type: "repeated_calls",
        config: { threshold: 10, window_seconds: 30 },
        action: "alert",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to create rule",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRule = async (ruleId: string, updates: { enabled?: boolean }) => {
    if (!token) return;
    setActionLoading(ruleId);

    try {
      await alertsAPI.updateRule(token, ruleId, updates);
      toast({
        title: "Rule updated",
        description: "Alert rule has been updated.",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to update rule",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!token) return;
    setActionLoading(ruleId);

    try {
      await alertsAPI.deleteRule(token, ruleId);
      toast({
        title: "Rule deleted",
        description: `Alert rule "${ruleName}" has been deleted.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to delete rule",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcknowledge = async (eventId: string) => {
    if (!token) return;
    setActionLoading(eventId);

    try {
      await alertsAPI.acknowledgeEvent(token, eventId);
      toast({
        title: "Alert acknowledged",
        description: "The alert has been acknowledged.",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to acknowledge",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    if (!token) return;
    setActionLoading("ack-all");

    try {
      await alertsAPI.acknowledgeAll(token);
      toast({
        title: "All alerts acknowledged",
        description: "All unacknowledged alerts have been marked as acknowledged.",
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to acknowledge all",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateDefaults = async () => {
    if (!token) return;
    setActionLoading("defaults");

    try {
      const result = await alertsAPI.createDefaultRules(token);
      toast({
        title: "Default rules created",
        description: `${result.total} default alert rules have been created.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Failed to create defaults",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const unacknowledgedEvents = events.filter((e) => !e.acknowledged_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bell className="h-8 w-8" />
            Alerts
          </h1>
          <p className="text-muted-foreground">
            Manage alert rules and view triggered alerts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rules</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rules.filter((r) => r.enabled).length}
            </div>
            <p className="text-xs text-muted-foreground">
              of {rules.length} total rules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unacknowledged</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unacknowledgedEvents.length}</div>
            <p className="text-xs text-muted-foreground">alerts pending review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-xs text-muted-foreground">in the last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.filter((e) => e.severity === "critical").length}
            </div>
            <p className="text-xs text-muted-foreground">critical alerts</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">
            Alert Events
            {unacknowledgedEvents.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unacknowledgedEvents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
        </TabsList>

        {/* Alert Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Alerts</CardTitle>
                  <CardDescription>
                    Alerts triggered by your monitoring rules
                  </CardDescription>
                </div>
                {unacknowledgedEvents.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAcknowledgeAll}
                    disabled={actionLoading === "ack-all"}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Acknowledge All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No alerts triggered yet</p>
                  <p className="text-sm">
                    Alerts will appear here when your rules are triggered
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => {
                    const config = severityConfig[event.severity];
                    const Icon = config.icon;
                    return (
                      <div
                        key={event.id}
                        className={`flex items-start gap-4 p-4 border rounded-lg ${
                          event.acknowledged_at ? "opacity-60" : config.bg
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}
                        >
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">
                              {event.rule_name || "Unknown Rule"}
                            </span>
                            <Badge variant={config.badge}>{event.severity}</Badge>
                            {event.action_taken && (
                              <Badge variant="outline">{event.action_taken}</Badge>
                            )}
                            {event.acknowledged_at && (
                              <Badge variant="secondary">Acknowledged</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {event.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {event.agent_role && (
                              <span>Agent: {event.agent_role}</span>
                            )}
                            {event.trace_id && (
                              <span className="font-mono">
                                Trace: {event.trace_id.slice(0, 8)}...
                              </span>
                            )}
                            <span>{formatRelativeTime(event.created_at)}</span>
                          </div>
                        </div>
                        {!event.acknowledged_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAcknowledge(event.id)}
                            disabled={actionLoading === event.id}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alert Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alert Rules</CardTitle>
                  <CardDescription>
                    Configure rules to detect anomalies and trigger alerts
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {rules.length === 0 && (
                    <Button
                      variant="outline"
                      onClick={handleCreateDefaults}
                      disabled={actionLoading === "defaults"}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Create Defaults
                    </Button>
                  )}
                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        New Rule
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Create Alert Rule</DialogTitle>
                        <DialogDescription>
                          Define conditions that will trigger an alert
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">Rule Name</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            placeholder="e.g., High Error Rate"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            value={formData.description || ""}
                            onChange={(e) =>
                              setFormData({ ...formData, description: e.target.value })
                            }
                            placeholder="Optional description"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="rule_type">Rule Type</Label>
                          <Select
                            value={formData.rule_type}
                            onValueChange={(value) =>
                              setFormData({ ...formData, rule_type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="repeated_calls">
                                Repeated Tool Calls
                              </SelectItem>
                              <SelectItem value="error_rate">High Error Rate</SelectItem>
                              <SelectItem value="rate_limit">Rate Limit</SelectItem>
                              <SelectItem value="long_running">Long Running</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="threshold">Threshold</Label>
                            <Input
                              id="threshold"
                              type="number"
                              value={formData.config.threshold || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  config: {
                                    ...formData.config,
                                    threshold: parseInt(e.target.value) || undefined,
                                  },
                                })
                              }
                              placeholder="10"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="window">Window (seconds)</Label>
                            <Input
                              id="window"
                              type="number"
                              value={formData.config.window_seconds || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  config: {
                                    ...formData.config,
                                    window_seconds:
                                      parseInt(e.target.value) || undefined,
                                  },
                                })
                              }
                              placeholder="30"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="action">Action</Label>
                          <Select
                            value={formData.action}
                            onValueChange={(value) =>
                              setFormData({ ...formData, action: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="alert">Alert Only</SelectItem>
                              <SelectItem value="kill">Kill Agent</SelectItem>
                              <SelectItem value="alert_and_kill">
                                Alert & Kill
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateRule}
                          disabled={actionLoading === "create" || !formData.name}
                        >
                          Create Rule
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No alert rules configured</p>
                  <p className="text-sm">
                    Create a rule to start monitoring for anomalies
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const typeConfig =
                      ruleTypeConfig[rule.rule_type as keyof typeof ruleTypeConfig] ||
                      ruleTypeConfig.custom;
                    const TypeIcon = typeConfig.icon;
                    return (
                      <div
                        key={rule.id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          !rule.enabled ? "opacity-60 bg-muted/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <TypeIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{rule.name}</span>
                              <Badge variant="outline">{typeConfig.label}</Badge>
                              <Badge
                                variant={
                                  rule.action === "kill"
                                    ? "destructive"
                                    : rule.action === "alert_and_kill"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {rule.action}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {rule.description ||
                                `Threshold: ${rule.config.threshold || rule.config.max_calls || "N/A"}, Window: ${rule.config.window_seconds || "N/A"}s`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`enable-${rule.id}`} className="text-sm">
                              {rule.enabled ? "Enabled" : "Disabled"}
                            </Label>
                            <Switch
                              id={`enable-${rule.id}`}
                              checked={rule.enabled}
                              onCheckedChange={(checked) =>
                                handleUpdateRule(rule.id, { enabled: checked })
                              }
                              disabled={actionLoading === rule.id}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            disabled={actionLoading === rule.id}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
