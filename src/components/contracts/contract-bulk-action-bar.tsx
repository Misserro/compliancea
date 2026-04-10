"use client";

import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/types";
import { CONTRACT_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ProcessingProgressContent,
  type ProcessingProgress,
} from "@/components/ui/processing-progress-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ContractBulkActionBarProps {
  selectedCount: number;
  selectedContracts: Contract[];
  onStatusChange: (targetStatus: string) => void;
  onProcess: () => void;
  onClear: () => void;
  processingProgress: ProcessingProgress | null;
  statusChangeInProgress: boolean;
  selectResetKey?: number;
}

export function ContractBulkActionBar({
  selectedCount,
  onStatusChange,
  onProcess,
  onClear,
  processingProgress,
  statusChangeInProgress,
  selectResetKey,
}: ContractBulkActionBarProps) {
  const t = useTranslations("Contracts");

  const isVisible = selectedCount > 0 || processingProgress?.active;
  const isProcessing = processingProgress?.active ?? false;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-4xl px-4 pb-4">
        <div className="rounded-lg border bg-background shadow-lg p-4">
          {isProcessing && processingProgress ? (
            /* ── Progress mode ── */
            <ProcessingProgressContent
              processingProgress={processingProgress}
              label={t("processingProgress", {
                current: processingProgress.current,
                total: processingProgress.total,
                name: processingProgress.currentName,
              })}
            />
          ) : (
            /* ── Action mode ── */
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {t("bulkSelectedCount", { count: selectedCount })}
              </Badge>

              <Select
                key={selectResetKey}
                onValueChange={onStatusChange}
                disabled={statusChangeInProgress}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("changeStatus")} />
                </SelectTrigger>
                <SelectContent side="top">
                  {CONTRACT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`contractStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                onClick={onProcess}
                disabled={statusChangeInProgress || selectedCount === 0}
              >
                {t("processSelected")}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={statusChangeInProgress}
              >
                {t("clearSelection")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
