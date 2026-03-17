# Sidebar Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar from a flat nav list into grouped hub sections, expose Obligations as its own nav item with the overdue badge, and merge the Analyze and Process pages into a single `/document-tools` page.

**Architecture:** The sidebar is refactored to use `SidebarGroup` / `SidebarGroupLabel` / `SidebarGroupContent` primitives already available in the UI component library. The new `/document-tools` page is a Next.js Server Component that fetches documents directly from the DB layer (bypassing the API route) and renders both `AnalyzerSection` and `DeskSection` stacked vertically. The old `/analyze` and `/process` routes are deleted.

**Tech Stack:** Next.js 14 App Router, React, shadcn/ui sidebar primitives, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-sidebar-nav-restructure-design.md`

---

## Chunk 1: Refactor the sidebar

### Task 1: Refactor `app-sidebar.tsx` to grouped structure

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**What to know before starting:**
- `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel` are exported from `@/components/ui/sidebar` but not currently imported in this file.
- The current file uses a single flat `navItems` array and one `<SidebarMenu>` wrapping all items.
- The overdue badge currently fires on `item.href === "/contracts"`. It must move to `"/obligations"`.
- The `/obligations` route already exists (`src/app/(app)/obligations/page.tsx`) — it just needs to be added to the nav.
- `Layers` icon is already imported (used by Process, which is being removed). Re-use it for "Analyze & Process".
- `Search` and `Layers` are currently imported for Analyze and Process respectively. After this task, `Search` is no longer needed for nav (remove from import if unused elsewhere — check first).
- The `isAdmin` check for the Users item must be preserved in the bottom standalone group.

**DOM structure to produce:**
```
SidebarContent
  SidebarGroup                        ← Dashboard (no label)
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem → /dashboard
  SidebarGroup                        ← Contract Hub
    SidebarGroupLabel "Contract Hub"
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem → /contracts
        SidebarMenuItem → /obligations  (+ overdue badge)
  SidebarGroup                        ← Documents Hub
    SidebarGroupLabel "Documents Hub"
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem → /documents
        SidebarMenuItem → /policies
        SidebarMenuItem → /document-tools  (title: "Analyze & Process", icon: Layers)
        SidebarMenuItem → /ask
  SidebarGroup                        ← bottom standalones (no label)
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem → /product-hub
        SidebarMenuItem → /settings
        SidebarMenuItem → /users  (only if isAdmin)
```

- [ ] **Step 1: Update imports**

In `src/components/layout/app-sidebar.tsx`, add `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel` to the import from `@/components/ui/sidebar`. Remove `Search` from the lucide-react import (it was only used for the Analyze nav item which is being replaced).

The lucide-react import line should become:
```tsx
import { FileText, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks } from "lucide-react";
```
- `ListChecks` is added — used as the icon for the **Obligations** nav item.
- `ClipboardCheck` is kept — it remains the icon for the **Contracts** nav item.
- `Search` is removed — it was the icon for `/analyze`, which is being deleted.

The sidebar import should become:
```tsx
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
```

- [ ] **Step 2: Replace the navItems array and SidebarContent with grouped structure**

Delete the `navItems` array (lines 28–38) and the `allNavItems` derivation (lines 79–82). Replace the entire `<SidebarContent>` block with the grouped structure below.

New `<SidebarContent>` block:

```tsx
<SidebarContent className="px-2 py-4">
  {/* Dashboard */}
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
            tooltip="Dashboard"
          >
            <Link href="/dashboard">
              <LayoutDashboard />
              <span>Dashboard</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  {/* Contract Hub */}
  <SidebarGroup>
    <SidebarGroupLabel>Contract Hub</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname === "/contracts" || pathname.startsWith("/contracts/")}
            tooltip="Contracts"
          >
            <Link href="/contracts">
              <ClipboardCheck />
              <span>Contracts</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname === "/obligations" || pathname.startsWith("/obligations/")}
            tooltip="Obligations"
          >
            <Link href="/obligations">
              <ListChecks />
              <span>Obligations</span>
              {overdueCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                >
                  {overdueCount}
                </Badge>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  {/* Documents Hub */}
  <SidebarGroup>
    <SidebarGroupLabel>Documents Hub</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {[
          { title: "Documents", href: "/documents", icon: FileText },
          { title: "Policies", href: "/policies", icon: Shield },
          { title: "Analyze & Process", href: "/document-tools", icon: Layers },
          { title: "Ask Library", href: "/ask", icon: MessageSquare },
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  {/* Bottom standalones */}
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        {[
          { title: "Product Hub", href: "/product-hub", icon: Package },
          { title: "Settings", href: "/settings", icon: Settings },
          ...(isAdmin ? [{ title: "Users", href: "/users", icon: Users }] : []),
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</SidebarContent>
```

- [ ] **Step 3: Verify the file compiles**

Run:
```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to `app-sidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: restructure sidebar into grouped hub sections with obligations nav item"
```

---

## Chunk 2: Create `/document-tools` page and delete old pages

### Task 2: Create the merged Analyze & Process page

**Files:**
- Create: `src/app/(app)/document-tools/page.tsx`

**What to know before starting:**
- This is a **Server Component** (no `"use client"` directive).
- Fetch documents using `getAllDocuments` imported from `@/lib/db-imports` — do NOT call the `/api/documents` API route (that would require an absolute URL and is unnecessary from a Server Component).
- `getAllDocuments` is synchronous (no `async`/`await` needed) — wrap in try/catch and fall back to `[]` on error.
- `AnalyzerSection` lives at `@/components/analyze/analyzer-section` — takes no props.
- `DeskSection` lives at `@/components/analyze/desk-section` — takes `documents: Document[]` prop.
- `Document` type is at `@/lib/types`.
- Both child components are `"use client"` — they act as client boundaries automatically inside this Server Component.
- Card components: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` from `@/components/ui/card`.

- [ ] **Step 1: Create the page**

Create `src/app/(app)/document-tools/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { DeskSection } from "@/components/analyze/desk-section";
import { getAllDocuments } from "@/lib/db-imports";
import type { Document } from "@/lib/types";

export default function DocumentToolsPage() {
  let documents: Document[] = [];
  try {
    documents = getAllDocuments() as Document[];
  } catch {
    // Fall back to empty array — DeskSection handles this gracefully
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analyze & Process</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered document analysis and multi-mode processing tools.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Document Analyzer</CardTitle>
          <CardDescription>
            Upload a document to translate, summarize, extract key points, or generate department to-do lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyzerSection />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Select a Mode</CardTitle>
          <CardDescription>
            Respond to a regulator query with cross-referenced sources, auto-answer a questionnaire, or review an NDA for risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeskSection documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors. Note: `getAllDocuments` is synchronous — the function is intentionally non-`async`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/app/\(app\)/document-tools/page.tsx
git commit -m "feat: add /document-tools page merging Analyze and Process"
```

---

### Task 3: Delete the old `/analyze` and `/process` pages

**Files:**
- Delete: `src/app/(app)/analyze/page.tsx`
- Delete: `src/app/(app)/process/page.tsx`

- [ ] **Step 1: Delete both files**

```bash
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/(app)/analyze/page.tsx"
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/(app)/process/page.tsx"
```

If those are the only files in their respective directories, remove the directories too:
```bash
rmdir "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/(app)/analyze" 2>/dev/null || true
rmdir "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/(app)/process" 2>/dev/null || true
```

- [ ] **Step 2: Verify no remaining references to /analyze or /process in src/**

**Prerequisite:** Chunk 1 (Task 1) must already be committed — otherwise `app-sidebar.tsx` will still contain these hrefs and the grep will produce false hits.

```bash
grep -r '"/analyze"' "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src" --include="*.tsx" --include="*.ts"
grep -r '"/process"' "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src" --include="*.tsx" --include="*.ts"
```
Expected: no output (or only results in files unrelated to navigation — e.g., API route handlers named `/api/process/...` are fine).

- [ ] **Step 3: Verify compilation still passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add -A
git commit -m "chore: delete /analyze and /process routes, replaced by /document-tools"
```
