const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchAPI<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Auth API
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  company?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  created_at: string;
}

export const authAPI = {
  login: (data: LoginRequest) =>
    fetchAPI<TokenResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  register: (data: RegisterRequest) =>
    fetchAPI<TokenResponse>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: (token: string) =>
    fetchAPI<User>("/v1/auth/me", { token }),
};

// API Keys
export interface APIKey {
  id: string;
  prefix: string;
  name: string | null;
  environment: string;
  created_at: string;
  last_used_at: string | null;
}

export interface APIKeyCreated extends APIKey {
  key: string;
}

export const keysAPI = {
  list: (token: string) =>
    fetchAPI<{ keys: APIKey[] }>("/v1/auth/keys", { token }),

  create: (token: string, data: { name?: string; environment?: string }) =>
    fetchAPI<APIKeyCreated>("/v1/auth/keys", {
      token,
      method: "POST",
      body: JSON.stringify(data),
    }),

  revoke: (token: string, keyId: string) =>
    fetchAPI<void>(`/v1/auth/keys/${keyId}`, {
      token,
      method: "DELETE",
    }),
};

// Traces
export interface TraceSummary {
  trace_id: string;
  project_name: string;
  environment: string;
  started_at: string;
  ended_at: string | null;
  status: "running" | "completed" | "failed";
  event_count: number;
  agent_count: number;
  error_count: number;
  duration_ms: number | null;
}

export interface TraceEvent {
  event_id: string;
  trace_id: string;
  event_type: string;
  timestamp: string;
  agent_role: string | null;
  tool_name: string | null;
  duration_ms: number | null;
  error: boolean;
  error_message: string | null;
}

export interface TraceDetail {
  trace_id: string;
  project_name: string;
  environment: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  events: TraceEvent[];
  agents: string[];
  tools_used: string[];
  error_count: number;
}

export interface MetricsSummary {
  total_traces: number;
  total_events: number;
  total_errors: number;
  avg_duration_ms: number | null;
  active_agents: number;
  top_tools: { name: string; count: number }[];
}

export const tracesAPI = {
  list: (token: string, params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return fetchAPI<{ traces: TraceSummary[]; total: number }>(`/v1/traces${query}`, {
      token,
    });
  },

  get: (token: string, traceId: string) =>
    fetchAPI<TraceDetail>(`/v1/traces/${traceId}`, { token }),

  getEvents: (token: string, traceId: string) =>
    fetchAPI<TraceEvent[]>(`/v1/traces/${traceId}/events`, { token }),

  getMetrics: (token: string) =>
    fetchAPI<MetricsSummary>("/v1/traces/metrics/summary", { token }),

  getAgents: (token: string) =>
    fetchAPI<string[]>("/v1/traces/agents", { token }),

  getTools: (token: string) =>
    fetchAPI<string[]>("/v1/traces/tools", { token }),
};

// Control (Kill Switch)
export interface AgentStatus {
  agent_role: string;
  trace_id: string | null;
  killed: boolean;
  killed_at: string | null;
}

export const controlAPI = {
  kill: (token: string, agentRole: string, traceId?: string) =>
    fetchAPI<{ status: string; message: string }>("/v1/control/kill", {
      token,
      method: "POST",
      body: JSON.stringify({ agent_role: agentRole, trace_id: traceId }),
    }),

  resume: (token: string, agentRole: string, traceId?: string) =>
    fetchAPI<{ status: string; message: string }>("/v1/control/resume", {
      token,
      method: "POST",
      body: JSON.stringify({ agent_role: agentRole, trace_id: traceId }),
    }),

  getStatus: (token: string) =>
    fetchAPI<{ agents: AgentStatus[] }>("/v1/control/status", { token }),

  clearAll: (token: string) =>
    fetchAPI<void>("/v1/control/all-kills", {
      token,
      method: "DELETE",
    }),
};

// Alerts
export interface AlertRuleConfig {
  threshold?: number;
  window_seconds?: number;
  tool_name?: string;
  max_calls?: number;
  max_duration_ms?: number;
}

export interface NotificationConfig {
  email?: { enabled?: boolean; email?: string };
  slack?: { enabled?: boolean; webhook_url?: string };
  webhook?: { enabled?: boolean; url?: string; headers?: Record<string, string> };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  rule_type: "repeated_calls" | "error_rate" | "rate_limit" | "long_running" | "custom";
  config: AlertRuleConfig;
  action: "alert" | "kill" | "alert_and_kill";
  notifications: NotificationConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: string;
  alert_rule_id: string;
  rule_name: string | null;
  trace_id: string | null;
  agent_role: string | null;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  action_taken: string | null;
  context: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
}

export interface CreateAlertRuleRequest {
  name: string;
  description?: string;
  rule_type: string;
  config: AlertRuleConfig;
  action?: string;
  notifications?: NotificationConfig;
}

export interface UpdateAlertRuleRequest {
  name?: string;
  description?: string;
  config?: AlertRuleConfig;
  action?: string;
  notifications?: NotificationConfig;
  enabled?: boolean;
}

export const alertsAPI = {
  listRules: (token: string) =>
    fetchAPI<{ rules: AlertRule[]; total: number }>("/v1/alerts/rules", { token }),

  getRule: (token: string, ruleId: string) =>
    fetchAPI<AlertRule>(`/v1/alerts/rules/${ruleId}`, { token }),

  createRule: (token: string, data: CreateAlertRuleRequest) =>
    fetchAPI<AlertRule>("/v1/alerts/rules", {
      token,
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRule: (token: string, ruleId: string, data: UpdateAlertRuleRequest) =>
    fetchAPI<AlertRule>(`/v1/alerts/rules/${ruleId}`, {
      token,
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteRule: (token: string, ruleId: string) =>
    fetchAPI<void>(`/v1/alerts/rules/${ruleId}`, {
      token,
      method: "DELETE",
    }),

  createDefaultRules: (token: string) =>
    fetchAPI<{ rules: AlertRule[]; total: number }>("/v1/alerts/rules/create-defaults", {
      token,
      method: "POST",
    }),

  listEvents: (token: string, params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    return fetchAPI<{ events: AlertEvent[]; total: number }>(`/v1/alerts/events${query}`, {
      token,
    });
  },

  acknowledgeEvent: (token: string, eventId: string) =>
    fetchAPI<void>(`/v1/alerts/events/${eventId}/acknowledge`, {
      token,
      method: "POST",
    }),

  acknowledgeAll: (token: string) =>
    fetchAPI<void>("/v1/alerts/events/acknowledge-all", {
      token,
      method: "POST",
    }),
};
