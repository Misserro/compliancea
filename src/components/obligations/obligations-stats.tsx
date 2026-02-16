"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { ObligationStats } from "@/lib/types";

interface ObligationsStatsProps {
  stats: ObligationStats | null;
}

export function ObligationsStatsBar({ stats }: ObligationsStatsProps) {
  if (!stats) return null;

  const items = [
    { label: "Total", value: stats.total, color: "" },
    { label: "Active", value: stats.active, color: "text-green-600 dark:text-green-400" },
    { label: "Finalized", value: stats.finalized, color: "text-muted-foreground" },
    { label: "Overdue", value: stats.overdue, color: "text-destructive" },
    { label: "Met", value: stats.met, color: "text-blue-600 dark:text-blue-400" },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="py-3 px-4 text-center">
            <div className={`text-2xl font-semibold ${item.color}`}>
              {item.value}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.label}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
