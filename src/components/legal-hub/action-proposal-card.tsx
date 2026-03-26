"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface ActionItem {
  tool: string;
  params: Record<string, unknown>;
  label: string;
}

export interface ActionProposal {
  type: "action_proposal";
  proposalText: string;
  actions: ActionItem[];
}

interface ActionProposalCardProps {
  proposal: ActionProposal;
  caseId: number;
  onApplied: () => void;
  onRejected: () => void;
}

export function ActionProposalCard({
  proposal,
  caseId,
  onApplied,
  onRejected,
}: ActionProposalCardProps) {
  const t = useTranslations('LegalHub');
  const tCommon = useTranslations('Common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [rejected, setRejected] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/actions/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions: proposal.actions }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('actionProposal.applyError'));
        return;
      }
      setApplied(true);
      onApplied();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('actionProposal.networkError')
      );
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setRejected(true);
    onRejected();
  }

  return (
    <Card className="bg-muted/30 py-3 gap-3">
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {proposal.proposalText}
        </p>
        <Separator />
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t('actionProposal.proposedChanges')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {proposal.actions.map((action, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {action.label}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        {applied ? (
          <p className="text-xs text-green-700 dark:text-green-400">
            {t('actionProposal.changesApplied')}
          </p>
        ) : rejected ? (
          <p className="text-xs text-muted-foreground">
            {t('actionProposal.proposalRejected')}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('actionProposal.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
              >
                {tCommon('cancel')}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
