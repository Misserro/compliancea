"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ContractDocument } from "@/lib/types";

interface ContractAnnexesSectionProps {
  contractId: number;
}

export function ContractAnnexesSection({ contractId }: ContractAnnexesSectionProps) {
  const [annexes, setAnnexes] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Contracts");

  const fetchAnnexes = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/documents`);
      if (res.ok) {
        const data = await res.json();
        const allDocs: ContractDocument[] = data.documents || [];
        setAnnexes(allDocs.filter(d => d.document_type === "annex"));
      }
    } catch (err) {
      console.warn("Failed to fetch annexes:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { fetchAnnexes(); }, [fetchAnnexes]);

  if (loading || annexes.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{t("annexes")}</div>
      <div className="space-y-1">
        {annexes.map((a) => (
          <div key={a.id} className="text-sm flex items-center gap-2">
            <span className="text-muted-foreground">&mdash;</span>
            <span>{a.label || a.file_name || a.linked_document_name || t("documents.untitled")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
