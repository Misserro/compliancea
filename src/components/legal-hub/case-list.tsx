"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { LegalCase } from "@/lib/types";
import { CaseCard } from "./case-card";
import { Skeleton } from "@/components/ui/skeleton";

interface CaseListProps {
  refreshTrigger?: number;
  searchQuery: string;
  selectedStatuses: string[];
  selectedCaseType: string;
  sortBy: "deadline" | "title" | "created";
}

export function CaseList({
  refreshTrigger,
  searchQuery,
  selectedStatuses,
  selectedCaseType,
  sortBy,
}: CaseListProps) {
  const t = useTranslations('LegalHub');
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    fetch("/api/legal-hub/cases", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(t('dashboard.fetchError'));
        return res.json();
      })
      .then((data) => {
        setCases(data.cases || []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : t('dashboard.loadError'));
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger, t]);

  const q = searchQuery.trim().toLowerCase();
  const filteredCases = cases
    .filter((c) => selectedStatuses.length === 0 || selectedStatuses.includes(c.status))
    .filter((c) => {
      if (!selectedCaseType) return true;
      return c.case_type === selectedCaseType;
    })
    .filter((c) => {
      if (!q) return true;
      return c.title.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "deadline": {
          const aD = a.next_deadline;
          const bD = b.next_deadline;
          if (!aD && !bD) return 0;
          if (!aD) return 1;
          if (!bD) return -1;
          return aD < bD ? -1 : aD > bD ? 1 : 0;
        }
        case "title":
          return a.title.localeCompare(b.title);
        case "created":
          return b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0;
        default:
          return 0;
      }
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
        <p>{t('dashboard.noCases')}</p>
        <p className="text-sm mt-1">{t('dashboard.noCasesHint')}</p>
      </div>
    );
  }

  if (filteredCases.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t('dashboard.noMatchingCases')}</p>
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
