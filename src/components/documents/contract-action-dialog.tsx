"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import type { ContractSummary } from "@/lib/types";

interface ContractActionDialogProps {
  docId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToObligations: () => void;
  onRefreshDocuments: () => void;
}

export function ContractActionDialog({
  docId,
  open,
  onOpenChange,
  onNavigateToObligations,
  onRefreshDocuments,
}: ContractActionDialogProps) {
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (docId && open) {
      setLoading(true);
      setResult(null);
      fetch(`/api/documents/${docId}/contract-summary`)
        .then((r) => r.json())
        .then((data) => setSummary(data))
        .catch(() => setSummary(null))
        .finally(() => setLoading(false));
    }
  }, [docId, open]);

  async function executeAction(action: string) {
    if (!docId) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/documents/${docId}/contract-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.message);
        // Refresh summary
        const sumRes = await fetch(`/api/documents/${docId}/contract-summary`);
        if (sumRes.ok) setSummary(await sumRes.json());
        onRefreshDocuments();
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setExecuting(false);
    }
  }

  const status = summary?.status || "unsigned";
  const actions = getAvailableActions(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contract Management</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : summary ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">{summary.name}</span>
              <Badge className={STATUS_COLORS[status]}>
                {status}
              </Badge>
            </div>

            {summary.client && (
              <p className="text-sm text-muted-foreground">
                Client: {summary.client}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted p-2 rounded">
                <div className="text-muted-foreground text-xs">Total Obligations</div>
                <div className="font-medium">{summary.totalObligations}</div>
              </div>
              <div className="bg-muted p-2 rounded">
                <div className="text-muted-foreground text-xs">Overdue</div>
                <div className="font-medium text-destructive">{summary.overdueCount}</div>
              </div>
            </div>

            {summary.nextDeadline && (
              <p className="text-sm text-muted-foreground">
                Next deadline: {new Date(summary.nextDeadline).toLocaleDateString()}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.value}
                  variant={action.variant as "default" | "destructive" | "outline"}
                  size="sm"
                  disabled={executing}
                  onClick={() => {
                    if (action.confirm && !confirm(action.confirm)) return;
                    executeAction(action.value);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>

            {result && (
              <p className={`text-sm ${result.startsWith("Error") ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                {result}
              </p>
            )}

            <div className="flex justify-between pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onNavigateToObligations();
                }}
              >
                View All Obligations
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Contract not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getAvailableActions(status: string) {
  switch (status) {
    case "unsigned":
      return [
        { value: "sign", label: "Sign Contract", variant: "default", confirm: null },
      ];
    case "signed":
      return [
        { value: "activate", label: "Activate", variant: "default", confirm: null },
      ];
    case "active":
      return [
        { value: "terminate", label: "Terminate", variant: "destructive", confirm: "Are you sure you want to terminate this contract?" },
      ];
    case "terminated":
      return [];
    default:
      return [];
  }
}
