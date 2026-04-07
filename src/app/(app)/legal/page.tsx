"use client";

import { useState, useEffect, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { Scale, CalendarCheck, AlertTriangle, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";

interface LegalHubData {
  statsByStatus: Array<{ status: string; count: number }>;
  upcomingDeadlines: Array<{
    id: number;
    case_id: number;
    case_title: string;
    title: string;
    deadline_type: string;
    due_date: string;
  }>;
  recentCases: Array<{
    id: number;
    title: string;
    status: string;
    case_type: string;
    created_at: string;
    assigned_to_name: string | null;
  }>;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  subNode,
  href,
  accent,
}: {
  icon: ElementType;
  label: string;
  value: number | string;
  sub?: string;
  subNode?: React.ReactNode;
  href: string;
  accent?: "red" | "green";
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
      <p
        className={`text-3xl font-bold ${accent === "red" ? "text-destructive" : accent === "green" ? "text-green-600" : ""}`}
      >
        {value}
      </p>
      {subNode ?? (sub && <p className="text-xs text-muted-foreground">{sub}</p>)}
    </button>
  );
}

export default function LegalDashboardPage() {
  const [data, setData] = useState<LegalHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();
  const t = useTranslations("LegalDashboard");
  const { data: sessionData } = useSession();

  const permissions = sessionData?.user?.permissions;
  function canView(resource: string): boolean {
    if (!permissions) return true;
    const level =
      PERMISSION_LEVELS[(permissions[resource] ?? "full") as PermissionLevel] ?? 3;
    return level >= 1;
  }

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d.legalHub ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (!canView("legal_hub")) {
    return null;
  }

  const openCount = (data?.statsByStatus ?? []).reduce(
    (sum, s) => sum + Number(s.count),
    0
  );
  const statusBadge = (data?.statsByStatus ?? [])
    .filter((s) => s.count > 0)
    .map((s) => `${s.status} ${s.count}`)
    .join(" \u00b7 ");
  const deadlineCount = data?.upcomingDeadlines?.length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : data ? (
          <>
            <KpiCard
              icon={Scale}
              label={t("openCases")}
              href="/legal/cases"
              value={openCount}
              subNode={
                statusBadge ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {statusBadge}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("openCasesSub", { count: 0 })}
                  </p>
                )
              }
            />
            <KpiCard
              icon={CalendarCheck}
              label={t("upcomingDeadlines")}
              href="/legal/cases"
              value={deadlineCount}
              sub={t("next30Days")}
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

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Court Deadlines */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">{t("upcomingDeadlines")}</h3>
            <p className="text-xs text-muted-foreground">{t("next30Days")}</p>
          </div>
          <div className="divide-y">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))
            ) : !data || data.upcomingDeadlines.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarCheck className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("noUpcomingDeadlines")}
                </p>
              </div>
            ) : (
              data.upcomingDeadlines.map((d) => {
                const days = Math.ceil(
                  (new Date(d.due_date).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                );
                return (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/legal/cases/${d.case_id}`)}
                    className="group w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{d.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {d.case_title}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ml-3 ${days <= 7 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {t("daysShort", { count: days })}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Cases */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">{t("recentCases")}</h3>
          </div>
          <div className="divide-y">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))
            ) : !data || data.recentCases.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Scale className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("noRecentCases")}
                </p>
              </div>
            ) : (
              data.recentCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/legal/cases/${c.id}`)}
                  className="group w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.case_type}
                      {c.assigned_to_name ? ` \u00b7 ${c.assigned_to_name}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground shrink-0 ml-3 capitalize">
                    {c.status}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
