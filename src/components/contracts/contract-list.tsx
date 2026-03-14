"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { ContractCard } from "./contract-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractListProps {
  refreshTrigger?: number;
}

export function ContractList({ refreshTrigger }: ContractListProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const loadContracts = async () => {
    try {
      const res = await fetch("/api/contracts");
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      } else {
        toast.error("Failed to load contracts");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, [refreshTrigger]);

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
          onContractUpdate={loadContracts}
        />
      ))}
    </div>
  );
}
