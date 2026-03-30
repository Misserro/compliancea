"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEntry } from "@/lib/types";

interface CaseActivityTabProps {
  caseId: number;
}

const KNOWN_ACTIONS = [
  "create",
  "update",
  "status_changed",
  "document_added",
  "document_generated",
  "document_exported",
  "party_added",
  "deadline_added",
  "ai_mutation_applied",
] as const;

type KnownAction = (typeof KNOWN_ACTIONS)[number];

function isKnownAction(action: string): action is KnownAction {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

function getDetailsSummary(action: string, details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    switch (action) {
      case "status_changed": {
        const oldStatus = parsed.old_status || parsed.oldStatus;
        const newStatus = parsed.new_status || parsed.newStatus;
        if (oldStatus && newStatus) return `${oldStatus} \u2192 ${newStatus}`;
        if (newStatus) return newStatus;
        return null;
      }
      case "document_added":
      case "document_generated":
      case "document_exported":
        return parsed.document_name || parsed.name || null;
      case "party_added":
        return parsed.party_name || parsed.name || null;
      case "deadline_added":
        return parsed.deadline_title || parsed.title || null;
      case "ai_mutation_applied":
        return parsed.description || parsed.summary || null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function CaseActivityTab({ caseId }: CaseActivityTabProps) {
  const t = useTranslations("LegalHub");
  const locale = useLocale();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch(`/api/legal-hub/cases/${caseId}/activity`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch activity");
      }
      const { data } = await res.json();
      // Sort newest first by created_at
      const sorted = [...(data || [])].sort(
        (a: AuditEntry, b: AuditEntry) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEntries(sorted);
    } catch (err) {
      console.error("Error fetching activity:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch activity");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  function formatTimestamp(dateString: string): string {
    try {
      return new Date(dateString).toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }

  function getActionLabel(action: string): string {
    if (isKnownAction(action)) {
      return t(`activity.action.${action}` as Parameters<typeof t>[0]);
    }
    return action;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-sm">
          {t("activity.loadError")}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          {t("activity.noActivity")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const summary = getDetailsSummary(entry.action, entry.details);
        return (
          <div
            key={entry.id}
            className="flex items-start justify-between border rounded p-3 text-sm"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <span className="font-medium">{getActionLabel(entry.action)}</span>
              {summary && (
                <p className="text-xs text-muted-foreground">{summary}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 ml-4">
              {formatTimestamp(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
