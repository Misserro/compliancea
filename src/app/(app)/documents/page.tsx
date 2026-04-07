"use client";

import { useState, useEffect, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileCheck, FolderOpen, Layers, AlertTriangle, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";

interface DashboardData {
  docs?: { total: number; processed: number; byType: Record<string, number> };
}

function KpiCard({
  icon: Icon, label, value, sub, href,
}: {
  icon: ElementType; label: string; value: number | string;
  sub?: string; href: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="flex flex-col gap-1 rounded-xl border bg-card p-5 text-left shadow-sm hover:shadow-md transition-shadow w-full"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}

export default function DocumentsHubPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();
  const t = useTranslations("DocumentsHub");
  const { data: sessionData } = useSession();

  const permissions = sessionData?.user?.permissions;
  function canView(resource: string): boolean {
    if (!permissions) return true;
    const level = PERMISSION_LEVELS[(permissions[resource] ?? 'full') as PermissionLevel] ?? 3;
    return level >= 1;
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (!canView('documents')) {
    return null;
  }

  const docs = data?.docs;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : docs ? (
          <>
            <KpiCard
              icon={FileText}
              label={t("totalDocuments")}
              href="/documents/library"
              value={docs.total}
              sub={t("totalSub")}
            />
            <KpiCard
              icon={FileCheck}
              label={t("processed")}
              href="/documents/library"
              value={docs.processed}
              sub={t("processedSub", { total: docs.total })}
            />
            <KpiCard
              icon={Layers}
              label={t("aiTools")}
              href="/documents/ai-tools"
              value={t("aiToolsValue")}
              sub={t("aiToolsSub")}
            />
          </>
        ) : null}
      </div>

      {error && !loading && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">{t("errorTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("errorSub")}</p>
        </div>
      )}

      {/* Document types breakdown */}
      {!loading && docs && Object.keys(docs.byType).length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">{t("byType")}</h3>
            <p className="text-xs text-muted-foreground">{t("byTypeSub")}</p>
          </div>
          <div className="divide-y">
            {Object.entries(docs.byType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => router.push("/documents/library")}
                  className="group w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium truncate capitalize">{type}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {count}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => router.push("/documents/library")}
            className="flex items-center gap-3 rounded-xl border bg-card p-5 text-left shadow-sm hover:shadow-md transition-shadow"
          >
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("libraryAction")}</p>
              <p className="text-xs text-muted-foreground">{t("libraryActionSub")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
          </button>
          <button
            onClick={() => router.push("/documents/ai-tools")}
            className="flex items-center gap-3 rounded-xl border bg-card p-5 text-left shadow-sm hover:shadow-md transition-shadow"
          >
            <Layers className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("aiToolsAction")}</p>
              <p className="text-xs text-muted-foreground">{t("aiToolsActionSub")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
