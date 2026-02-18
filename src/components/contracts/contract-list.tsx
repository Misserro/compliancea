"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Contract, Obligation } from "@/lib/types";
import { ContractCard } from "./contract-card";

interface ContractListProps {
  refreshTrigger?: number;
}

export function ContractList({ refreshTrigger }: ContractListProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractObligations, setContractObligations] = useState<Record<number, Obligation[]>>({});
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

  const loadContractObligations = async (contractId: number) => {
    try {
      const res = await fetch(`/api/documents/${contractId}/obligations`);
      if (res.ok) {
        const data = await res.json();
        setContractObligations((prev) => ({
          ...prev,
          [contractId]: data.obligations || [],
        }));
      }
    } catch (err) {
      console.error("Failed to load obligations:", err);
    }
  };

  useEffect(() => {
    loadContracts();
  }, [refreshTrigger]);

  // Load obligations for each contract
  useEffect(() => {
    contracts.forEach((contract) => {
      if (!contractObligations[contract.id]) {
        loadContractObligations(contract.id);
      }
    });
  }, [contracts]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading contracts...</div>;
  }

  if (contracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No contracts found.</p>
        <p className="text-sm mt-1">
          Upload contract documents to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          obligations={contractObligations[contract.id] || []}
          onObligationUpdate={() => {
            loadContractObligations(contract.id);
            loadContracts();
          }}
          onContractUpdate={() => {
            loadContracts();
            loadContractObligations(contract.id);
          }}
        />
      ))}
    </div>
  );
}
