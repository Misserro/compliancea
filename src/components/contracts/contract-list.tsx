"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { ContractCard } from "./contract-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractListProps {
  /** Increment to trigger a re-fetch of the contract list */
  refreshTrigger?: number;
}

export function ContractList({ refreshTrigger }: ContractListProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardRefresh, setCardRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    fetch("/api/contracts", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load contracts");
        return res.json();
      })
      .then((data) => {
        setContracts(data.contracts || []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Error loading contracts");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger, cardRefresh]);

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
        <p>No contracts found.</p>
        <p className="text-sm mt-1">Use "Add New Contract" to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          onContractUpdate={() => setCardRefresh((n) => n + 1)}
        />
      ))}
    </div>
  );
}
