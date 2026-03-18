"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Wand2, MessageSquare, LayoutDashboard } from "lucide-react";
import type { LegalCase, CaseParty, CaseDeadline } from "@/lib/types";
import { CaseHeader } from "./case-header";
import { CaseOverviewTab } from "./case-overview-tab";
import { CaseDocumentsTab } from "./case-documents-tab";
import { CaseGenerateTab } from "./case-generate-tab";
import { CaseChatPanel } from "./case-chat-panel";
import { Skeleton } from "@/components/ui/skeleton";

interface CaseDetailPageProps {
  caseId: number;
}

type TabKey = "overview" | "documents" | "generate" | "chat";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: "documents", label: "Documents", icon: <FileText className="w-4 h-4" /> },
  { key: "generate", label: "Generate", icon: <Wand2 className="w-4 h-4" /> },
  { key: "chat", label: "Chat", icon: <MessageSquare className="w-4 h-4" /> },
];

export function CaseDetailPage({ caseId }: CaseDetailPageProps) {
  const [legalCase, setLegalCase] = useState<LegalCase | null>(null);
  const [parties, setParties] = useState<CaseParty[]>([]);
  const [deadlines, setDeadlines] = useState<CaseDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchCase = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/legal-hub/cases/${caseId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch case");
      }
      const { data } = await res.json();
      setLegalCase(data);
      setParties(data.parties || []);
      setDeadlines(data.deadlines || []);
    } catch (err) {
      console.error("Error fetching case:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase, refreshTrigger]);

  const handleRefresh = () => setRefreshTrigger((t) => t + 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !legalCase) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-sm">
          {error || "Case not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CaseHeader legalCase={legalCase} />

      {/* Tab bar */}
      <div className="border-b">
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon }) => (
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

      {/* Tab content */}
      {activeTab === "overview" && (
        <CaseOverviewTab
          legalCase={legalCase}
          parties={parties}
          deadlines={deadlines}
          caseId={caseId}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === "documents" && (
        <CaseDocumentsTab caseId={caseId} />
      )}

      {activeTab === "generate" && (
        <CaseGenerateTab
          caseId={caseId}
          legalCase={legalCase}
          parties={parties}
          deadlines={deadlines}
        />
      )}

      {activeTab === "chat" && (
        <CaseChatPanel caseId={caseId} />
      )}
    </div>
  );
}
