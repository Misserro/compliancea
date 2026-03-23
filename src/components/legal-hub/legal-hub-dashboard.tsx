"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Briefcase, Building2 } from "lucide-react";
import { CaseList } from "./case-list";
import { NewCaseDialog } from "./new-case-dialog";
import { FirmStatsPanel } from "./firm-stats-panel";
import { MemberRoster, type FirmMember } from "./member-roster";
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

type DashboardTab = "cases" | "firm";

interface FirmStats {
  statsByStatus: { status: string; count: number }[];
  finalizedLast30Days: number;
  members: FirmMember[];
}

export function LegalHubDashboard() {
  const { data: sessionData } = useSession();
  const canEdit = permLevel(sessionData?.user?.permissions, 'legal_hub') >= 2;
  const isAdmin = sessionData?.user?.orgRole !== "member";

  const [activeTab, setActiveTab] = useState<DashboardTab>("cases");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Empty = no filter = show all cases; checkboxes narrow to specific statuses
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCaseType, setSelectedCaseType] = useState<string>("");

  // Firm stats state (admin only)
  const [firmStats, setFirmStats] = useState<FirmStats | null>(null);
  const [firmStatsLoading, setFirmStatsLoading] = useState(false);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const fetchFirmStats = useCallback(async () => {
    setFirmStatsLoading(true);
    try {
      const res = await fetch("/api/legal-hub/firm-stats");
      if (res.ok) {
        const data: FirmStats = await res.json();
        setFirmStats(data);
      }
    } catch {
      // Silently fail — stats panel will show loading state
    } finally {
      setFirmStatsLoading(false);
    }
  }, []);

  // Fetch firm stats when admin switches to the firm tab
  useEffect(() => {
    if (isAdmin && activeTab === "firm") {
      fetchFirmStats();
    }
  }, [isAdmin, activeTab, fetchFirmStats]);

  const tabs: { key: DashboardTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "cases",
      label: "Sprawy",
      icon: <Briefcase className="w-4 h-4" />,
    },
    {
      key: "firm",
      label: "Moja kancelaria",
      icon: <Building2 className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar — admin/owner only */}
      {isAdmin && (
        <div className="border-b">
          <div className="flex gap-1">
            {tabs.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cases tab content */}
      {activeTab === "cases" && (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">All Cases</h3>
            {canEdit && (
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                onClick={() => setShowNewCaseDialog(true)}
              >
                <Plus className="w-4 h-4" />
                New Case
              </button>
            )}
          </div>

          {/* Search and filters */}
          <div className="space-y-2">
            <Input
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground shrink-0">
                {selectedStatuses.length === 0 ? "All statuses shown" : "Showing:"}
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
                  Clear
                </button>
              )}
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
        </>
      )}

      {/* Moja kancelaria tab content — admin only */}
      {activeTab === "firm" && isAdmin && (
        <div className="space-y-6">
          <FirmStatsPanel
            statsByStatus={firmStats?.statsByStatus ?? []}
            finalizedLast30Days={firmStats?.finalizedLast30Days ?? 0}
            loading={firmStatsLoading}
          />
          <MemberRoster
            members={firmStats?.members ?? []}
            onProfileUpdated={fetchFirmStats}
          />
        </div>
      )}
    </div>
  );
}
