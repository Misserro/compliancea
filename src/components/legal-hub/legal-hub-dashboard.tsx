"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CaseList } from "./case-list";
import { NewCaseDialog } from "./new-case-dialog";
import { Input } from "@/components/ui/input";
import {
  LEGAL_CASE_STATUSES,
  LEGAL_CASE_STATUS_DISPLAY,
  LEGAL_CASE_TYPES,
  LEGAL_CASE_TYPE_LABELS,
} from "@/lib/constants";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";
import { useSession } from "next-auth/react";

const permLevel = (perms: Record<string, string> | null | undefined, resource: string) =>
  PERMISSION_LEVELS[(perms?.[resource] ?? 'full') as PermissionLevel] ?? 3;

export function LegalHubDashboard() {
  const { data: sessionData } = useSession();
  const canEdit = permLevel(sessionData?.user?.permissions, 'legal_hub') >= 2;

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Empty = no filter = show all cases; checkboxes narrow to specific statuses
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCaseType, setSelectedCaseType] = useState<string>("");

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  return (
    <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Sprawy</h3>
            {canEdit && (
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                onClick={() => setShowNewCaseDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Nowa sprawa
              </button>
            )}
          </div>

          {/* Search and filters */}
          <div className="space-y-2">
            <Input
              placeholder="Szukaj po tytule..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground shrink-0">
                {selectedStatuses.length === 0 ? "Wszystkie statusy" : "Wyświetlane:"}
              </span>
              {LEGAL_CASE_STATUSES.map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status)}
                    onChange={() => toggleStatus(status)}
                    className="rounded border-input"
                  />
                  {LEGAL_CASE_STATUS_DISPLAY[status] || status}
                </label>
              ))}
              {selectedStatuses.length > 0 && (
                <button
                  className="text-xs text-muted-foreground underline ml-1"
                  onClick={() => setSelectedStatuses([])}
                >
                  Wyczyść
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Typ:</label>
              <select
                className="px-2 py-1 border rounded text-sm bg-background"
                value={selectedCaseType}
                onChange={(e) => setSelectedCaseType(e.target.value)}
              >
                <option value="">Wszystkie typy</option>
                {LEGAL_CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEGAL_CASE_TYPE_LABELS[t] || t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Case list */}
          <CaseList
            refreshTrigger={refreshTrigger}
            searchQuery={searchQuery}
            selectedStatuses={selectedStatuses}
            selectedCaseType={selectedCaseType}
          />

          {/* New case dialog */}
          <NewCaseDialog
            open={showNewCaseDialog}
            onOpenChange={setShowNewCaseDialog}
            onSuccess={() => {
              setShowNewCaseDialog(false);
              setRefreshTrigger((t) => t + 1);
            }}
          />
    </div>
  );
}
