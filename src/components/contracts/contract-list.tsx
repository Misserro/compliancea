"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/types";
import { ContractCard } from "./contract-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractListProps {
  /** Increment to trigger a re-fetch of the contract list */
  refreshTrigger?: number;
  searchQuery: string;
  selectedStatuses: string[];
  selectedContractId?: number | null;
  onSelectContract?: (contractId: number | null, contractName: string | null) => void;
}

export function ContractList({
  refreshTrigger,
  searchQuery,
  selectedStatuses,
  selectedContractId,
  onSelectContract,
}: ContractListProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardRefresh, setCardRefresh] = useState(0);
  const t = useTranslations("Contracts");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
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
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger, cardRefresh, t]);

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

  return (
    <div className="space-y-4">
      {filteredContracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          onContractUpdate={() => setCardRefresh((n) => n + 1)}
          isSelected={selectedContractId === contract.id}
          onSelect={onSelectContract}
        />
      ))}
    </div>
  );
}
