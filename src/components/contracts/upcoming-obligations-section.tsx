"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, FileText } from "lucide-react";
import type { Obligation } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_MIGRATION_MAP, OBLIGATION_CATEGORIES } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingObligationsSection() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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

  const categories = ["all", ...OBLIGATION_CATEGORIES] as const;

  const filteredObligations = obligations.filter((ob) => {
    if (categoryFilter === "all") return true;
    const rawCategory = ob.category || "others";
    const cat = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
    return cat === categoryFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 7) return `In ${diffDays} days`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const emptyMessage =
    categoryFilter === "all"
      ? "No upcoming obligations in the next 30 days."
      : `No upcoming ${categoryFilter} obligations.`;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Upcoming Obligations (Next 30 Days)</h3>

      {/* Category filter */}
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
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : filteredObligations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredObligations.map((ob) => {
            const rawCategory = ob.category || "others";
            const category = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
            const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.others;

            return (
              <div
                key={ob.id}
                className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColor}`}>
                    {category}
                  </span>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {ob.due_date && formatDate(ob.due_date)}
                  </div>
                </div>
                <h4 className="font-medium text-sm mb-2 line-clamp-2">{ob.title}</h4>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  <span className="truncate">{ob.document_name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
