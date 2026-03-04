"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { tracesAPI, type MetricsSummary } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  Calendar,
  CreditCard,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// Mock usage data
const mockDailyUsage = [
  { date: "Mon", events: 12000, traces: 45 },
  { date: "Tue", events: 19000, traces: 62 },
  { date: "Wed", events: 15000, traces: 51 },
  { date: "Thu", events: 22000, traces: 78 },
  { date: "Fri", events: 18000, traces: 65 },
  { date: "Sat", events: 8000, traces: 28 },
  { date: "Sun", events: 5000, traces: 18 },
];

const mockMonthlyUsage = [
  { month: "Jan", events: 120000 },
  { month: "Feb", events: 180000 },
  { month: "Mar", events: 150000 },
  { month: "Apr", events: 220000 },
  { month: "May", events: 280000 },
  { month: "Jun", events: 250000 },
];

export default function UsagePage() {
  const token = useAuthStore((state) => state.token);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      if (!token) return;

      try {
        const data = await tracesAPI.getMetrics(token);
        setMetrics(data);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [token]);

  // Calculate mock billing
  const currentMonthEvents = 128470;
  const includedEvents = 100000;
  const overageEvents = Math.max(0, currentMonthEvents - includedEvents);
  const overageCost = (overageEvents / 1000) * 0.5;
  const baseCost = 29;
  const totalCost = baseCost + overageCost;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-8 w-8" />
          Usage & Billing
        </h1>
        <p className="text-muted-foreground">
          Track your usage and manage your subscription
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            <Badge variant="default" className="text-lg px-4 py-1">
              Starter
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Price</p>
              <p className="text-2xl font-bold">$29</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Included Events</p>
              <p className="text-2xl font-bold">100K</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overage Rate</p>
              <p className="text-2xl font-bold">$0.50/1K</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billing Period</p>
              <p className="text-2xl font-bold">Monthly</p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t flex justify-between items-center">
            <p className="text-muted-foreground">
              Need more events? Upgrade to Pro for better rates.
            </p>
            <Button variant="outline">
              <CreditCard className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Month Usage */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Events This Month</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(currentMonthEvents)}</p>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{formatNumber(currentMonthEvents)} / {formatNumber(includedEvents)}</span>
                <span>{Math.round((currentMonthEvents / includedEvents) * 100)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (currentMonthEvents / includedEvents) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Traces This Month</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics?.total_traces || 347)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Avg {Math.round(currentMonthEvents / (metrics?.total_traces || 347))} events/trace
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Days Remaining</span>
            </div>
            <p className="text-2xl font-bold">12</p>
            <p className="text-xs text-muted-foreground mt-2">
              Billing resets Mar 1
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">Estimated Bill</span>
            </div>
            <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              ${baseCost} base + ${overageCost.toFixed(2)} overage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Usage</CardTitle>
            <CardDescription>Events per day this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockDailyUsage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), "Events"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Trend</CardTitle>
            <CardDescription>Events per month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockMonthlyUsage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), "Events"]}
                  />
                  <Bar
                    dataKey="events"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Tiers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Plans</CardTitle>
          <CardDescription>Choose the plan that fits your needs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <PricingTier
              name="Free"
              price="$0"
              events="10K"
              features={["Basic tracing", "7-day retention", "Email support"]}
              current={false}
            />
            <PricingTier
              name="Starter"
              price="$29"
              events="100K"
              features={[
                "Full tracing",
                "30-day retention",
                "Kill switch",
                "Anomaly detection",
              ]}
              current={true}
            />
            <PricingTier
              name="Pro"
              price="$99"
              events="1M"
              features={[
                "Everything in Starter",
                "90-day retention",
                "API access",
                "Priority support",
              ]}
              current={false}
              recommended={true}
            />
            <PricingTier
              name="Enterprise"
              price="Custom"
              events="Unlimited"
              features={[
                "Everything in Pro",
                "Custom retention",
                "SSO",
                "Dedicated support",
              ]}
              current={false}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingTier({
  name,
  price,
  events,
  features,
  current,
  recommended,
}: {
  name: string;
  price: string;
  events: string;
  features: string[];
  current: boolean;
  recommended?: boolean;
}) {
  return (
    <div
      className={`p-6 rounded-lg border ${
        current
          ? "border-primary bg-primary/5"
          : recommended
          ? "border-primary/50"
          : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{name}</h3>
        {current && <Badge>Current</Badge>}
        {recommended && !current && (
          <Badge variant="secondary">Recommended</Badge>
        )}
      </div>
      <p className="text-3xl font-bold mb-1">{price}</p>
      <p className="text-sm text-muted-foreground mb-4">{events} events/month</p>
      <ul className="space-y-2 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <span className="w-1 h-1 bg-primary rounded-full" />
            {feature}
          </li>
        ))}
      </ul>
      {!current && (
        <Button
          variant={recommended ? "default" : "outline"}
          className="w-full mt-4"
          size="sm"
        >
          {name === "Enterprise" ? "Contact Sales" : "Upgrade"}
        </Button>
      )}
    </div>
  );
}
