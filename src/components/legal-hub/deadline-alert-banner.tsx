"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { AlertTriangle, ChevronDown, ChevronUp, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { DeadlineAlert } from "@/lib/types";

interface DeadlineData {
  overdue: DeadlineAlert[];
  upcoming: DeadlineAlert[];
}

export function DeadlineAlertBanner() {
  const t = useTranslations("LegalHub");
  const { data: sessionData, status: sessionStatus } = useSession();
  const userId = sessionData?.user?.id;
  const dismissKey = userId ? `deadline-banner-dismissed-${userId}` : null;

  const [data, setData] = useState<DeadlineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Wait for session to resolve so we have the per-user dismiss key
    if (sessionStatus === "loading" || !dismissKey) return;

    // Check dismiss state before fetching
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem(dismissKey) === "true") {
        setDismissed(true);
        setLoading(false);
        return;
      }
    }

    const controller = new AbortController();

    fetch("/api/legal-hub/deadlines/upcoming", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch deadline alerts");
        return res.json();
      })
      .then((json: DeadlineData) => {
        setData(json);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        // Silently fail — banner simply won't show
        console.error("Deadline alert fetch error:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [sessionStatus, dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined" && dismissKey) {
      sessionStorage.setItem(dismissKey, "true");
    }
  };

  // Don't render during loading (no layout shift)
  if (loading) return null;

  // Don't render if dismissed
  if (dismissed) return null;

  // Don't render if no data or zero alerts
  if (!data) return null;
  const overdueCount = data.overdue.length;
  const upcomingCount = data.upcoming.length;
  if (overdueCount === 0 && upcomingCount === 0) return null;

  const formatDaysLabel = (daysUntil: number): string => {
    if (daysUntil === 0) return t("deadlineAlert.dueToday");
    if (daysUntil < 0) return t("deadlineAlert.overdueDays", { count: Math.abs(daysUntil) });
    return t("deadlineAlert.dueInDays", { count: daysUntil });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card p-3 space-y-2">
        {/* Summary row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-medium">{t("deadlineAlert.title")}</span>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {t("deadlineAlert.overdue", { count: overdueCount })}
              </Badge>
            )}
            {upcomingCount > 0 && (
              <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800">
                {t("deadlineAlert.upcoming", { count: upcomingCount })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                {open ? (
                  <>
                    {t("deadlineAlert.hideDetails")}
                    <ChevronUp className="w-3 h-3 ml-1" />
                  </>
                ) : (
                  <>
                    {t("deadlineAlert.showDetails")}
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
              aria-label={t("deadlineAlert.dismiss")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Expanded detail list */}
        <CollapsibleContent>
          <div className="space-y-2 pt-1">
            {/* Overdue deadlines */}
            {overdueCount > 0 && (
              <div className="space-y-1">
                {data.overdue.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-red-50 dark:bg-red-950/20 text-destructive"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">{d.caseTitle}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="truncate">{d.title}</span>
                    <span className="ml-auto text-xs whitespace-nowrap">
                      {t("deadlineAlert.dueDate", { date: d.due_date })} ({formatDaysLabel(d.daysUntil)})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Upcoming deadlines */}
            {upcomingCount > 0 && (
              <div className="space-y-1">
                {data.upcoming.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200"
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">{d.caseTitle}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="truncate">{d.title}</span>
                    <span className="ml-auto text-xs whitespace-nowrap">
                      {t("deadlineAlert.dueDate", { date: d.due_date })} ({formatDaysLabel(d.daysUntil)})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
