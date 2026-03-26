"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations('Documents');
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
          <DialogTitle>{t('contract.title')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('contract.loading')}</p>
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
                {t('contract.client', { name: summary.client })}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted p-2 rounded">
                <div className="text-muted-foreground text-xs">{t('contract.totalObligations')}</div>
                <div className="font-medium">{summary.totalObligations}</div>
              </div>
              <div className="bg-muted p-2 rounded">
                <div className="text-muted-foreground text-xs">{t('contract.overdue')}</div>
                <div className="font-medium text-destructive">{summary.overdueCount}</div>
              </div>
            </div>

            {summary.nextDeadline && (
              <p className="text-sm text-muted-foreground">
                {t('contract.nextDeadline', { date: new Date(summary.nextDeadline).toLocaleDateString() })}
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
                    if (action.confirmKey && !confirm(t(action.confirmKey))) return;
                    executeAction(action.value);
                  }}
                >
                  {t(action.labelKey)}
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
                {t('contract.viewAllObligations')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {t('contract.close')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('contract.notFound')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getAvailableActions(status: string) {
  switch (status) {
    case "unsigned":
      return [
        { value: "sign", labelKey: "contract.signContract" as const, variant: "default", confirmKey: null },
      ];
    case "signed":
      return [
        { value: "activate", labelKey: "contract.activate" as const, variant: "default", confirmKey: null },
      ];
    case "active":
      return [
        { value: "terminate", labelKey: "contract.terminate" as const, variant: "destructive", confirmKey: "contract.terminateConfirm" as const },
      ];
    case "terminated":
      return [];
    default:
      return [];
  }
}
