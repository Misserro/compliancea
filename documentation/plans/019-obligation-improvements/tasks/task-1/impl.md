## Task 1 Complete -- Navigation cleanup: standalone /obligations page + simplified contracts page

- Modified: `src/app/(app)/obligations/page.tsx` (replaced 5-line redirect stub with full standalone page)
  - `"use client"` with useState/useEffect for stats fetch
  - Fetches `/api/obligations?filter=all` on mount; response provides `{ stats: { total, active, overdue, upcoming, met, finalized } }`
  - Renders: h1 "Obligations", subtitle, stats bar (4 chips: Active, Overdue, Upcoming 30d, Completed), then `<ObligationsTab />`
  - Stats chips follow dashboard Product Hub pattern: `rounded-full border px-3 py-1 text-xs`
  - Overdue chip uses `text-destructive` + `border-destructive/30` when count > 0
  - Upcoming chip uses `text-amber-600 dark:text-amber-400` when count > 0
  - Completed count = `stats.met + stats.finalized` (both represent completed states)
  - Skeleton loading state for chips while fetch is in-flight

- Modified: `src/app/(app)/contracts/page.tsx` (simplified from 50 lines to 8 lines)
  - Removed: `Suspense`, `useSearchParams`, `Link`, `ObligationsTab` imports
  - Removed: `ContractsPageContent` inner component with tab bar and activeTab logic
  - Removed: `"use client"` directive (now a server component -- ContractsTab handles its own client state)
  - Now renders: `<ContractsTab />` directly inside the standard page layout div

- NOT modified: `src/components/layout/app-sidebar.tsx` (already links to `/obligations` at line 125 -- no changes needed)
- NOT modified: `src/components/contracts/obligations-tab.tsx` (used as-is)

- INTEGRATION: Task 3 will further enhance the `/obligations` page layout with category + status filters. The current structure (heading + stats bar + ObligationsTab) provides the foundation.
- GOTCHA: The contracts page no longer responds to `?tab=obligations` query param. Any bookmarks to `/contracts?tab=obligations` will just show contracts. The sidebar "Obligations" link goes to `/obligations` which is the correct destination.
