# Plan 043 — Navigation & UX Optimization

## Summary

Reduce sidebar item count, improve information hierarchy, and de-clutter the Documents page action surface. No new features — pure UX/readability improvements.

**Before:** ~12 sidebar items, no label on admin section, two separate AI tool pages, Policies taking a sidebar slot, four exposed bulk-action buttons on Documents.

**After:** ~9 sidebar items (−3), clearly labelled Workspace section, one tabbed AI Tools page, Policies accessible as a filter chip, bulk actions hidden behind a dropdown.

---

## Context

Codebase: Next.js 15 App Router, shadcn/ui, next-intl (cookie-based locale), Tailwind v4.

Key files touched across all tasks:
- `src/components/layout/app-sidebar.tsx` — central sidebar component
- `messages/en.json` + `messages/pl.json` — i18n strings
- `src/app/(app)/document-tools/page.tsx` — AI Tools merged page
- `src/app/(app)/ask/page.tsx` — redirect to /document-tools
- `src/app/(app)/documents/page.tsx` — Documents page with Policies chip
- `src/components/documents/action-bar.tsx` — consolidated Actions dropdown

---

## Tasks

- [ ] **Task 1 — Sidebar: Add "Workspace" label to admin group**
- [ ] **Task 2 — Sidebar + Pages: Merge AI Tools into tabbed page**
- [ ] **Task 3 — Sidebar + Documents: Policies filter chip, remove nav item**
- [ ] **Task 4 — Documents: Consolidate ActionBar into dropdown**
- [ ] **Task 5 — Sidebar: Add separator before "My Law Firm"**

---

## Task 1 — Sidebar: Add "Workspace" label to admin group

### Goal

The bottom group (Settings / Organization / Members) currently renders with no label, making it visually orphaned. Adding a "Workspace" group label gives users immediate context that these are workspace-administration items.

### Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Add `SidebarGroupLabel` to the bottom group |
| `messages/en.json` | Add `Sidebar.workspace: "Workspace"` |
| `messages/pl.json` | Add `Sidebar.workspace: "Obszar roboczy"` |

### Implementation

In `app-sidebar.tsx` the bottom standalones group (line ~321) currently has no label:
```tsx
<SidebarGroup>
  <SidebarGroupContent>
    ...
  </SidebarGroupContent>
</SidebarGroup>
```

Add a `SidebarGroupLabel` as the first child inside `<SidebarGroup>`:
```tsx
<SidebarGroup>
  <SidebarGroupLabel>{tSidebar("workspace")}</SidebarGroupLabel>
  <SidebarGroupContent>
    ...
  </SidebarGroupContent>
</SidebarGroup>
```

Add to both message files under `"Sidebar"`:
```json
"workspace": "Workspace"   // en
"workspace": "Obszar roboczy"  // pl
```

### Success Criteria

- The bottom navigation group shows a "Workspace" label above Settings/Organization/Members
- Label renders correctly in both English and Polish
- No other sidebar items are affected

---

## Task 2 — Sidebar + Pages: Merge AI Tools into tabbed page

### Goal

Replace two sidebar items ("Analyze & Process" at `/document-tools`, "Ask Library" at `/ask`) with one "AI Tools" item at `/document-tools`. The page renders two tabs: **Analyze** (current document-tools content) and **Ask** (current ask content). `/ask` redirects to `/document-tools`.

### Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Remove Ask Library nav item; rename analyzeProcess → AI Tools |
| `src/app/(app)/document-tools/page.tsx` | Rewrite as client component with tab switcher |
| `src/app/(app)/ask/page.tsx` | Replace with redirect to `/document-tools` |
| `messages/en.json` | Add `Sidebar.aiTools`, `Documents.aiTools.*` tab strings |
| `messages/pl.json` | Polish equivalents |

### Implementation

**Sidebar (app-sidebar.tsx):**

Remove the `askLibrary` entry from the `docHubItems` array. Change `analyzeProcess` entry:
```tsx
// Before
{ title: tSidebar("analyzeProcess"), href: "/document-tools", icon: Layers, resource: "documents", feature: "" },
{ title: tSidebar("askLibrary"), href: "/ask", icon: MessageSquare, resource: "documents", feature: "" },

// After
{ title: tSidebar("aiTools"), href: "/document-tools", icon: Layers, resource: "documents", feature: "" },
```

Remove the `MessageSquare` import from lucide-react if no longer used elsewhere.

**document-tools/page.tsx — rewrite as client component:**

Convert from a Server Component to a `"use client"` component. Fetch documents via `/api/documents` on mount (same pattern as the existing `ask/page.tsx`). Render both sections with a local `activeTab` state:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { DeskSection } from "@/components/analyze/desk-section";
import { AskSection } from "@/components/analyze/ask-section";
import type { Document } from "@/lib/types";

type Tab = "analyze" | "ask";

export default function DocumentToolsPage() {
  const t = useTranslations("Documents");
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("aiTools.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("aiTools.subtitle")}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {(["analyze", "ask"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`aiTools.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "analyze" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("analyze.analyzerTitle")}</CardTitle>
              <CardDescription>{t("analyze.analyzerSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent><AnalyzerSection /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("analyze.selectModeTitle")}</CardTitle>
              <CardDescription>{t("analyze.selectModeSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-40 w-full" /> : <DeskSection documents={documents} />}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "ask" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("ask.cardTitle")}</CardTitle>
            <CardDescription>{t("ask.cardSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-10 w-full" /> : <AskSection documents={documents} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**ask/page.tsx — replace with redirect:**

```tsx
import { redirect } from "next/navigation";

export default function AskPage() {
  redirect("/document-tools");
}
```

**i18n additions (en.json under `Documents`):**
```json
"aiTools": {
  "title": "AI Tools",
  "subtitle": "Analyze documents and ask questions across your library.",
  "tab": {
    "analyze": "Analyze & Process",
    "ask": "Ask Library"
  }
}
```

And in `Sidebar`:
```json
"aiTools": "AI Tools"
```

**pl.json equivalents:**
```json
// Sidebar
"aiTools": "Narzędzia AI"

// Documents.aiTools
"aiTools": {
  "title": "Narzędzia AI",
  "subtitle": "Analizuj dokumenty i zadawaj pytania dotyczące biblioteki.",
  "tab": {
    "analyze": "Analizuj i przetwarzaj",
    "ask": "Zapytaj bibliotekę"
  }
}
```

### Success Criteria

- Sidebar Documents Hub shows 3 items: Documents, AI Tools (no more "Ask Library")
- Navigating to `/document-tools` shows a tabbed page with "Analyze & Process" and "Ask Library" tabs
- Default tab is "Analyze & Process"
- "Ask Library" tab renders `AskSection` with documents loaded
- Navigating to `/ask` redirects to `/document-tools`
- Labels render correctly in both English and Polish

---

## Task 3 — Sidebar + Documents: Policies filter chip, remove nav item

### Goal

Remove "Policies" from the sidebar Documents Hub group (saves one slot). Add a "Policies" quick-filter chip to the Documents page that filters the document list client-side to policy/procedure doc types. The `/policies` page remains intact for users who need its advanced features (version history, pending replacements).

### Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Remove Policies nav item from Documents Hub |
| `src/app/(app)/documents/page.tsx` | Add type-filter chip bar (All / Policies) |
| `messages/en.json` | Add `Documents.typeFilter.*` strings |
| `messages/pl.json` | Polish equivalents |

### Implementation

**Sidebar (app-sidebar.tsx):**

Remove the `policies` entry from `docHubItems`:
```tsx
// Remove this line:
{ title: tSidebar("policies"), href: "/policies", icon: Shield, resource: "policies", feature: "policies" },
```

Check if `Shield` import from lucide-react is still used by Admin panel — it is (admin panel uses `Shield`), so keep the import.

**documents/page.tsx — add type-filter chips:**

Add a `typeFilter` state alongside existing `statusFilter`:
```tsx
const [typeFilter, setTypeFilter] = useState<"all" | "policies">("all");
```

Add filter logic to `filteredDocuments`:
```tsx
if (typeFilter === "policies") {
  result = result.filter((d) => d.doc_type && ["policy", "procedure"].includes(d.doc_type));
}
```

Add chip bar between the page header and the UploadSection (or between UploadSection and ActionBar). Chips render as small toggle buttons using existing `Button` component:

```tsx
{/* Type filter chips */}
<div className="flex gap-2">
  <Button
    variant={typeFilter === "all" ? "secondary" : "ghost"}
    size="sm"
    className="h-7 px-3 text-xs"
    onClick={() => setTypeFilter("all")}
  >
    {t("typeFilter.all")}
  </Button>
  <Button
    variant={typeFilter === "policies" ? "secondary" : "ghost"}
    size="sm"
    className="h-7 px-3 text-xs"
    onClick={() => setTypeFilter("policies")}
  >
    {t("typeFilter.policies")}
  </Button>
</div>
```

When `typeFilter === "policies"`, the Upload section and ActionBar should still appear (both still relevant), but the list filters to policy/procedure docs.

**i18n additions (en.json under `Documents`):**
```json
"typeFilter": {
  "all": "All",
  "policies": "Policies"
}
```

**pl.json:**
```json
"typeFilter": {
  "all": "Wszystkie",
  "policies": "Polityki"
}
```

### Success Criteria

- Sidebar Documents Hub shows 3 items: Documents, AI Tools — Policies is gone
- Documents page has two chips: "All" and "Policies"
- "Policies" chip filters list to policy/procedure doc types client-side
- "All" chip clears the type filter
- `/policies` URL still works and renders the full Policies page
- Labels render correctly in both English and Polish

---

## Task 4 — Documents: Consolidate ActionBar into dropdown

### Goal

The Documents page ActionBar exposes 4 bulk-operation buttons at all times (Scan Server, Scan GDrive, Process All, Retag All). These are power-user operations that create visual noise for all users. Consolidate them into a single "Actions" dropdown button using the existing `DropdownMenu` component. The Expand/Collapse toggle stays separate — it's a view control, not a data action.

### Files

| File | Change |
|---|---|
| `src/components/documents/action-bar.tsx` | Rewrite: 4 buttons → 1 Actions dropdown + Expand/Collapse |

### Implementation

Import `DropdownMenu` components (already available at `@/components/ui/dropdown-menu`):

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronDown as MenuChevron } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderSearch, HardDrive, Play, Tags } from "lucide-react";

export function ActionBar({ onScanServer, onScanGDrive, onProcessAll, onRetagAll, allExpanded, onToggleExpand }: ActionBarProps) {
  const t = useTranslations("Documents");
  const [loading, setLoading] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading !== null}>
            {t("actionBar.actions")}
            <MenuChevron className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => run("scan", onScanServer)}
            disabled={loading !== null}
          >
            <FolderSearch className="mr-2 h-4 w-4" />
            {loading === "scan" ? t("actionBar.scanning") : t("actionBar.scanServer")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("gdrive", onScanGDrive)}
            disabled={loading !== null}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            {loading === "gdrive" ? t("actionBar.scanningGDrive") : t("actionBar.scanGDrive")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("process", onProcessAll)}
            disabled={loading !== null}
          >
            <Play className="mr-2 h-4 w-4" />
            {loading === "process" ? t("actionBar.processing") : t("actionBar.processAll")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("retag", onRetagAll)}
            disabled={loading !== null}
          >
            <Tags className="mr-2 h-4 w-4" />
            {loading === "retag" ? t("actionBar.retagging") : t("actionBar.retagAll")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={onToggleExpand}>
        {allExpanded ? (
          <ChevronUp className="mr-2 h-4 w-4" />
        ) : (
          <ChevronDown className="mr-2 h-4 w-4" />
        )}
        {allExpanded ? t("actionBar.hideDetails") : t("actionBar.showAllDetails")}
      </Button>
    </div>
  );
}
```

Add `"actions": "Actions"` to `messages/en.json` under `Documents.actionBar` and `"actions": "Akcje"` in `messages/pl.json`.

### Success Criteria

- ActionBar renders as 1 "Actions" dropdown + Expand/Collapse button (was 4 buttons + 1)
- All 4 actions are reachable from the dropdown and function identically to before
- Only one action can run at a time (dropdown disables while any action is loading)
- Expand/Collapse button is unchanged in behavior

---

## Task 5 — Sidebar: Add separator before "My Law Firm"

### Goal

In the Legal Hub group, "Cases" and "Templates" are visible to all users; "My Law Firm" is admin/owner only. Adding a visual separator before "My Law Firm" makes the admin boundary explicit without moving it.

### Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Add `Separator` before My Law Firm `SidebarMenuItem` |

### Implementation

Import `Separator` from `@/components/ui/separator` (already in the project):

```tsx
import { Separator } from "@/components/ui/separator";
```

Inside the Legal Hub group, wrap the My Law Firm item:

```tsx
{sessionData?.user?.orgRole !== "member" && (
  <>
    <Separator className="my-1" />
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={pathname === "/legal-hub/firm" || pathname.startsWith("/legal-hub/firm/")}
        tooltip={tSidebar("myLawFirm")}
      >
        <Link href="/legal-hub/firm">
          <Building2 />
          <span>{tSidebar("myLawFirm")}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </>
)}
```

### Success Criteria

- Legal Hub group shows: Cases, Templates, [separator line], My Law Firm (for admin/owner)
- Regular members see: Cases, Templates (separator and My Law Firm not rendered)
- No functional changes to any navigation

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| DeskSection needs `documents` prop — server fetch removed | Medium | Task 2 fetches docs client-side via API before rendering; skeleton shown while loading |
| `/ask` bookmarks break | Low | Redirect is instant; no user data lost |
| `Shield` icon import removed from sidebar breaks Admin panel | None | Admin panel uses `Shield` — it's still imported (not removed) |
| ActionBar dropdown closes if user clicks away mid-action | Low | `disabled` state on all items during loading prevents re-entry |
| Polish translations missing or wrong | Low | Translations provided in plan; reviewer checks both locales |

---

## Documentation Gaps

None — this plan does not introduce new architecture or product requirements. All changes are UX refinements to existing features documented under Plan 041 (UI/UX improvements).
