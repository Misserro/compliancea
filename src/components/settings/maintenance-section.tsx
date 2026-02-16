"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function MaintenanceSection() {
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/maintenance/status")
      .then((r) => r.json())
      .then((data) => setLastRun(data.lastRun || null))
      .catch(() => {});
  }, []);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/maintenance/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.skipped) {
          setResult(`Skipped: ${data.reason}`);
        } else {
          setResult(`Completed at ${data.completedAt}`);
          setLastRun(data.completedAt);
        }
        toast.success("Maintenance cycle complete");
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Maintenance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastRun && (
          <p className="text-sm text-muted-foreground">
            Last run: {new Date(lastRun).toLocaleString()}
          </p>
        )}

        <Button onClick={handleRun} disabled={running} variant="outline">
          {running ? "Running..." : "Run Maintenance Cycle"}
        </Button>

        {result && (
          <p className="text-sm text-muted-foreground">{result}</p>
        )}
      </CardContent>
    </Card>
  );
}
