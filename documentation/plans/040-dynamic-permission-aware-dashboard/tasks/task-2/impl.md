# Task 2 Complete -- Permission-gated dashboard UI + legal hub sections

## Files Changed

- **Modified:** `src/app/(app)/dashboard/page.tsx` (full rewrite: permission gating + legal hub sections)
- **Modified:** `messages/en.json` (added 6 Dashboard namespace keys after `daysShort`)
- **Modified:** `messages/pl.json` (added 6 Dashboard namespace keys after `daysShort`, Polish translations)

## Implementation Details

### `src/app/(app)/dashboard/page.tsx`

**New imports:**
- `useSession` from `next-auth/react` (to read session permissions)
- `Scale` from `lucide-react` (Open Cases KPI icon)
- `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`

**`DashboardData` interface updated:**
- `docs`, `obligations`, `contracts` all made optional (`?`) since API omits them when user lacks access
- Added optional `legalHub` field with `statsByStatus`, `upcomingDeadlines`, `recentCases` sub-types

**`KpiCard` component updated:**
- Added optional `subNode` prop (ReactNode) alongside existing `sub` (string) -- `subNode` takes precedence when provided
- Used by Open Cases card to render the inline status badges

**`canView` function (lines 63-67):**
- Identical pattern to `src/components/layout/app-sidebar.tsx:65-68`
- Reads `permissions` from `useSession()` data
- `null`/`undefined` permissions = full access (owner/admin)
- Checks `PERMISSION_LEVELS` >= 1 for view access

**KPI cards section:**
- Grid changed from `lg:grid-cols-3` to `lg:grid-cols-4` (4 possible cards now)
- Each card wrapped in permission + data guard: `showDocs && data.docs && ...`
- Skeleton count dynamically computed from `visibleCardCount`
- Entire KPI section hidden when `visibleCardCount === 0`

**Open Cases KPI card:**
- Count = sum of all `statsByStatus[].count` (API already filters to non-closed/archived)
- Sub-line = compact inline badges: `new 2 · intake 1 · filed 3` using `\u00b7` separator
- Falls back to `t("openCasesSub", { count: 0 })` when no statuses
- Icon: `Scale`, href: `/legal-hub`

**Panel grid section:**
- Wrapped existing Upcoming Obligations and Contracts Expiring panels in `showContracts &&`
- Added Upcoming Court Deadlines panel: same visual pattern as Upcoming Obligations
  - Each item onClick navigates to `/legal-hub`
  - Shows deadline title + case_title, days remaining with red accent for <= 7 days
- Added Recent Cases panel: same visual pattern
  - Each item onClick navigates to `/legal-hub/{id}`
  - Shows case title, case_type + assigned_to_name, status badge
- Entire panel grid hidden when neither contracts nor legal hub visible

**Empty state:**
- When all canView return false: both KPI grid and panel grid are hidden, leaving only title + subtitle

### i18n keys added

**en.json (Dashboard namespace):**
- `openCases`: "Open Cases"
- `openCasesSub`: "{count} active statuses"
- `upcomingDeadlines`: "Upcoming Court Deadlines"
- `noUpcomingCaseDeadlines`: "No upcoming court deadlines."
- `recentCases`: "Recent Cases"
- `noRecentCases`: "No cases yet."

**pl.json (Dashboard namespace):**
- `openCases`: "Otwarte sprawy"
- `openCasesSub`: "{count} aktywnych statusow"
- `upcomingDeadlines`: "Nadchodzace terminy sadowe"
- `noUpcomingCaseDeadlines`: "Brak nadchodzacych terminow sadowych."
- `recentCases`: "Ostatnie sprawy"
- `noRecentCases`: "Brak spraw."

## Verification

- TypeScript compilation passes cleanly (`npx tsc --noEmit` -- zero errors)
- All success criteria addressed (see plan.md for mapping)

## Integration Notes

- INTEGRATION: Depends on Task 1's API changes (permission-gated response with optional `legalHub` key)
- GOTCHA: `data?.obligations?.upcoming` uses optional chaining throughout -- never assumes API keys exist
- GOTCHA: `canView` uses same pattern as sidebar but is defined locally (not shared hook) -- consistent with existing codebase convention
