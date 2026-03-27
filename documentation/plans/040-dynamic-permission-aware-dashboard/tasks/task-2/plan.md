# Task 2 Plan -- Permission-gated dashboard UI + legal hub sections

## Files to Modify

1. `src/app/(app)/dashboard/page.tsx` -- main implementation
2. `messages/en.json` -- add Dashboard namespace keys
3. `messages/pl.json` -- add Dashboard namespace keys (Polish)

## Changes Per File

### 1. `src/app/(app)/dashboard/page.tsx`

**New imports:**
- `useSession` from `next-auth/react`
- `Scale` from `lucide-react` (for Open Cases KPI icon)
- `Link` from `next/link` (for panel links)
- `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`

**Updated `DashboardData` interface:**
- Make `docs`, `obligations`, `contracts` optional (API omits them when no access)
- Add optional `legalHub` field with `statsByStatus`, `upcomingDeadlines`, `recentCases`

**Add `canView` function inside component:**
- Read `sessionData` from `useSession()`
- Extract `permissions = sessionData?.user?.permissions`
- Implement `canView(resource)` identical to sidebar pattern: null permissions = full access, check PERMISSION_LEVELS >= 1

**KPI cards section:**
- Change grid from fixed 3 columns to dynamic based on visible cards (grid-cols-2 lg:grid-cols-4 stays responsive)
- Wrap Documents card in `canView('documents') && data?.docs &&`
- Wrap Overdue card in `canView('contracts') && data?.obligations &&`
- Wrap Contracts card in `canView('contracts') && data?.contracts &&`
- Add Open Cases KPI card: `canView('legal_hub') && data?.legalHub &&`
  - Icon: `Scale`
  - Value: sum of `statsByStatus[].count`
  - Sub: compact inline badges `new 2 . intake 1` using `\u00b7` separator
  - href: `/legal-hub`

**Skeleton loading:**
- Dynamic skeleton count based on which resources user can view (not hardcoded 3)

**Panel grid section:**
- Wrap Upcoming Obligations panel in `canView('contracts') && data?.obligations &&`
- Wrap Contracts Expiring panel in `canView('contracts') && data?.contracts &&`
- Add Upcoming Court Deadlines panel: `canView('legal_hub') && data?.legalHub &&`
  - Header: t("upcomingDeadlines"), sub: t("next30Days")
  - Empty state: t("noUpcomingCaseDeadlines")
  - Each item links to `/legal-hub` (using `Link` or `router.push`)
  - Show deadline title, case_title, days remaining
- Add Recent Cases panel: `canView('legal_hub') && data?.legalHub &&`
  - Header: t("recentCases")
  - Empty state: t("noRecentCases")
  - Each item links to `/legal-hub/{id}` (using `Link` or `router.push`)
  - Show case title, status badge, case_type, assigned_to_name

**Empty state:**
- If no cards visible (all canView false or no data sections), only title/subtitle rendered -- the existing grid divs will simply be empty, which is correct

### 2. `messages/en.json` (Dashboard namespace)

Add keys after `"daysShort"`:
```
"openCases": "Open Cases",
"openCasesSub": "{count} active statuses",
"upcomingDeadlines": "Upcoming Court Deadlines",
"noUpcomingCaseDeadlines": "No upcoming court deadlines.",
"recentCases": "Recent Cases",
"noRecentCases": "No cases yet."
```

### 3. `messages/pl.json` (Dashboard namespace)

Add same keys in Polish:
```
"openCases": "Otwarte sprawy",
"openCasesSub": "{count} aktywnych statusow",
"upcomingDeadlines": "Nadchodzace terminy sadowe",
"noUpcomingCaseDeadlines": "Brak nadchodzacych terminow sadowych.",
"recentCases": "Ostatnie sprawy",
"noRecentCases": "Brak spraw."
```

## Success Criteria Mapping

1. Full access user: all canView return true, API returns all sections -> all 4 KPIs + 4 panels
2. `legal_hub: 'none'` + `contracts: 'view'`: canView('legal_hub')=false, canView('contracts')=true, canView('documents')=true (default 'full') -> Documents + Contracts KPIs, both contract panels, no legal hub
3. Only `legal_hub: 'view'`: canView('legal_hub')=true, canView('contracts')=false, canView('documents')=false -> Only Open Cases KPI + both legal hub panels
4. All `'none'`: all canView false -> only title/subtitle
5. Open Cases KPI: sum statsByStatus counts, inline badges with dot separator
6. Deadlines panel: links to `/legal-hub`
7. Recent Cases: links to `/legal-hub/{id}`
8. Both en/pl keys present

## Risks / Trade-offs

- The `canView` function is duplicated between sidebar and dashboard. This is intentional -- same pattern as sidebar, keeps components self-contained. Could be extracted to a hook later but that's out of scope.
- Skeleton count during loading: we use `useSession` which loads quickly (cached), so we can determine visible skeletons before data loads. If session is still loading, we show 4 skeletons as default.
