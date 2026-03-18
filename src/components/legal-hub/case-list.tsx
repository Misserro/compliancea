"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { LegalCase } from "@/lib/types";
import { CaseCard } from "./case-card";
import { Skeleton } from "@/components/ui/skeleton";

interface CaseListProps {
  refreshTrigger?: number;
  searchQuery: string;
  selectedStatuses: string[];
  selectedCaseType: string;
}

export function CaseList({
  refreshTrigger,
  searchQuery,
  selectedStatuses,
  selectedCaseType,
}: CaseListProps) {
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    fetch("/api/legal-hub/cases", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load cases");
        return res.json();
      })
      .then((data) => {
        setCases(data.cases || []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Error loading cases");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger]);

  const q = searchQuery.trim().toLowerCase();
  const filteredCases = cases
    .filter((c) => selectedStatuses.includes(c.status))
    .filter((c) => {
      if (!selectedCaseType) return true;
      return c.case_type === selectedCaseType;
    })
    .filter((c) => {
      if (!q) return true;
      return c.title.toLowerCase().includes(q);
    });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No cases found.</p>
        <p className="text-sm mt-1">Use &quot;New Case&quot; to get started.</p>
      </div>
    );
  }

  if (filteredCases.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No cases match your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredCases.map((legalCase) => (
        <CaseCard key={legalCase.id} legalCase={legalCase} />
      ))}
    </div>
  );
}
