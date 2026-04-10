"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/types";
import { ContractList } from "./contract-list";
import { ContractChatPanel } from "./contract-chat-panel";
import { ContractBulkActionBar } from "./contract-bulk-action-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type ProcessingProgress } from "@/components/ui/processing-progress-bar";
import { CONTRACT_STATUSES, CONTRACT_STATUS_ACTION_MAP } from "@/lib/constants";

export function ContractsTab() {
  const t = useTranslations("Contracts");

  // ── Contract data (lifted from ContractList) ──
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setContractsLoading(true);
    fetch("/api/contracts", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(t("loadError"));
        return res.json();
      })
      .then((data) => {
        setContracts(data.contracts || []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : t("errorLoading"));
      })
      .finally(() => {
        setContractsLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger, t]);

  const refreshContracts = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  // ── Search & filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    [...CONTRACT_STATUSES]
  );

  // ── Chat panel state ──
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedContractName, setSelectedContractName] = useState<string | null>(null);

  // ── Multi-select state for bulk actions ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Bulk action state (Task 2 creates state; Tasks 3 & 4 fill handlers) ──
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [statusChangeInProgress, setStatusChangeInProgress] = useState(false);
  const [selectResetKey, setSelectResetKey] = useState(0);

  // Derive selected Contract objects from IDs
  const selectedContracts = useMemo(
    () => contracts.filter((c) => selectedIds.has(c.id)),
    [contracts, selectedIds]
  );

  // Bulk status change handler (Task 3)
  const handleBulkStatusChange = useCallback(async (targetStatus: string) => {
    if (selectedContracts.length === 0) return;

    // Partition contracts into actionable, already-at-target, and skipped
    const actionable: { contract: typeof selectedContracts[0]; action: string }[] = [];
    let alreadyAtTarget = 0;
    let skipped = 0;

    for (const contract of selectedContracts) {
      if (contract.status === targetStatus) {
        alreadyAtTarget++;
      } else {
        const action = CONTRACT_STATUS_ACTION_MAP[contract.status]?.[targetStatus];
        if (action) {
          actionable.push({ contract, action });
        } else {
          skipped++;
        }
      }
    }

    // If nothing to do, show appropriate toast and reset select
    if (actionable.length === 0) {
      if (alreadyAtTarget > 0) {
        toast.info(t("bulkStatusAlreadyTarget", { count: alreadyAtTarget }));
      } else {
        toast.info(t("bulkStatusSkipped", { updated: 0, skipped }));
      }
      setSelectResetKey((k) => k + 1);
      return;
    }

    setStatusChangeInProgress(true);

    let updated = 0;
    let failed = 0;

    for (const { contract, action } of actionable) {
      try {
        const res = await fetch(`/api/documents/${contract.id}/contract-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          updated++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setStatusChangeInProgress(false);
    refreshContracts();
    clearSelection();
    setSelectResetKey((k) => k + 1);

    // Build toast message
    const totalSkipped = skipped + alreadyAtTarget;
    if (failed > 0) {
      toast.warning(
        `${t("bulkStatusUpdated", { updated })} ${t("bulkStatusFailed", { failed })}`
      );
    } else if (totalSkipped > 0) {
      toast.success(t("bulkStatusSkipped", { updated, skipped: totalSkipped }));
    } else {
      toast.success(t("bulkStatusUpdated", { updated }));
    }
  }, [selectedContracts, t, refreshContracts, clearSelection]);

  // Batch processing handler (Task 4)
  const handleBatchProcess = useCallback(async () => {
    if (selectedContracts.length === 0) return;

    const total = selectedContracts.length;
    setProcessingProgress({ active: true, current: 0, total, currentName: "" });

    try {
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < selectedContracts.length; i++) {
        const contract = selectedContracts[i];
        setProcessingProgress({ active: true, current: i + 1, total, currentName: contract.name });

        try {
          const res = await fetch(`/api/documents/${contract.id}/process`, { method: "POST" });
          if (res.ok) {
            succeeded++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      if (failed > 0) {
        toast.warning(t("bulkProcessedWithFailures", { succeeded, total, failed }));
      } else {
        toast.success(t("bulkProcessed", { succeeded, total }));
      }
    } finally {
      setProcessingProgress(null);
      clearSelection();
      refreshContracts();
    }
  }, [selectedContracts, t, refreshContracts, clearSelection]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  function handleContractSelect(
    contractId: number | null,
    contractName: string | null
  ) {
    setSelectedContractId(contractId);
    setSelectedContractName(contractName);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t("allContracts")}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            {chatOpen ? t("closeChat") : t("askAI")}
          </Button>
        </div>
      </div>

      {/* Main layout: list (always visible) + optional chat panel */}
      <div className={chatOpen ? "grid grid-cols-2 gap-4 items-start" : undefined}>
        {/* Left column: search, filters, list */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {CONTRACT_STATUSES.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(key)}
                    onChange={() => toggleStatus(key)}
                    className="rounded border-input"
                  />
                  {t(`contractStatus.${key}`)}
                </label>
              ))}
            </div>
          </div>

          <ContractList
            contracts={contracts}
            loading={contractsLoading}
            searchQuery={searchQuery}
            selectedStatuses={selectedStatuses}
            selectedContractId={chatOpen ? selectedContractId : undefined}
            onSelectContract={chatOpen ? handleContractSelect : undefined}
            onRefresh={refreshContracts}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAllVisible={selectAllVisible}
            onClearSelection={clearSelection}
          />
        </div>

        {/* Right column: chat panel -- only rendered when chatOpen */}
        {chatOpen && (
          <div className="sticky top-6">
            <ContractChatPanel
              selectedContractId={selectedContractId}
              selectedContractName={selectedContractName}
              onClose={() => {
                setChatOpen(false);
                setSelectedContractId(null);
                setSelectedContractName(null);
              }}
            />
          </div>
        )}
      </div>

      {/* Bulk action bar -- fixed at bottom when contracts are selected */}
      <ContractBulkActionBar
        selectedCount={selectedIds.size}
        selectedContracts={selectedContracts}
        onStatusChange={handleBulkStatusChange}
        onProcess={handleBatchProcess}
        onClear={clearSelection}
        processingProgress={processingProgress}
        statusChangeInProgress={statusChangeInProgress}
        selectResetKey={selectResetKey}
      />
    </div>
  );
}
