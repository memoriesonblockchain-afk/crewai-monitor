import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  setAuth: (token: string, user: AuthState["user"]) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => !!get().token,
    }),
    {
      name: "crewai-monitor-auth",
    }
  )
);

interface DashboardState {
  selectedTraceId: string | null;
  autoRefresh: boolean;
  refreshInterval: number;
  setSelectedTrace: (traceId: string | null) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
}

export const useDashboardStore = create<DashboardState>()((set) => ({
  selectedTraceId: null,
  autoRefresh: true,
  refreshInterval: 5000,
  setSelectedTrace: (traceId) => set({ selectedTraceId: traceId }),
  setAutoRefresh: (enabled) => set({ autoRefresh: enabled }),
  setRefreshInterval: (interval) => set({ refreshInterval: interval }),
}));

interface KillSwitchState {
  killedAgents: Set<string>;
  addKilledAgent: (agentRole: string) => void;
  removeKilledAgent: (agentRole: string) => void;
  clearKilledAgents: () => void;
  isAgentKilled: (agentRole: string) => boolean;
}

export const useKillSwitchStore = create<KillSwitchState>()((set, get) => ({
  killedAgents: new Set(),
  addKilledAgent: (agentRole) =>
    set((state) => {
      const newSet = new Set(Array.from(state.killedAgents));
      newSet.add(agentRole);
      return { killedAgents: newSet };
    }),
  removeKilledAgent: (agentRole) =>
    set((state) => {
      const newSet = new Set(Array.from(state.killedAgents));
      newSet.delete(agentRole);
      return { killedAgents: newSet };
    }),
  clearKilledAgents: () => set({ killedAgents: new Set() }),
  isAgentKilled: (agentRole) => get().killedAgents.has(agentRole),
}));

interface AlertNotification {
  id: string;
  ruleName: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  createdAt: string;
}

interface AlertsState {
  unacknowledgedCount: number;
  recentAlerts: AlertNotification[];
  lastCheckedAt: string | null;
  setUnacknowledgedCount: (count: number) => void;
  addRecentAlert: (alert: AlertNotification) => void;
  clearRecentAlerts: () => void;
  setLastCheckedAt: (timestamp: string) => void;
}

export const useAlertsStore = create<AlertsState>()((set) => ({
  unacknowledgedCount: 0,
  recentAlerts: [],
  lastCheckedAt: null,
  setUnacknowledgedCount: (count) => set({ unacknowledgedCount: count }),
  addRecentAlert: (alert) =>
    set((state) => ({
      recentAlerts: [alert, ...state.recentAlerts].slice(0, 10), // Keep last 10
    })),
  clearRecentAlerts: () => set({ recentAlerts: [] }),
  setLastCheckedAt: (timestamp) => set({ lastCheckedAt: timestamp }),
}));
