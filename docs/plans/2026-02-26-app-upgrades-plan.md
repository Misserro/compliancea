# App Upgrades Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a download button to Policies, improve the Documents "In Force" indicator and tags UX, and create a Dashboard home page.

**Architecture:** Three independent changes — a one-line UI addition for Policies, a badge/toggle rework in Documents, and a new `/dashboard` route backed by a single aggregated API endpoint. All use existing DB functions; no schema changes needed.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, SQLite via `lib/db.js`

---

## Task 1: Policies — Add Download Button

**Files:**
- Modify: `src/components/policies/policies-list.tsx`

### Step 1: Add the Download import and button

In `src/components/policies/policies-list.tsx`, add `Download` to the lucide-react import (it's already imported from lucide — check if `Download` is there; if not add it):

```tsx
import { ChevronDown, ChevronRight, GitBranch, GitMerge, Download } from "lucide-react";
```

### Step 2: Add the button to PolicyRow

Inside `PolicyRow`, in the `{/* Actions */}` section, add a Download button **before** the Replace button:

```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-7 px-2 text-xs"
  onClick={() => window.open(`/api/documents/${doc.id}/download?download=true`, '_blank')}
  title="Download document"
>
  <Download className="h-3.5 w-3.5 mr-1" />
  Download
</Button>
```

### Step 3: Verify

Open the app → Policies tab → click Download on any policy row → file download should trigger.

### Step 4: Commit

```bash
git add src/components/policies/policies-list.tsx
git commit -m "feat: add download button to policy rows"
```

---

## Task 2: Documents — Restyle "In Force" as a Solid Pill

**Files:**
- Modify: `src/components/documents/document-badges.tsx`

### Context

The current `in_force` field can be `"in_force"`, `"archival"`, `"true"`, `"false"`, `"unknown"`, or `null`. The existing badge code checks for `"in_force"` and `"archival"`. We keep the same logic but change the visual.

### Step 1: Replace the Badge with a styled pill

Find this block in `document-badges.tsx` (lines 34–45):

```tsx
{/* In-Force Badge - always visible */}
{doc.in_force && doc.in_force !== "unknown" && (
  <Badge
    variant="secondary"
    className={
      doc.in_force === "in_force"
        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
    }
  >
    {doc.in_force === "in_force" ? "In Force" : "Archival"}
  </Badge>
)}
```

Replace with a solid pill (no `Badge` component needed):

```tsx
{/* In-Force Pill - always visible */}
{doc.in_force && doc.in_force !== "unknown" && (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      doc.in_force === "in_force" || doc.in_force === "true"
        ? "bg-green-500 text-white"
        : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
    }`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
    {doc.in_force === "in_force" || doc.in_force === "true" ? "In Force" : "Archived"}
  </span>
)}
```

### Step 2: Verify

Open Documents tab → any processed document should show a solid green "● In Force" pill or muted grey "● Archived" pill.

### Step 3: Commit

```bash
git add src/components/documents/document-badges.tsx
git commit -m "feat: restyle in-force indicator as solid pill"
```

---

## Task 3: Documents — Tags Toggle Button

**Files:**
- Modify: `src/components/documents/document-card.tsx`

### Context

Currently tags only show when the card is expanded (`CollapsibleContent`). We want a `Tags (N)` button visible in the **collapsed** header row that reveals tags inline on click, without requiring full expansion.

### Step 1: Add local `tagsOpen` state

In `DocumentCard`, after the existing `const [isOpen, setIsOpen] = useState(expanded);` line, add:

```tsx
const [tagsOpen, setTagsOpen] = useState(false);
```

### Step 2: Parse tags early

Add this after the `isContract` constant:

```tsx
const parsedTags: string[] = (() => {
  try {
    const t = JSON.parse(doc.tags || '[]');
    return Array.isArray(t) ? t : [];
  } catch { return []; }
})();
```

### Step 3: Add the Tags chip in the header row

Find the line that shows word count:

```tsx
<span className="text-xs text-muted-foreground shrink-0">
  {doc.processed
    ? `${doc.word_count?.toLocaleString() || 0} words`
    : "Not processed"}
</span>
```

After it (still inside the same `div.flex.items-center.gap-2.mb-1.5`), add:

```tsx
{parsedTags.length > 0 && (
  <button
    onClick={(e) => { e.stopPropagation(); setTagsOpen(v => !v); }}
    className="text-xs text-muted-foreground hover:text-foreground underline decoration-dashed underline-offset-2 shrink-0"
  >
    Tags ({parsedTags.length})
  </button>
)}
```

### Step 4: Show the inline tag list

After `<DocumentBadges doc={doc} expanded={isOpen} />`, add:

```tsx
{tagsOpen && parsedTags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1.5">
    {parsedTags.map((tag) => (
      <span
        key={tag}
        className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      >
        {tag}
      </span>
    ))}
  </div>
)}
```

### Step 5: Remove tags from the expanded section

Inside `CollapsibleContent` (around line 107), remove the existing tags block:

```tsx
{/* Tags */}
{doc.tags && (() => {
  try {
    const tags = JSON.parse(doc.tags);
    if (Array.isArray(tags) && tags.length > 0) {
      return (
        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Tags:</span>
          <p className="text-xs text-muted-foreground">
            {tags.join(", ")}
          </p>
        </div>
      );
    }
  } catch { /* ignore */ }
  return null;
})()}
```

Tags are now shown via the toggle only — no duplication.

### Step 6: Verify

Open Documents tab → a document with tags should show a `Tags (N)` link in the header row. Clicking it reveals tag pills inline. Clicking again hides them.

### Step 7: Commit

```bash
git add src/components/documents/document-card.tsx
git commit -m "feat: add tags toggle chip to document card header"
```

---

## Task 4: Dashboard — API Endpoint

**Files:**
- Create: `src/app/api/dashboard/route.ts`

### Context

This endpoint aggregates four data sources in one call using existing DB functions:
- `getAllDocuments()` → doc stats
- `getAllObligations()` + `getOverdueObligations()` + `getUpcomingObligations(30)` → obligation stats
- `getContractsWithSummaries()` → contract stats + expiring soon list
- `getProductFeatures()` → feature status breakdown

### Step 1: Create the route file

```ts
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getAllDocuments,
  getAllObligations,
  getOverdueObligations,
  getUpcomingObligations,
  getContractsWithSummaries,
  getProductFeatures,
} from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const docs = getAllDocuments() as Array<{ doc_type: string | null; processed: number }>;
    const allObligations = getAllObligations() as Array<{ status: string }>;
    const overdue = getOverdueObligations() as Array<{ id: number; title: string; due_date: string; document_name: string }>;
    const upcoming = getUpcomingObligations(30) as Array<{ id: number; title: string; due_date: string; document_name: string }>;
    const contracts = getContractsWithSummaries() as Array<{
      id: number; name: string; status: string; expiry_date: string | null;
      activeObligations: number;
    }>;
    const features = getProductFeatures() as Array<{ status: string }>;

    // Contracts expiring within 60 days
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const expiringSoon = contracts
      .filter(c => c.expiry_date && new Date(c.expiry_date) <= in60Days && new Date(c.expiry_date) >= now)
      .map(c => ({
        id: c.id,
        name: c.name,
        expiry_date: c.expiry_date!,
        daysLeft: Math.ceil((new Date(c.expiry_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Doc type breakdown
    const byType: Record<string, number> = {};
    for (const d of docs) {
      const t = d.doc_type || "unknown";
      byType[t] = (byType[t] || 0) + 1;
    }

    // Feature status breakdown
    const byStatus: Record<string, number> = {};
    for (const f of features) {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    }

    return NextResponse.json({
      docs: {
        total: docs.length,
        processed: docs.filter(d => d.processed).length,
        byType,
      },
      obligations: {
        total: allObligations.length,
        active: allObligations.filter(o => o.status === "active").length,
        overdue: overdue.length,
        upcoming: upcoming.slice(0, 10),
      },
      contracts: {
        total: contracts.length,
        active: contracts.filter(c => c.status === "active" || (c.activeObligations > 0)).length,
        expiringSoon,
      },
      features: {
        total: features.length,
        byStatus,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Step 2: Verify the endpoint

Start the dev server (`npm run dev`) and open `http://localhost:3000/api/dashboard` in the browser. Should return JSON with `docs`, `obligations`, `contracts`, `features` keys.

### Step 3: Commit

```bash
git add src/app/api/dashboard/route.ts
git commit -m "feat: add /api/dashboard aggregated stats endpoint"
```

---

## Task 5: Dashboard — Page Component

**Files:**
- Create: `src/app/dashboard/page.tsx`

### Step 1: Create the page

```tsx
"use client";

import { useState, useEffect } from "react";
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
  icon: React.ElementType; label: string; value: number | string;
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
```

### Step 2: Verify

Navigate to `http://localhost:3000/dashboard` — should show KPI cards, obligation/contract panels, and the Product Hub status bar.

### Step 3: Commit

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add dashboard page with KPI cards and deadline panels"
```

---

## Task 6: Wire Up Dashboard as Home Page + Sidebar

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

### Step 1: Update home redirect

In `src/app/page.tsx`, change:

```tsx
redirect("/documents");
```

to:

```tsx
redirect("/dashboard");
```

### Step 2: Add Dashboard to sidebar nav

In `src/components/layout/app-sidebar.tsx`, add `LayoutDashboard` to the lucide-react import:

```tsx
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard } from "lucide-react";
```

Add Dashboard as the **first** item in `navItems`:

```tsx
const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", href: "/documents", icon: FileText },
  // ... rest unchanged
];
```

### Step 3: Verify

- Opening `http://localhost:3000` should redirect to `/dashboard`
- Sidebar should show Dashboard as the first item with a grid icon
- Active state highlights correctly when on `/dashboard`

### Step 4: Build check

```bash
npm run build
```

Expected: clean build with no errors.

### Step 5: Commit and push

```bash
git add src/app/page.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat: set dashboard as home page and add to sidebar nav"
git push
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/components/policies/policies-list.tsx` | Add Download button |
| `src/components/documents/document-badges.tsx` | Restyle in-force as solid pill |
| `src/components/documents/document-card.tsx` | Add tags toggle chip |
| `src/app/api/dashboard/route.ts` | New aggregated dashboard endpoint |
| `src/app/dashboard/page.tsx` | New dashboard page |
| `src/app/page.tsx` | Redirect to `/dashboard` |
| `src/components/layout/app-sidebar.tsx` | Add Dashboard nav item |
