# Task 2 Implementation Plan -- Contracts Hub route migration + /contracts dashboard

## Overview

Move the existing contracts list from `/contracts` to `/contracts/list`, move the new contract form from `/contracts/new` to `/contracts/list/new`, move obligations from `/obligations` to `/contracts/obligations`, create a new hub dashboard at `/contracts`, and add permanent redirects for old URLs.

## Files to Create/Modify

### 1. `src/app/(app)/contracts/list/page.tsx` (NEW)
- Move the current `src/app/(app)/contracts/page.tsx` content here (the `ContractsTab` wrapper).
- Exact copy -- no changes needed since ContractsTab is a self-contained component.

### 2. `src/app/(app)/contracts/list/new/page.tsx` (NEW)
- Move `src/app/(app)/contracts/new/page.tsx` here. Same Suspense wrapper importing ContractsNewForm.

### 3. `src/app/(app)/contracts/list/new/ContractsNewForm.tsx` (NEW)
- Move `src/app/(app)/contracts/new/ContractsNewForm.tsx` here.
- Update `router.push("/contracts")` (line 309) to `router.push("/contracts/list")`.
- Update `<Link href="/contracts"` (line 320) to `<Link href="/contracts/list"`.

### 4. `src/app/(app)/contracts/obligations/page.tsx` (NEW)
- Move the current `src/app/(app)/obligations/page.tsx` here.
- No internal route references to update (the obligations page doesn't link to itself or use `/obligations` as a push target).

### 5. `src/app/(app)/contracts/page.tsx` (REPLACE)
- Replace with new Contracts hub dashboard.
- Client component following `dashboard/page.tsx` KPI card pattern.
- Fetch from `/api/dashboard`, extract `contracts` and `obligations` sections.
- KPI cards: Total Contracts, Active Contracts, Overdue Obligations.
- Detail panels: Contracts Expiring Soon, Upcoming Obligations.
- Links point to `/contracts/list` and `/contracts/obligations`.
- Permission gate: `canView('contracts')` using session permissions (same pattern as dashboard).
- Layout: `p-6 max-w-6xl mx-auto space-y-8` (matching dashboard).

### 6. `next.config.mjs` (MODIFY)
- Add `redirects()` async function to the Next.js config.
- Redirects:
  - `{ source: '/obligations', destination: '/contracts/obligations', permanent: true }`
  - `{ source: '/contracts/new', destination: '/contracts/list/new', permanent: true }`

### 7. Delete old files (after new ones are in place)
- `src/app/(app)/contracts/new/page.tsx` -- replaced by `contracts/list/new/page.tsx`
- `src/app/(app)/contracts/new/ContractsNewForm.tsx` -- replaced by `contracts/list/new/ContractsNewForm.tsx`
- `src/app/(app)/obligations/page.tsx` -- replaced by `contracts/obligations/page.tsx`

## Dashboard Design Details

The hub dashboard will replicate the `KpiCard` inline component from `dashboard/page.tsx` (icon, label, value, sub, href, accent). The component is defined inline in `dashboard/page.tsx` -- I will define a similar inline component in the new contracts dashboard page to keep it self-contained and consistent.

**KPI Cards (3 cards, grid layout):**
1. Total Contracts -- icon: Briefcase, value: `contracts.total`, sub: "{active} active"
2. Active Contracts -- icon: FileCheck, value: `contracts.active`, accent green if > 0
3. Overdue Obligations -- icon: AlertTriangle, value: `obligations.overdue`, accent red if > 0, sub: "{active} active obligations"

**Detail Panels (2 panels, side by side):**
1. Contracts Expiring Soon (next 60 days) -- same pattern as dashboard's "contractsExpiringSoon" panel, links to `/contracts/list`
2. Upcoming Obligations (next 30 days) -- same pattern as dashboard's "upcomingObligations" panel, links to `/contracts/obligations`

## Success Criteria Mapping

- GET /contracts -> new hub dashboard with KPIs and detail panels -- COVERED by file #5
- GET /contracts/list -> existing contracts list -- COVERED by file #1
- GET /contracts/list/new -> new contract form -- COVERED by files #2, #3
- GET /contracts/obligations -> obligations page -- COVERED by file #4
- /obligations -> 308 redirect to /contracts/obligations -- COVERED by file #6
- /contracts/new -> 308 redirect to /contracts/list/new -- COVERED by file #6
- No 404s -- all old routes either moved or redirected

## Risks

- **Task 5 dependency**: The global dashboard page (`dashboard/page.tsx`) has links to `/obligations` and `/contracts` that will become stale. Task 5 is responsible for updating those -- this is explicitly out of scope for Task 2.
- **Sidebar links**: `app-sidebar.tsx` has href="/obligations" -- Task 4 will replace the sidebar entirely. Out of scope.
- **documents/page.tsx** has `onNavigateToObligations={() => router.push("/obligations")}` -- Task 5 scope.
- **Redirect ordering**: `/contracts/new` redirect must not interfere with existing `/contracts/list/new` route -- Next.js checks redirects before filesystem routes, but since `/contracts/list/new` is a different path from the redirect source `/contracts/new`, there is no conflict.
