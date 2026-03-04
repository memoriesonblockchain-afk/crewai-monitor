"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/store";
import { keysAPI, type APIKey, type APIKeyCreated } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime, getRelativeTime } from "@/lib/utils";
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
} from "lucide-react";

export default function APIKeysPage() {
  const token = useAuthStore((state) => state.token);
  const { toast } = useToast();

  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<"live" | "test">("live");
  const [newKey, setNewKey] = useState<APIKeyCreated | null>(null);
  const [showNewKey, setShowNewKey] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    if (!token) return;

    try {
      const data = await keysAPI.list(token);
      setKeys(data.keys);
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    setCreating(true);

    try {
      const created = await keysAPI.create(token, {
        name: newKeyName || undefined,
        environment: newKeyEnv,
      });
      setNewKey(created);
      setNewKeyName("");
      await fetchKeys();
      toast({
        title: "API key created",
        description: "Make sure to copy your key now. You won't be able to see it again!",
      });
    } catch (error) {
      toast({
        title: "Failed to create API key",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string, keyPrefix: string) => {
    if (!token) return;

    if (!confirm(`Are you sure you want to revoke the key ${keyPrefix}...? This cannot be undone.`)) {
      return;
    }

    try {
      await keysAPI.revoke(token, keyId);
      toast({
        title: "API key revoked",
        description: "The key can no longer be used.",
      });
      await fetchKeys();
    } catch (error) {
      toast({
        title: "Failed to revoke API key",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied to clipboard",
      description: "API key has been copied.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Key className="h-8 w-8" />
          API Keys
        </h1>
        <p className="text-muted-foreground">
          Manage your API keys for the CrewAI Monitor SDK
        </p>
      </div>

      {/* Create New Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create New API Key</CardTitle>
          <CardDescription>
            Generate a new key to use with the crewai-monitor SDK
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="key-name">Key Name (optional)</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production Server"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <div className="flex gap-2">
                <Button
                  variant={newKeyEnv === "live" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewKeyEnv("live")}
                >
                  Live
                </Button>
                <Button
                  variant={newKeyEnv === "test" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewKeyEnv("test")}
                >
                  Test
                </Button>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? "Creating..." : "Create Key"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* New Key Display */}
      {newKey && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check className="h-5 w-5" />
              New API Key Created
            </CardTitle>
            <CardDescription>
              Copy this key now. You won&apos;t be able to see it again!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-white dark:bg-zinc-900 rounded border font-mono text-sm">
                {showNewKey ? newKey.key : "•".repeat(newKey.key.length)}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowNewKey(!showNewKey)}
              >
                {showNewKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(newKey.key)}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => setNewKey(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Existing Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your API Keys</CardTitle>
          <CardDescription>
            {keys.length} {keys.length === 1 ? "key" : "keys"} created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Key className="h-8 w-8 animate-pulse text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Create your first key to start monitoring</p>
            </div>
          ) : (
            <div className="divide-y">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm">{key.prefix}...</code>
                        <Badge
                          variant={key.environment === "live" ? "default" : "secondary"}
                        >
                          {key.environment}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {key.name || "Unnamed key"} • Created{" "}
                        {getRelativeTime(key.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm text-muted-foreground">
                      {key.last_used_at ? (
                        <>
                          <p>Last used</p>
                          <p>{getRelativeTime(key.last_used_at)}</p>
                        </>
                      ) : (
                        <p>Never used</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(key.id, key.prefix)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Start</CardTitle>
          <CardDescription>
            Add monitoring to your CrewAI application in one line
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-zinc-100 overflow-x-auto">
            <pre>{`import crewai_monitor

# Initialize at startup
crewai_monitor.init(api_key="YOUR_API_KEY_HERE")

# Your CrewAI code - automatically traced!
crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
