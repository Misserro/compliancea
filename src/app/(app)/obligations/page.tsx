"use client";

import { useState, useEffect } from "react";
import { ObligationsTab } from "@/components/contracts/obligations-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/constants";

interface ObligationStats {
  total: number;
  active: number;
  overdue: number;
  upcoming: number;
  met: number;
  finalized: number;
}

export default function ObligationsPage() {
  const [stats, setStats] = useState<ObligationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/obligations?filter=all")
      .then((r) => r.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => {
        /* silent -- skeletons stay */
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Obligations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and manage all contract obligations.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-full" />
          ))
        ) : stats ? (
          <>
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
              <span className="font-medium">Active</span>
              <span className="font-bold">{stats.active}</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                stats.overdue > 0 && "text-destructive border-destructive/30"
              )}
            >
              <span className="font-medium">Overdue</span>
              <span className="font-bold">{stats.overdue}</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                stats.upcoming > 0 && STATUS_COLORS.upcoming
              )}
            >
              <span className="font-medium">Upcoming 30d</span>
              <span className="font-bold">{stats.upcoming}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
              <span className="font-medium">Completed</span>
              <span className="font-bold">{stats.met + stats.finalized}</span>
            </div>
          </>
        ) : null}
      </div>

      <ObligationsTab />
    </div>
  );
}
