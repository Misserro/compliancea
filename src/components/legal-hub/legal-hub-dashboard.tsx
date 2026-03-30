"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CaseList } from "./case-list";
import { NewCaseDialog } from "./new-case-dialog";
import { DeadlineAlertBanner } from "./deadline-alert-banner";
import { Input } from "@/components/ui/input";
import {
  LEGAL_CASE_STATUSES,
  LEGAL_CASE_TYPES,
} from "@/lib/constants";
import { CASE_PRIORITIES } from "@/lib/types";
import type { LegalCase } from "@/lib/types";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";
import { useSession } from "next-auth/react";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const permLevel = (perms: Record<string, string> | null | undefined, resource: string) =>
  PERMISSION_LEVELS[(perms?.[resource] ?? 'full') as PermissionLevel] ?? 3;

export function LegalHubDashboard() {
  const { data: sessionData } = useSession();
  const canEdit = permLevel(sessionData?.user?.permissions, 'legal_hub') >= 2;
  const t = useTranslations('LegalHub');
  const tStatus = useTranslations("CaseStatuses");
  const tType = useTranslations("CaseTypes");

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Empty = no filter = show all cases; checkboxes narrow to specific statuses
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCaseType, setSelectedCaseType] = useState<string>("");
  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [sortBy, setSortBy] = useState<"deadline" | "title" | "created" | "priority">("deadline");
  const [page, setPage] = useState(1);

  // Server data
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce search input
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery]);

  // Reset page to 1 when any filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedStatuses, selectedCaseType, selectedPriority, sortBy]);

  // Fetch cases from API
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedStatuses.length > 0) params.set("status", selectedStatuses.join(","));
    if (selectedCaseType) params.set("caseType", selectedCaseType);
    if (selectedPriority) params.set("priority", selectedPriority);
    if (sortBy) params.set("sortBy", sortBy);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    const url = `/api/legal-hub/cases?${params.toString()}`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(t('dashboard.fetchError'));
        return res.json();
      })
      .then((data) => {
        setCases(data.cases || []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : t('dashboard.loadError'));
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, selectedStatuses, selectedCaseType, selectedPriority, sortBy, page, refreshTrigger, t]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  return (
    <div className="space-y-4">
          {/* Deadline alert banner */}
          <DeadlineAlertBanner />

          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{t('cases')}</h3>
            {canEdit && (
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                onClick={() => setShowNewCaseDialog(true)}
              >
                <Plus className="w-4 h-4" />
                {t('newCase')}
              </button>
            )}
          </div>

          {/* Search and filters */}
          <div className="space-y-2">
            <Input
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground shrink-0">
                {selectedStatuses.length === 0 ? t('dashboard.allStatuses') : t('dashboard.showing')}
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
                  {tStatus(status)}
                </label>
              ))}
              {selectedStatuses.length > 0 && (
                <button
                  className="text-xs text-muted-foreground underline ml-1"
                  onClick={() => setSelectedStatuses([])}
                >
                  {t('dashboard.clearFilters')}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">{t('dashboard.typeLabel')}</label>
                <select
                  className="px-2 py-1 border rounded text-sm bg-background"
                  value={selectedCaseType}
                  onChange={(e) => setSelectedCaseType(e.target.value)}
                >
                  <option value="">{t('dashboard.allTypes')}</option>
                  {LEGAL_CASE_TYPES.map((caseType) => (
                    <option key={caseType} value={caseType}>
                      {tType(caseType)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">{t('dashboard.filterByPriority')}</label>
                <select
                  className="px-2 py-1 border rounded text-sm bg-background"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                >
                  <option value="">{t('dashboard.allPriorities')}</option>
                  {CASE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}` as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">{t('dashboard.sortBy')}</label>
                <select
                  className="px-2 py-1 border rounded text-sm bg-background"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "deadline" | "title" | "created" | "priority")}
                >
                  <option value="deadline">{t('dashboard.sortDeadline')}</option>
                  <option value="title">{t('dashboard.sortTitle')}</option>
                  <option value="created">{t('dashboard.sortCreated')}</option>
                  <option value="priority">{t('dashboard.sortPriority')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Case list */}
          <CaseList
            cases={cases}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            loading={loading}
            onPageChange={handlePageChange}
          />

          {/* New case dialog */}
          <NewCaseDialog
            open={showNewCaseDialog}
            onOpenChange={setShowNewCaseDialog}
            onSuccess={() => {
              setShowNewCaseDialog(false);
              setRefreshTrigger((prev) => prev + 1);
            }}
          />
    </div>
  );
}
