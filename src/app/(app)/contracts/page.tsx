"use client";

import { useState, useEffect, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, FileCheck, AlertTriangle, CalendarCheck, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "next-auth/react";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";

interface DashboardData {
  obligations?: {
    total: number; active: number; overdue: number;
    upcoming: Array<{ id: number; title: string; due_date: string; document_name: string }>;
  };
  contracts?: {
    total: number; active: number;
    expiringSoon: Array<{ id: number; name: string; expiry_date: string; daysLeft: number }>;
  };
}

function KpiCard({
  icon: Icon, label, value, sub, href, accent,
}: {
  icon: ElementType; label: string; value: number | string;
  sub?: string; href: string; accent?: "red" | "green";
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
      <p className={`text-3xl font-bold ${accent === "red" ? "text-destructive" : accent === "green" ? "text-green-600" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}

export default function ContractsHubPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();
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

  const showContracts = canView('contracts');

  if (!showContracts) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-sm text-muted-foreground">You do not have permission to view contracts.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Contracts Hub</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your contracts and obligations.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : data ? (
          <>
            {data.contracts && (
              <KpiCard
                icon={Briefcase} label="Total Contracts" href="/contracts/list"
                value={data.contracts.total}
                sub={`${data.contracts.expiringSoon.length} expiring soon`}
              />
            )}
            {data.contracts && (
              <KpiCard
                icon={FileCheck} label="Active Contracts" href="/contracts/list"
                value={data.contracts.active}
                accent={data.contracts.active > 0 ? "green" : undefined}
              />
            )}
            {data.obligations && (
              <KpiCard
                icon={AlertTriangle} label="Overdue Obligations" href="/contracts/obligations"
                value={data.obligations.overdue}
                sub={`${data.obligations.active} active obligations`}
                accent={data.obligations.overdue > 0 ? "red" : undefined}
              />
            )}
          </>
        ) : null}
      </div>

      {error && !loading && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">Failed to load dashboard data</p>
          <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page.</p>
        </div>
      )}

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contracts expiring soon */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Contracts Expiring Soon</h3>
            <p className="text-xs text-muted-foreground">Next 60 days</p>
          </div>
          <div className="divide-y">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3"><Skeleton className="h-4 w-3/4" /></div>
              ))
            ) : !data?.contracts || data.contracts.expiringSoon.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <FileCheck className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No contracts expiring soon</p>
              </div>
            ) : (
              data.contracts.expiringSoon.map(c => (
                <button
                  key={c.id}
                  onClick={() => router.push("/contracts/list")}
                  className="group w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(c.expiry_date).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ml-3 ${c.daysLeft <= 14 ? "text-destructive" : "text-amber-600"}`}>
                    {c.daysLeft}d
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Upcoming obligations */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Upcoming Obligations</h3>
            <p className="text-xs text-muted-foreground">Next 30 days</p>
          </div>
          <div className="divide-y">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3"><Skeleton className="h-4 w-3/4" /></div>
              ))
            ) : !data?.obligations || data.obligations.upcoming.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarCheck className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No upcoming obligations</p>
              </div>
            ) : (
              data.obligations.upcoming.map(o => {
                const days = Math.ceil((new Date(o.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <button
                    key={o.id}
                    onClick={() => router.push("/contracts/obligations")}
                    className="group w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{o.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{o.document_name}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ml-3 ${days <= 7 ? "text-destructive" : "text-muted-foreground"}`}>
                      {days}d
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
