"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Obligation } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_MIGRATION_MAP } from "@/lib/constants";
import { Calendar, FileText } from "lucide-react";

export function UpcomingObligationsSection() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUpcoming() {
      try {
        const res = await fetch("/api/contracts/upcoming");
        if (res.ok) {
          const data = await res.json();
          setObligations(data.obligations || []);
        } else {
          toast.error("Failed to load upcoming obligations");
        }
      } catch (err) {
        toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }

    loadUpcoming();
  }, []);

  if (loading) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Upcoming Obligations (Next 30 Days)</h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (obligations.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Upcoming Obligations (Next 30 Days)</h3>
        <p className="text-sm text-muted-foreground">No upcoming obligations in the next 30 days.</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 7) return `In ${diffDays} days`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Upcoming Obligations (Next 30 Days)</h3>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {obligations.map((ob) => {
          const rawCategory = ob.category || "others";
          const category = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
          const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.others;

          return (
            <div
              key={ob.id}
              className="flex-shrink-0 w-64 bg-background border rounded-md p-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColor}`}>
                  {category}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {ob.due_date && formatDate(ob.due_date)}
                </div>
              </div>

              <h4 className="font-medium text-sm mb-1 line-clamp-2">{ob.title}</h4>

              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                <FileText className="w-3 h-3" />
                <span className="truncate">{ob.document_name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
