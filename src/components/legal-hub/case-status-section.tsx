"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { LegalCase } from "@/lib/types";
import {
  LEGAL_CASE_STATUSES,
  LEGAL_CASE_STATUS_COLORS,
  LEGAL_CASE_STATUS_DISPLAY,
} from "@/lib/constants";

interface CaseStatusSectionProps {
  legalCase: LegalCase;
  caseId: number;
  onRefresh: () => void;
}

interface StatusHistoryEntry {
  status: string;
  changed_at: string;
  note: string | null;
}

function formatDateTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleString("en-US", {
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

export function CaseStatusSection({ legalCase, caseId, onRefresh }: CaseStatusSectionProps) {
  const [selectedStatus, setSelectedStatus] = useState(legalCase.status);
  const [note, setNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const statusColor =
    LEGAL_CASE_STATUS_COLORS[legalCase.status] ||
    LEGAL_CASE_STATUS_COLORS.new;
  const statusDisplay =
    LEGAL_CASE_STATUS_DISPLAY[legalCase.status] || legalCase.status;

  let statusHistory: StatusHistoryEntry[] = [];
  try {
    statusHistory = JSON.parse(legalCase.status_history_json || "[]");
  } catch {
    statusHistory = [];
  }

  // Show most recent first
  const reversedHistory = [...statusHistory].reverse();

  const handleTransition = async () => {
    if (selectedStatus === legalCase.status) {
      toast.error("Wybierz inny status");
      return;
    }

    setTransitioning(true);
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus, note: note.trim() || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to change status");
      }

      toast.success(`Status zmieniony na ${LEGAL_CASE_STATUS_DISPLAY[selectedStatus] || selectedStatus}`);
      setNote("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <span className="text-xs font-medium text-muted-foreground">Status</span>

      {/* Current status */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Aktualny:</span>
        <span className={`px-3 py-1 rounded text-sm font-medium ${statusColor}`}>
          {statusDisplay}
        </span>
      </div>

      {/* Transition controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="text-muted-foreground text-xs font-medium mb-1 block">
            Zmień na
          </label>
          <select
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {LEGAL_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEGAL_CASE_STATUS_DISPLAY[s] || s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-muted-foreground text-xs font-medium mb-1 block">
            Notatka (opcjonalnie)
          </label>
          <input
            type="text"
            className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Powód zmiany..."
          />
        </div>
        <button
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          onClick={handleTransition}
          disabled={transitioning || selectedStatus === legalCase.status}
        >
          {transitioning ? "Zmiana..." : "Zmień status"}
        </button>
      </div>

      {/* Status history timeline */}
      {reversedHistory.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Historia</span>
          <div className="space-y-1.5">
            {reversedHistory.map((entry, index) => {
              const entryColor =
                LEGAL_CASE_STATUS_COLORS[entry.status] ||
                LEGAL_CASE_STATUS_COLORS.new;
              const entryDisplay =
                LEGAL_CASE_STATUS_DISPLAY[entry.status] || entry.status;

              return (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${entryColor}`}
                  >
                    {entryDisplay}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.changed_at)}
                  </span>
                  {entry.note && (
                    <span className="text-xs text-muted-foreground italic">
                      — {entry.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
