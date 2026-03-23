"use client";

import {
  LEGAL_CASE_STATUS_DISPLAY,
  LEGAL_CASE_STATUS_COLORS,
} from "@/lib/constants";

interface FirmStatsPanelProps {
  statsByStatus: { status: string; count: number }[];
  finalizedLast30Days: number;
  loading: boolean;
}

export function FirmStatsPanel({
  statsByStatus,
  finalizedLast30Days,
  loading,
}: FirmStatsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Statystyki spraw
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border p-3 animate-pulse bg-muted/30"
            >
              <div className="h-3 w-20 bg-muted rounded mb-2" />
              <div className="h-6 w-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalCases = statsByStatus.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Statystyki spraw
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {/* Total cases card */}
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground mb-1">Wszystkie sprawy</p>
          <p className="text-2xl font-bold">{totalCases}</p>
        </div>

        {/* Per-status cards */}
        {statsByStatus.map(({ status, count }) => (
          <div key={status} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">
              {LEGAL_CASE_STATUS_DISPLAY[status] || status}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{count}</p>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  LEGAL_CASE_STATUS_COLORS[status] || ""
                }`}
              >
                {LEGAL_CASE_STATUS_DISPLAY[status] || status}
              </span>
            </div>
          </div>
        ))}

        {/* Finalized last 30 days */}
        <div className="rounded-lg border p-3 border-green-200 dark:border-green-800">
          <p className="text-xs text-muted-foreground mb-1">
            Zamkniete (30 dni)
          </p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            {finalizedLast30Days}
          </p>
        </div>
      </div>
    </div>
  );
}
