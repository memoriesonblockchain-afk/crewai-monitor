"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import {
  Activity,
  Shield,
  Zap,
  Eye,
  AlertTriangle,
  BarChart3,
} from "lucide-react";

export default function HomePage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">CrewAI Monitor</span>
          </div>
          <nav className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost">Login</Button>
                </Link>
                <Link href="/register">
                  <Button>Get Started</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Monitor Your AI Agents
          <br />
          <span className="text-primary">In Real-Time</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Complete visibility into your CrewAI agents. Trace every action,
          detect anomalies, and stop runaway agents instantly with the kill switch.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="text-lg px-8">
              Start Free Trial
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="text-lg px-8">
              Documentation
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Eye className="h-8 w-8" />}
            title="Real-Time Tracing"
            description="Watch your agents work in real-time. See every tool call, LLM request, and decision as it happens."
          />
          <FeatureCard
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Anomaly Detection"
            description="Automatically detect infinite loops, repeated queries, and abnormal behavior patterns."
          />
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            title="Kill Switch"
            description="Stop any agent instantly with one click. Prevent runaway costs and unintended actions."
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Easy Integration"
            description="Just one line of code to start monitoring. Works with any CrewAI application."
          />
          <FeatureCard
            icon={<BarChart3 className="h-8 w-8" />}
            title="Analytics"
            description="Track performance, costs, and usage patterns. Optimize your agents with data."
          />
          <FeatureCard
            icon={<Activity className="h-8 w-8" />}
            title="Alerts"
            description="Get notified when something goes wrong. Email, Slack, and webhook integrations."
          />
        </div>
      </section>

      {/* Code Example */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">
            One Line Integration
          </h2>
          <div className="bg-zinc-900 rounded-lg p-6 text-sm font-mono text-zinc-100 overflow-x-auto">
            <pre>{`import crewai_monitor
from crewai import Crew, Agent, Task

# Add this single line to start monitoring
crewai_monitor.init(api_key="cm_live_xxxxx")

# Your existing code works unchanged
crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()  # Automatically traced!`}</pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Monitor Your Agents?</h2>
        <p className="text-muted-foreground mb-8">
          Start with 10,000 free events per month. No credit card required.
        </p>
        <Link href="/register">
          <Button size="lg" className="text-lg px-8">
            Get Started Free
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 CrewAI Monitor. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
