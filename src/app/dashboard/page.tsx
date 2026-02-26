"use client";

import { useState, useEffect, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { FileText, AlertTriangle, Briefcase, Rocket, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FEATURE_STATUSES, STATUS_LABELS } from "@/lib/types";

interface DashboardData {
  docs: { total: number; processed: number; byType: Record<string, number> };
  obligations: {
    total: number; active: number; overdue: number;
    upcoming: Array<{ id: number; title: string; due_date: string; document_name: string }>;
  };
  contracts: {
    total: number; active: number;
    expiringSoon: Array<{ id: number; name: string; expiry_date: string; daysLeft: number }>;
  };
  features: { total: number; byStatus: Record<string, number> };
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {/* silent — skeletons stay */})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Overview of your compliance workspace.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : data ? (
          <>
            <KpiCard
              icon={FileText} label="Documents" href="/documents"
              value={data.docs.total}
              sub={`${data.docs.processed} processed`}
            />
            <KpiCard
              icon={AlertTriangle} label="Overdue" href="/obligations"
              value={data.obligations.overdue}
              sub={`${data.obligations.active} active obligations`}
              accent={data.obligations.overdue > 0 ? "red" : undefined}
            />
            <KpiCard
              icon={Briefcase} label="Contracts" href="/contracts"
              value={data.contracts.total}
              sub={`${data.contracts.expiringSoon.length} expiring soon`}
            />
            <KpiCard
              icon={Rocket} label="Features" href="/product-hub"
              value={data.features.total}
              sub={`${data.features.byStatus["shipped"] ?? 0} shipped`}
            />
          </>
        ) : null}
      </div>

      {/* Two-column detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            ) : !data || data.obligations.upcoming.length === 0 ? (
              <p className="px-5 py-8 text-xs text-muted-foreground text-center">No upcoming deadlines.</p>
            ) : (
              data.obligations.upcoming.map(o => {
                const days = Math.ceil((new Date(o.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <button
                    key={o.id}
                    onClick={() => router.push("/obligations")}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{o.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{o.document_name}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ml-3 ${days <= 7 ? "text-destructive" : "text-muted-foreground"}`}>
                      {days}d
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

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
            ) : !data || data.contracts.expiringSoon.length === 0 ? (
              <p className="px-5 py-8 text-xs text-muted-foreground text-center">No contracts expiring soon.</p>
            ) : (
              data.contracts.expiringSoon.map(c => (
                <button
                  key={c.id}
                  onClick={() => router.push("/contracts")}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(c.expiry_date).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ml-3 ${c.daysLeft <= 14 ? "text-destructive" : "text-amber-600"}`}>
                    {c.daysLeft}d
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Product Hub status bar */}
      {data && data.features.total > 0 && (
        <div className="rounded-xl border bg-card shadow-sm px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Product Hub</h3>
            <span className="text-xs text-muted-foreground ml-auto">{data.features.total} features</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_STATUSES.map(status => {
              const count = data.features.byStatus[status] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => router.push("/product-hub")}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted/40 transition-colors"
                >
                  <span className="font-medium">{STATUS_LABELS[status]}</span>
                  <span className="font-bold">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
