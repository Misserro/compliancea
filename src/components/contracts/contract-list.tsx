"use client";

import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/types";
import { ContractCard } from "./contract-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractListProps {
  /** All contracts (fetched by parent) */
  contracts: Contract[];
  /** Whether contracts are currently loading */
  loading: boolean;
  searchQuery: string;
  selectedStatuses: string[];
  selectedContractId?: number | null;
  onSelectContract?: (contractId: number | null, contractName: string | null) => void;
  /** Signal parent to re-fetch contracts */
  onRefresh?: () => void;
  /** Multi-select: set of selected contract IDs */
  selectedIds?: Set<number>;
  /** Multi-select: toggle a single contract's selection */
  onToggleSelect?: (contractId: number) => void;
  /** Multi-select: select all currently visible (filtered) contracts */
  onSelectAllVisible?: (ids: number[]) => void;
  /** Multi-select: clear all selections */
  onClearSelection?: () => void;
}

export function ContractList({
  contracts,
  loading,
  searchQuery,
  selectedStatuses,
  selectedContractId,
  onSelectContract,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
}: ContractListProps) {
  const t = useTranslations("Contracts");

  const q = searchQuery.trim().toLowerCase();
  const filteredContracts = contracts
    .filter((c) => selectedStatuses.includes(c.status))
    .filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.contracting_vendor ?? "").toLowerCase().includes(q) ||
        (c.client ?? "").toLowerCase().includes(q)
      );
    });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("noContracts")}</p>
        <p className="text-sm mt-1">{t("noContractsHint")}</p>
      </div>
    );
  }

  if (filteredContracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("noMatchingContracts")}</p>
      </div>
    );
  }

  const allVisibleSelected = selectedIds != null && filteredContracts.length > 0 && filteredContracts.every((c) => selectedIds.has(c.id));
  const someVisibleSelected = selectedIds != null && filteredContracts.some((c) => selectedIds.has(c.id));

  return (
    <div className="space-y-4">
      {onToggleSelect && filteredContracts.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectAllVisible?.(filteredContracts.map((c) => c.id));
              } else {
                onClearSelection?.();
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            {allVisibleSelected
              ? t("deselectAll")
              : t("selectAll", { count: filteredContracts.length })}
          </span>
        </div>
      )}
      {filteredContracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          onContractUpdate={() => {
            onRefresh?.();
            onClearSelection?.();
          }}
          isSelected={selectedContractId === contract.id}
          onSelect={onSelectContract}
          isMultiSelected={selectedIds?.has(contract.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
