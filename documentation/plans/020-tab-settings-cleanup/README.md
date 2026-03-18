# Tab & Settings Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Product Hub tab and all its code, and strip the Settings page down to only essential sections (Google Drive, AI config, Policies filter).

**Architecture:** Pure deletion/cleanup — no new code introduced. Product Hub is self-contained: its pages, components, API routes, and types are used nowhere outside its own module except the dashboard (which gets cleaned up as a separate task) and the sidebar nav link (a hard-coded string, not an import). Settings cleanup is a straightforward removal of two imported components from one page.

**Tech Stack:** Next.js 15 (App Router), TypeScript, SQLite via better-sqlite3, Tailwind CSS, shadcn/ui

---

## File Map

### Task 1 — Remove Product Hub tab

| Action | Path |
|--------|------|
| Modify | `src/components/layout/app-sidebar.tsx` |
| Delete | `src/app/(app)/product-hub/page.tsx` |
| Delete | `src/app/(app)/product-hub/[id]/page.tsx` |
| Delete | `src/components/product-hub/contract-link-dialog.tsx` |
| Delete | `src/components/product-hub/export-menu.tsx` |
| Delete | `src/components/product-hub/gap-qa-panel.tsx` |
| Delete | `src/components/product-hub/output-section.tsx` |
| Delete | `src/components/product-hub/product-feature-card.tsx` |
| Delete | `src/components/product-hub/status-badge.tsx` |
| Delete | `src/components/product-hub/step1-intake-form.tsx` |
| Delete | `src/components/product-hub/step2-document-context.tsx` |
| Delete | `src/components/product-hub/step3-template-selector.tsx` |
| Delete | `src/components/product-hub/step4-output-viewer.tsx` |
| Delete | `src/components/product-hub/version-history-drawer.tsx` |
| Delete | `src/components/product-hub/wizard-progress-bar.tsx` |
| Delete | `src/app/api/product-hub/route.ts` |
| Delete | `src/app/api/product-hub/[id]/route.ts` |
| Delete | `src/app/api/product-hub/[id]/generate/route.ts` |
| Delete | `src/app/api/product-hub/[id]/regenerate/route.ts` |
| Delete | `src/app/api/product-hub/[id]/export-drive/route.ts` |
| Delete | `src/app/api/product-hub/[id]/suggest-answers/route.ts` |

### Task 2 — Remove Product Hub from Dashboard

| Action | Path |
|--------|------|
| Modify | `src/app/(app)/dashboard/page.tsx` |
| Modify | `src/app/api/dashboard/route.ts` |
| Modify | `src/lib/db-imports.ts` |
| Modify | `src/lib/types.ts` |

### Task 3 — Clean up Settings page

| Action | Path |
|--------|------|
| Modify | `src/app/(app)/settings/page.tsx` |
| Delete | `src/components/settings/maintenance-section.tsx` |
| Delete | `src/components/settings/statistics-section.tsx` |

---

## Task 1: Remove Product Hub Tab

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Delete: `src/app/(app)/product-hub/` (both page files)
- Delete: `src/components/product-hub/` (all 10 component files)
- Delete: `src/app/api/product-hub/` (all 6 API route files)

- [ ] **Step 1: Remove Product Hub from sidebar navigation**

In `src/components/layout/app-sidebar.tsx`, remove the `{ title: "Product Hub", href: "/product-hub", icon: Package }` entry from the bottom standalones array. Also remove the `Package` import from `lucide-react` (it's only used there).

The array at line ~174 currently reads:
```tsx
[
  { title: "Product Hub", href: "/product-hub", icon: Package },
  { title: "Settings", href: "/settings", icon: Settings },
  ...(isAdmin ? [{ title: "Users", href: "/users", icon: Users }] : []),
]
```

Change it to:
```tsx
[
  { title: "Settings", href: "/settings", icon: Settings },
  ...(isAdmin ? [{ title: "Users", href: "/users", icon: Users }] : []),
]
```

And change the import line from:
```tsx
import { FileText, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks } from "lucide-react";
```
to:
```tsx
import { FileText, ClipboardCheck, Settings, MessageSquare, Layers, Shield, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks } from "lucide-react";
```

- [ ] **Step 2: Delete product-hub page files**

```bash
rm -rf "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/(app)/product-hub"
```

- [ ] **Step 3: Delete product-hub component files**

```bash
rm -rf "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/components/product-hub"
```

- [ ] **Step 4: Delete product-hub API route files**

```bash
rm -rf "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/app/api/product-hub"
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: No errors related to product-hub. (There may be pre-existing type errors unrelated to this change — ignore those. Only fail if you see errors mentioning product-hub paths.)

- [ ] **Step 6: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add -A
git commit -m "chore: remove product hub tab, pages, components, and API routes"
```

---

## Task 2: Remove Product Hub from Dashboard

**Context:** The dashboard page has two product-hub widgets: a "Features" KPI card (4th in a 4-column grid) and a "Product Hub" status bar section at the bottom. The dashboard API route calls `getProductFeatures` and returns a `features` key. The `DashboardData` interface and the `FEATURE_STATUSES`/`STATUS_LABELS` imports also need cleanup.

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/lib/db-imports.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Clean up `dashboard/page.tsx`**

Remove the `FEATURE_STATUSES` and `STATUS_LABELS` imports and the `TrendingUp` icon import (only used in the Product Hub status bar).

Change:
```tsx
import { FileText, AlertTriangle, Briefcase, Rocket, TrendingUp } from "lucide-react";
import { FEATURE_STATUSES, STATUS_LABELS } from "@/lib/types";
```
To:
```tsx
import { FileText, AlertTriangle, Briefcase } from "lucide-react";
```

Remove `features` from the `DashboardData` interface:
```tsx
// Remove this line from the interface:
features: { total: number; byStatus: Record<string, number> };
```

Remove the "Features" KPI card block (lines ~88-93) and change the grid from 4 columns to 3:
```tsx
// Change:
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
// To:
<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
```

Remove the entire `Rocket` KPI card:
```tsx
// Delete this block:
<KpiCard
  icon={Rocket} label="Features" href="/product-hub"
  value={data.features.total}
  sub={`${data.features.byStatus["shipped"] ?? 0} shipped`}
/>
```

Remove the entire Product Hub status bar section at the bottom of the page (the block that starts with `{data && data.features.total > 0 && (`).

Also update the skeleton loading count from 4 to 3:
```tsx
// Change:
Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
// To:
Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
```

- [ ] **Step 2: Clean up `api/dashboard/route.ts`**

Remove the `getProductFeatures` import:
```ts
// Remove from the import list:
getProductFeatures,
```

Remove the features query and status breakdown:
```ts
// Delete:
const features = getProductFeatures() as Array<{ status: string }>;

// Delete:
// Feature status breakdown
const byStatus: Record<string, number> = {};
for (const f of features) {
  byStatus[f.status] = (byStatus[f.status] || 0) + 1;
}
```

Remove `features` from the response JSON:
```ts
// Delete from NextResponse.json({...}):
features: {
  total: features.length,
  byStatus,
},
```

- [ ] **Step 3: Remove product-feature re-exports from `src/lib/db-imports.ts`**

`db-imports.ts` re-exports five product-feature DB functions. After Task 1 removes all product-hub code, these are dead exports. Remove them:

```bash
grep -n "ProductFeature\|createProductFeature\|getProductFeature\|updateProductFeature\|deleteProductFeature" "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/lib/db-imports.ts"
```

Delete the five lines that export `createProductFeature`, `getProductFeatures`, `getProductFeature`, `updateProductFeature`, and `deleteProductFeature`.

- [ ] **Step 4: Remove product-hub types from `src/lib/types.ts`**

Search for and remove the following type definitions and constants. They are all product-hub-only and nothing else in the codebase (after Task 1 and Steps 1-3 above) references them:

- `ProductFeature` interface/type
- `IntakeForm` interface/type (and its sub-types `SectionA`, `SectionB`, `SectionC` if defined inline)
- `TemplateId` type
- `GeneratedOutputs` type
- `FeatureStatus` type
- `FEATURE_STATUSES` constant
- `STATUS_LABELS` constant
- `STATUS_COLORS` constant
- `TEMPLATES` constant
- `TEMPLATE_SECTIONS` constant
- `SECTION_ICON_NAMES` constant

To find them precisely:
```bash
grep -n "ProductFeature\|IntakeForm\|TemplateId\|GeneratedOutputs\|FeatureStatus\|FEATURE_STATUSES\|STATUS_LABELS\|STATUS_COLORS\|TEMPLATES\|TEMPLATE_SECTIONS\|SECTION_ICON_NAMES" "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/lib/types.ts"
```

Delete each block from the type definition to its closing brace/semicolon.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: No errors about missing `features`, `FEATURE_STATUSES`, or product-hub types.

- [ ] **Step 6: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add -A
git commit -m "chore: remove product hub from dashboard, db-imports, and types"
```

---

## Task 3: Clean Up Settings Page

**Context:** The settings page currently renders 5 sections. We're removing `MaintenanceSection` (manual maintenance trigger — a developer tool) and `StatisticsSection` (a static pricing reference table — informational only, not a setting). What remains: `AIConfigSection`, `PoliciesSection` (in its Card wrapper), and `GDriveSection`.

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Delete: `src/components/settings/maintenance-section.tsx`
- Delete: `src/components/settings/statistics-section.tsx`

- [ ] **Step 1: Remove MaintenanceSection and StatisticsSection from settings page**

In `src/app/(app)/settings/page.tsx`:

Remove these two import lines:
```tsx
import { MaintenanceSection } from "@/components/settings/maintenance-section";
import { StatisticsSection } from "@/components/settings/statistics-section";
```

Remove these two JSX elements from the return:
```tsx
<MaintenanceSection />

<StatisticsSection />
```

The resulting page body should render only:
```tsx
<AIConfigSection
  settings={settings}
  onSettingsChange={handleSettingsChange}
  onSave={handleSave}
  onReset={handleReset}
  saving={saving}
/>

<Card>
  <CardHeader>
    <CardTitle className="text-base">Policies</CardTitle>
  </CardHeader>
  <CardContent>
    <PoliciesSection
      selectedTypes={settings?.policiesTabDocTypes ?? ["policy", "procedure"]}
      onChange={(types) => handleSettingsChange({ policiesTabDocTypes: types })}
    />
  </CardContent>
</Card>

<GDriveSection />
```

- [ ] **Step 2: Delete the now-unused component files**

```bash
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/components/settings/maintenance-section.tsx"
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/components/settings/statistics-section.tsx"
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: No errors. If there are errors about `MaintenanceSection` or `StatisticsSection`, you missed an import or JSX reference.

- [ ] **Step 4: Verify build succeeds**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npm run build
```

Expected: Build completes without errors. This is the final verification for the entire cleanup — a successful build confirms no broken imports survive across all 3 tasks.

- [ ] **Step 5: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add -A
git commit -m "chore: clean up settings page — remove maintenance and statistics sections"
```
