"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/types";
import { OBLIGATION_CATEGORIES } from "@/lib/constants";
import { UpcomingObligationsSection } from "./upcoming-obligations-section";
import { PerContractObligations } from "./per-contract-obligations";
import { Skeleton } from "@/components/ui/skeleton";

export function ObligationsTab() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const t = useTranslations("Contracts");

  useEffect(() => {
    async function loadContracts() {
      try {
        const res = await fetch("/api/contracts");
        if (res.ok) {
          const data = await res.json();
          setContracts(data.contracts || []);
        } else {
          toast.error(t("loadError"));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    }
    loadContracts();
  }, [t]);

  const categories = ["all", ...OBLIGATION_CATEGORIES] as const;

  return (
    <div className="space-y-10">
      {/* Top section: upcoming obligations grid */}
      <UpcomingObligationsSection />

      {/* Bottom section: per-contract breakdown */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t("obligationsByContract")}</h3>
        </div>

        {/* Category filter — independent from upcoming section */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat === "all" ? t("allFilter") : t(`obligationCategory.${cat}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (
          <PerContractObligations contracts={contracts} categoryFilter={categoryFilter} />
        )}
      </div>
    </div>
  );
}
