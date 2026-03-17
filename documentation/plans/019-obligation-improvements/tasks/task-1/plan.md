# Task 1 Plan: Navigation cleanup -- standalone /obligations page + simplify contracts page

## Files to Modify

1. **`src/app/(app)/obligations/page.tsx`** -- replace redirect stub with real page
2. **`src/app/(app)/contracts/page.tsx`** -- remove tab switcher, render ContractsTab directly

## Changes

### 1. `src/app/(app)/obligations/page.tsx`

Replace the entire file (currently 5 lines: `redirect("/contracts?tab=obligations")`).

New content:
- `"use client"` directive (needs useState/useEffect for stats fetch)
- Import `ObligationsTab` from `@/components/contracts/obligations-tab`
- Import `Skeleton` from `@/components/ui/skeleton` for loading state
- Fetch stats on mount from `/api/obligations?filter=all` -- response shape: `{ stats: { total, active, overdue, upcoming, met, finalized } }`
- Render:
  - Outer div: `className="p-6 max-w-7xl mx-auto space-y-6"` (matches contracts page layout)
  - Page heading: `<h1 className="text-2xl font-semibold tracking-tight">Obligations</h1>` (matches dashboard h2 pattern but using h1 since it is the page title)
  - Stats bar: 4 chips in a flex row (Active, Overdue in destructive color, Upcoming 30d in amber, Completed)
    - Each chip: `rounded-full border px-3 py-1 text-xs` with label + bold count (similar to dashboard Product Hub status bar pattern)
    - Overdue chip: `text-destructive` when count > 0
    - Upcoming chip: `text-amber-600` when count > 0
    - Skeleton chips while loading
  - `<ObligationsTab />` component below the stats bar

### 2. `src/app/(app)/contracts/page.tsx`

Simplify from 50 lines to ~10 lines:
- Remove: `Suspense`, `useSearchParams`, `Link`, `ObligationsTab` imports
- Remove: `ContractsPageContent` inner component with tab logic
- Remove: tab bar div (`flex gap-0 border-b` with Contracts/Obligations links)
- Remove: `activeTab` conditional rendering
- Keep: `ContractsTab` import
- New structure: simple default export that renders `<div className="p-6 max-w-7xl mx-auto space-y-6"><ContractsTab /></div>`
- Since `ContractsTab` is `"use client"`, the page wrapper can be a plain server component (no `"use client"` needed on the page itself)

## Success Criteria Mapping

- GET /obligations renders real page with heading, stats, list -- YES: new page.tsx with ObligationsTab
- GET /contracts renders contracts list with no Obligations tab -- YES: tab bar removed, ContractsTab rendered directly
- Sidebar link to /obligations works -- YES: sidebar already links to `/obligations` (verified in app-sidebar.tsx line 125)
- npm run build passes -- YES: no new type errors, all imports valid

## Risks

- None significant. Both changes are purely wiring/layout -- no API changes, no component restructuring.
- The stats API response includes `met` and `finalized` but not a combined "completed" count. Will use `met + finalized` for the "Completed" chip (or just `met` since that is the completion status in the domain).
