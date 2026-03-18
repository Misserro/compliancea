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

export function LegalHubDashboard() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    ...LEGAL_CASE_STATUSES,
  ]);
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
        <h3 className="text-lg font-semibold">All Cases</h3>
        <button
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
          onClick={() => setShowNewCaseDialog(true)}
        >
          <Plus className="w-4 h-4" />
          New Case
        </button>
      </div>

      {/* Search and filters */}
      <div className="space-y-2">
        <Input
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Status filters */}
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
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Type:</label>
          <select
            className="px-2 py-1 border rounded text-sm bg-background"
            value={selectedCaseType}
            onChange={(e) => setSelectedCaseType(e.target.value)}
          >
            <option value="">All types</option>
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
