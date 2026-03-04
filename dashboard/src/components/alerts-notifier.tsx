"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore, useAlertsStore } from "@/lib/store";
import { alertsAPI, type AlertEvent } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { Bell, AlertTriangle, AlertCircle, Info, XCircle } from "lucide-react";

const severityConfig = {
  info: {
    icon: Info,
    variant: "default" as const,
  },
  warning: {
    icon: AlertTriangle,
    variant: "default" as const,
  },
  error: {
    icon: AlertCircle,
    variant: "destructive" as const,
  },
  critical: {
    icon: XCircle,
    variant: "destructive" as const,
  },
};

export function AlertsNotifier() {
  const token = useAuthStore((state) => state.token);
  const {
    setUnacknowledgedCount,
    addRecentAlert,
    lastCheckedAt,
    setLastCheckedAt,
  } = useAlertsStore();
  const { toast } = useToast();
  const seenAlertIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const checkForNewAlerts = useCallback(async () => {
    if (!token) return;

    try {
      const response = await alertsAPI.listEvents(token, {
        acknowledged: "false",
        limit: "20",
      });

      const unacknowledged = response.events;
      setUnacknowledgedCount(unacknowledged.length);

      // Find new alerts we haven't seen yet
      const newAlerts = unacknowledged.filter(
        (alert) => !seenAlertIds.current.has(alert.id)
      );

      // Update seen alerts
      unacknowledged.forEach((alert) => seenAlertIds.current.add(alert.id));

      // Show toast for new alerts (skip on first load to avoid spam)
      if (!isFirstLoad.current && newAlerts.length > 0) {
        newAlerts.forEach((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;

          // Add to recent alerts store
          addRecentAlert({
            id: alert.id,
            ruleName: alert.rule_name || "Unknown Rule",
            message: alert.message,
            severity: alert.severity,
            createdAt: alert.created_at,
          });

          // Show toast notification
          toast({
            title: (
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{alert.rule_name || "Alert Triggered"}</span>
              </div>
            ) as unknown as string,
            description: alert.message,
            variant: config.variant,
            duration: alert.severity === "critical" ? 10000 : 5000,
          });
        });
      }

      isFirstLoad.current = false;
      setLastCheckedAt(new Date().toISOString());
    } catch (error) {
      console.error("Failed to check for new alerts:", error);
    }
  }, [token, setUnacknowledgedCount, addRecentAlert, setLastCheckedAt, toast]);

  useEffect(() => {
    if (!token) return;

    // Initial check
    checkForNewAlerts();

    // Poll every 10 seconds
    const interval = setInterval(checkForNewAlerts, 10000);

    return () => clearInterval(interval);
  }, [token, checkForNewAlerts]);

  // This component doesn't render anything visible
  return null;
}

// Badge component to show unread alert count
export function AlertsBadge() {
  const unacknowledgedCount = useAlertsStore(
    (state) => state.unacknowledgedCount
  );

  if (unacknowledgedCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
      {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
    </span>
  );
}
