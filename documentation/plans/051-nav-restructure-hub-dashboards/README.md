# Plan 051 — Navigation Restructure & Hub Dashboards

## Summary

Replace the flat hub-labeled sidebar with three collapsible category sections (Contract, Legal, Documents), each with a clickable header linking to a dedicated hub dashboard and an arrow toggle for expanding/collapsing sub-pages. Restructure URL routes to align with the new hierarchy and add redirects for old URLs.

**Before:** Three flat groups labeled "Contract Hub / Legal Hub / Documents Hub" with non-interactive group labels. Hub landing pages are existing list views. Routes are scattered (`/legal-hub`, `/obligations`, `/document-tools`).

**After:** Three collapsible categories. Category headers link to new hub dashboard pages. Sub-pages nested cleanly beneath each category. Routes follow the hierarchy (`/legal/cases`, `/contracts/obligations`, `/documents/ai-tools`). Old URLs redirect permanently.

**Absorbs:** Plan 043 Tasks 3 & 5 (Policies nav removal — already done; separator before My Law Firm — handled in Task 4 sidebar refactor).

---

## Context

Codebase: Next.js 15 App Router, shadcn/ui sidebar with `Collapsible` primitive (`src/components/ui/collapsible.tsx`), next-intl (cookie-based locale), Tailwind v4.

`SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` are exported from `src/components/ui/sidebar.tsx` but not currently used — ready for wiring up.

Key files touched:
- `src/components/layout/app-sidebar.tsx` — entire sidebar refactored
- `src/app/(app)/legal/` — new route tree (moved from `legal-hub/`)
- `src/app/(app)/contracts/` — new sub-routes + dashboard
- `src/app/(app)/documents/` — new sub-routes + dashboard
- `next.config.mjs` — permanent redirects for old routes
- `messages/en.json` + `messages/pl.json` — i18n key updates
- `src/app/(app)/dashboard/page.tsx` — update hardcoded old route links

---

## Tasks

- [ ] **Task 1 — Legal Hub: route migration + `/legal` dashboard**
- [ ] **Task 2 — Contracts Hub: route migration + `/contracts` dashboard**
- [ ] **Task 3 — Documents Hub: route migration + `/documents` dashboard**
- [ ] **Task 4 — Sidebar: collapsible category navigation**
- [ ] **Task 5 — Internal link sweep + i18n cleanup**

---

## Task 1 — Legal Hub: route migration + `/legal` dashboard

### Goal

Migrate all Legal Hub pages from `/legal-hub/*` to `/legal/*`, create a new hub dashboard at `/legal`, and add permanent redirects for old URLs.

The current `/legal-hub` renders the cases list (`LegalHubDashboard` component). In the new structure, `/legal` is a dedicated overview dashboard and `/legal/cases` is the cases list.

### Files

| File | Change |
|---|---|
| `src/app/(app)/legal/page.tsx` | New — Legal hub dashboard (KPI: open cases, upcoming deadlines, recent cases) |
| `src/app/(app)/legal/cases/page.tsx` | Moved from `legal-hub/page.tsx` |
| `src/app/(app)/legal/cases/[id]/page.tsx` | Moved from `legal-hub/[id]/page.tsx` |
| `src/app/(app)/legal/templates/page.tsx` | Moved from `legal-hub/templates/page.tsx` |
| `src/app/(app)/legal/firm/page.tsx` | Moved from `legal-hub/firm/page.tsx` |
| `next.config.mjs` | Add redirects: `/legal-hub` → `/legal/cases`, `/legal-hub/:path*` → `/legal/cases/:path*`, `/legal-hub/templates` → `/legal/templates`, `/legal-hub/firm` → `/legal/firm` |

### Implementation Notes

**New `/legal` dashboard** (`src/app/(app)/legal/page.tsx`):
- Client component, fetches from `/api/dashboard` (reuse existing endpoint — the `legalHub` section already returns `statsByStatus`, `upcomingDeadlines`, `recentCases`)
- Layout: KPI cards (open cases count, upcoming deadlines count) + detail panels (upcoming deadlines list, recent cases list) — same card/panel style as `src/app/(app)/dashboard/page.tsx`
- All list items link to `/legal/cases` and `/legal/cases/[id]`
- Permission gate: check `canView('legal_hub')` using session permissions

**Route moves** — copy page files to new paths, then delete old ones:
- The `LegalHubDashboard` component (used by old `legal-hub/page.tsx`) now becomes the Cases page at `/legal/cases`
- Internal `router.push("/legal-hub/...")` references inside moved components must be updated to `/legal/cases/...`

**Redirects** in `next.config.mjs`:
```js
{ source: '/legal-hub', destination: '/legal/cases', permanent: true },
{ source: '/legal-hub/templates', destination: '/legal/templates', permanent: true },
{ source: '/legal-hub/firm', destination: '/legal/firm', permanent: true },
{ source: '/legal-hub/:id', destination: '/legal/cases/:id', permanent: true },
```

Note: ordering matters — specific paths (`/templates`, `/firm`) must come before the catch-all `/:id`.

### Success Criteria

- `GET /legal` renders a Legal hub dashboard with KPI cards and case/deadline lists
- `GET /legal/cases` renders the existing cases list (formerly `/legal-hub`)
- `GET /legal/cases/[id]` renders case detail (formerly `/legal-hub/[id]`)
- `GET /legal/templates` and `/legal/firm` render their respective pages
- Navigating to any old `/legal-hub/*` URL redirects permanently to the corresponding `/legal/*` URL
- No 404s on any Legal Hub pages

---

## Task 2 — Contracts Hub: route migration + `/contracts` dashboard

### Goal

Add a new hub dashboard at `/contracts`, move the existing contracts list to `/contracts/list`, move obligations from `/obligations` to `/contracts/obligations`, and add redirects.

### Files

| File | Change |
|---|---|
| `src/app/(app)/contracts/page.tsx` | Replace contracts list with new hub dashboard |
| `src/app/(app)/contracts/list/page.tsx` | New — existing contracts list moved here |
| `src/app/(app)/contracts/list/new/page.tsx` | New — moved from `contracts/new/` |
| `src/app/(app)/contracts/obligations/page.tsx` | New — existing obligations page moved here |
| `next.config.mjs` | Add redirects: `/obligations` → `/contracts/obligations`, `/contracts/new` → `/contracts/list/new` |

### Implementation Notes

**New `/contracts` dashboard** (`src/app/(app)/contracts/page.tsx`):
- Rewrite existing page as a hub dashboard (replace list view with overview)
- Fetches from `/api/dashboard` — the `contracts` and `obligations` sections already return `total`, `active`, `expiringSoon`, `overdue`, `upcoming`
- Layout: KPI cards (total contracts, active contracts, overdue obligations) + detail panels (contracts expiring soon, upcoming obligations) — same style as `dashboard/page.tsx`
- Links point to `/contracts/list` and `/contracts/obligations`

**Contracts list** — move `src/app/(app)/contracts/page.tsx` (current) → `src/app/(app)/contracts/list/page.tsx` before overwriting. Also move `contracts/new/` → `contracts/list/new/`.

**Obligations** — move `src/app/(app)/obligations/page.tsx` → `src/app/(app)/contracts/obligations/page.tsx`. Update any `router.push("/obligations")` inside that file to `/contracts/obligations`.

**Redirects**:
```js
{ source: '/obligations', destination: '/contracts/obligations', permanent: true },
{ source: '/contracts/new', destination: '/contracts/list/new', permanent: true },
```

### Success Criteria

- `GET /contracts` renders a Contracts hub dashboard with KPI cards (total, active, overdue) and detail panels (expiring soon, upcoming obligations)
- `GET /contracts/list` renders the existing contracts list (formerly `/contracts`)
- `GET /contracts/list/new` renders the new contract form (formerly `/contracts/new`)
- `GET /contracts/obligations` renders the obligations page (formerly `/obligations`)
- Navigating to `/obligations` redirects permanently to `/contracts/obligations`
- No 404s on any Contracts Hub pages

---

## Task 3 — Documents Hub: route migration + `/documents` dashboard

### Goal

Add a new hub dashboard at `/documents`, move the existing documents library to `/documents/library`, and move AI Tools from `/document-tools` to `/documents/ai-tools`.

### Files

| File | Change |
|---|---|
| `src/app/(app)/documents/page.tsx` | Replace documents library with new hub dashboard |
| `src/app/(app)/documents/library/page.tsx` | New — existing documents library moved here |
| `src/app/(app)/documents/ai-tools/page.tsx` | New — existing AI tools page moved from `document-tools/` |
| `next.config.mjs` | Add redirects: `/document-tools` → `/documents/ai-tools`, old `/ask` → `/documents/ai-tools` |

### Implementation Notes

**New `/documents` dashboard** (`src/app/(app)/documents/page.tsx`):
- Rewrite as hub dashboard, fetching from `/api/dashboard` — the `docs` section returns `total`, `processed`, `byType`
- Layout: KPI cards (total documents, processed count, by-type breakdown) + quick-action links to library and AI tools — same card style as `dashboard/page.tsx`
- Links point to `/documents/library` and `/documents/ai-tools`

**Documents library** — move current `src/app/(app)/documents/page.tsx` → `src/app/(app)/documents/library/page.tsx` before overwriting. Preserve all existing filter chip functionality (Plan 043 Task 3 changes already applied).

**AI Tools** — move `src/app/(app)/document-tools/page.tsx` → `src/app/(app)/documents/ai-tools/page.tsx`. The tabbed Analyze+Ask page (built in Plan 043 Task 2) moves as-is.

**Redirects**:
```js
{ source: '/document-tools', destination: '/documents/ai-tools', permanent: true },
{ source: '/ask', destination: '/documents/ai-tools', permanent: true },
```

### Success Criteria

- `GET /documents` renders a Documents hub dashboard with KPI cards (total, processed, by type)
- `GET /documents/library` renders the existing documents list with filter chips (formerly `/documents`)
- `GET /documents/ai-tools` renders the tabbed AI tools page (formerly `/document-tools`)
- Navigating to `/document-tools` or `/ask` redirects permanently to `/documents/ai-tools`
- No 404s on any Documents Hub pages

---

## Task 4 — Sidebar: collapsible category navigation

**Depends on:** Tasks 1, 2, 3 (new routes must exist before sidebar links point to them)

### Goal

Refactor `app-sidebar.tsx` to replace flat `SidebarGroup` + `SidebarGroupLabel` hub sections with `Collapsible`-powered category items. Each category header is both a navigation link (to the hub dashboard) and shows a chevron toggle for expanding/collapsing sub-pages. All three categories default to expanded.

### Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Full sidebar refactor — collapsible categories |
| `messages/en.json` | Update: remove `contractHub`, `legalHub`, `documentsHub`; add `contract`, `legal`, `documents` (category labels) |
| `messages/pl.json` | Polish equivalents |

### Implementation Notes

**New pattern** — replace each hub `SidebarGroup` with a `SidebarMenuItem` wrapping a `Collapsible`:

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";

// Inside SidebarMenu:
<SidebarMenuItem>
  <Collapsible defaultOpen className="group/collapsible">
    {/* Category header: link + chevron toggle */}
    <div className="flex items-center">
      <SidebarMenuButton
        asChild
        isActive={pathname === "/contracts" || pathname.startsWith("/contracts/")}
        tooltip={tSidebar("contract")}
      >
        <Link href="/contracts">
          <ClipboardCheck />
          <span>{tSidebar("contract")}</span>
        </Link>
      </SidebarMenuButton>
      <CollapsibleTrigger asChild>
        <SidebarMenuAction showOnHover={false}>
          <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          <span className="sr-only">Toggle</span>
        </SidebarMenuAction>
      </CollapsibleTrigger>
    </div>
    {/* Sub-pages */}
    <CollapsibleContent>
      <SidebarMenuSub>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            asChild
            isActive={pathname === "/contracts/list" || pathname.startsWith("/contracts/list/")}
          >
            <Link href="/contracts/list">
              <ClipboardCheck />
              <span>{tSidebar("contracts")}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            asChild
            isActive={pathname === "/contracts/obligations" || pathname.startsWith("/contracts/obligations/")}
          >
            <Link href="/contracts/obligations">
              <ListChecks />
              <span>{tSidebar("obligations")}</span>
              {overdueCount > 0 && (
                <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                  {overdueCount}
                </Badge>
              )}
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>
    </CollapsibleContent>
  </Collapsible>
</SidebarMenuItem>
```

Apply the same pattern for Legal and Documents categories. Permission/feature gates remain at the `SidebarMenuItem` (category) level — if a user can't access Legal Hub, the entire Legal category is hidden.

**Legal category sub-pages:**
- Cases → `/legal/cases`
- Templates → `/legal/templates`
- My Law Firm → `/legal/firm` (admin/owner only — `orgRole !== "member"`; add `<SidebarSeparator />` before it inside the sub-menu)

**Documents category sub-pages:**
- Documents → `/documents/library`
- AI Tools → `/documents/ai-tools`

**i18n changes:**
- Remove keys: `contractHub`, `legalHub`, `documentsHub`
- Add keys: `contract` ("Contract" / "Umowy"), `legal` ("Legal" / "Prawo"), `documents` ("Documents" / "Dokumenty")
  - Note: `documents` key already exists — can reuse it for the category label

**Active state**: Category header `isActive` should be true when on the hub dashboard itself OR on any sub-page. Use `pathname.startsWith("/contracts/")` etc.

### Success Criteria

- Sidebar shows three collapsible categories: Contract, Legal, Documents
- All three are expanded by default on first load
- Clicking a category label navigates to the hub dashboard (`/contracts`, `/legal`, `/documents`)
- Clicking the chevron arrow toggles the sub-pages without navigating
- Sub-pages appear indented below the category when expanded
- Permission/feature gates work — hidden categories don't appear
- Overdue obligations badge still renders on Obligations sub-item
- My Law Firm sub-item is still admin/owner-only with a separator above it
- Sidebar collapse (icon mode) still works — sub-items hidden, category icon+tooltip visible

---

## Task 5 — Internal link sweep + i18n cleanup

**Depends on:** Tasks 1, 2, 3, 4

### Goal

Update all hardcoded references to old routes throughout the codebase. Ensure no page uses a deprecated URL as a `href` or `router.push` target. Clean up any removed i18n keys.

### Files

| File | Change |
|---|---|
| `src/app/(app)/dashboard/page.tsx` | Update `href="/legal-hub"`, `router.push("/legal-hub")`, `href="/obligations"` → new routes |
| Any component referencing `/legal-hub/*`, `/obligations`, `/document-tools`, `/ask` | Update to new routes |
| `messages/en.json` + `messages/pl.json` | Remove `contractHub`, `legalHub`, `documentsHub` keys if no longer referenced |

### Implementation Notes

**Search targets** — grep the entire `src/` directory for:
- `/legal-hub` — update to `/legal/cases` (list) or `/legal` (hub)
- `/obligations` — update to `/contracts/obligations`
- `/document-tools` — update to `/documents/ai-tools`
- `/ask` (as route string) — update to `/documents/ai-tools`
- `/contracts/new` — update to `/contracts/list/new`

The global `dashboard/page.tsx` has at minimum these stale references:
- Line 104: `href="/documents"` — this will now be the Documents hub dashboard (OK if intended)
- Line 111: `href="/obligations"` → `/contracts/obligations`
- Line 119: `href="/contracts"` → `/contracts/list` (or keep as hub if appropriate)
- Line 127: `href="/legal-hub"` → `/legal`
- Line 297: `` router.push(`/legal-hub/${c.id}`) `` → `` router.push(`/legal/cases/${c.id}`) ``

Also update any moved page files that have `router.push` to old sibling routes (e.g. obligations page linking back to itself).

**i18n cleanup** — once `contractHub`, `legalHub`, `documentsHub` are no longer referenced in `app-sidebar.tsx`, remove those keys from both message files to avoid stale translation debt.

### Success Criteria

- `grep -r "/legal-hub" src/` returns zero results
- `grep -r '"/obligations"' src/` returns zero results (only `/contracts/obligations` used)
- `grep -r '"/document-tools"' src/` returns zero results
- `grep -r '"contractHub"\|"legalHub"\|"documentsHub"' messages/` returns zero results
- All navigation from the global dashboard, case detail pages, etc. lands on correct new routes
- No browser console errors about missing routes during normal app navigation
