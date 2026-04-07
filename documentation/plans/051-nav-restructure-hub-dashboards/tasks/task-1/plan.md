# Task 1 Implementation Plan — Legal Hub route migration + /legal dashboard

## Overview

Migrate all Legal Hub pages from `/legal-hub/*` to `/legal/*`. Create a new hub dashboard at `/legal`. Add permanent redirects for old URLs. Update navigation references in legal-hub components.

## Files to Create

### 1. `src/app/(app)/legal/page.tsx` (NEW)
New Legal hub dashboard page. Client component that:
- Fetches from `/api/dashboard`, extracts `legalHub` section
- Permission-gates with `canView('legal_hub')`
- Renders KPI cards: Open Cases count, Upcoming Deadlines count
- Renders detail panels: Upcoming Court Deadlines list, Recent Cases list
- Follows exact `KpiCard` pattern from `src/app/(app)/dashboard/page.tsx` (copy the KpiCard component locally or extract it)
- Links point to `/legal/cases` and `/legal/cases/[id]`
- Uses `LegalDashboard` i18n namespace (new keys added to messages files)
- Wrapper: `p-6 max-w-6xl mx-auto space-y-8` (matches dashboard/page.tsx)

### 2. `src/app/(app)/legal/cases/page.tsx` (NEW)
Copy of `src/app/(app)/legal-hub/page.tsx` — thin wrapper rendering `<LegalHubDashboard />`.

### 3. `src/app/(app)/legal/cases/[id]/page.tsx` (NEW)
Copy of `src/app/(app)/legal-hub/[id]/page.tsx` — thin wrapper rendering `<CaseDetailPage />`.

### 4. `src/app/(app)/legal/templates/page.tsx` (NEW)
Copy of `src/app/(app)/legal-hub/templates/page.tsx`.

### 5. `src/app/(app)/legal/firm/page.tsx` (NEW)
Copy of `src/app/(app)/legal-hub/firm/page.tsx`.

## Files to Modify

### 6. `next.config.mjs`
Add `redirects` async function to the Next.js config with these entries (order matters — specific before catch-all):
```js
async redirects() {
  return [
    { source: '/legal-hub/templates', destination: '/legal/templates', permanent: true },
    { source: '/legal-hub/firm', destination: '/legal/firm', permanent: true },
    { source: '/legal-hub/:id', destination: '/legal/cases/:id', permanent: true },
    { source: '/legal-hub', destination: '/legal/cases', permanent: true },
  ];
},
```

### 7. `src/components/legal-hub/case-card.tsx`
Line 50: Change `href={/legal-hub/${legalCase.id}}` to `href={/legal/cases/${legalCase.id}}`

### 8. `src/components/legal-hub/case-header.tsx`
Line 33: Change `href="/legal-hub"` to `href="/legal/cases"`

### 9. `src/components/legal-hub/case-generate-tab.tsx`
Line 286: Change `href="/legal-hub/templates"` to `href="/legal/templates"`

### 10. `src/components/legal-hub/firm-dashboard.tsx`
Line 43: Change `router.replace("/legal-hub")` to `router.replace("/legal/cases")`

### 11. `messages/en.json`
Add new `LegalDashboard` namespace with keys for the hub dashboard:
- title, subtitle, openCases, upcomingDeadlines, deadlineCount, recentCases, noDeadlines, noCases, daysShort, viewAllCases, viewAllDeadlines

### 12. `messages/pl.json`
Polish equivalents of the `LegalDashboard` namespace.

## Files to Delete

### 13. Delete old route files
- `src/app/(app)/legal-hub/page.tsx`
- `src/app/(app)/legal-hub/[id]/page.tsx`
- `src/app/(app)/legal-hub/templates/page.tsx`
- `src/app/(app)/legal-hub/firm/page.tsx`

## Out of Scope (noted for Task 5)
- Updating `/legal-hub` references in `src/app/(app)/dashboard/page.tsx` (Task 5)
- Updating sidebar links in `app-sidebar.tsx` (Task 4)
- Moving API routes at `/api/legal-hub/*` (API routes stay — only page routes move)

## Risks / Trade-offs
- The KpiCard component is defined inline in dashboard/page.tsx. I will define a similar component inline in the new legal dashboard page to avoid coupling. Task 5 or future cleanup could extract it to a shared component.
- Redirects use Next.js config-level redirects (308 permanent). These work for direct navigation but not for client-side router.push — hence the component-level link updates.
- The old `/legal-hub/` directory will be deleted. The redirects in next.config.mjs handle any bookmarked/external URLs.

## Success Criteria Mapping
1. GET /legal -> new hub dashboard with KPI cards + lists (file #1)
2. GET /legal/cases -> cases list via LegalHubDashboard (file #2)
3. GET /legal/cases/[id] -> case detail (file #3)
4. GET /legal/templates -> templates page (file #4)
5. GET /legal/firm -> firm page (file #5)
6. Old /legal-hub/* URLs redirect permanently (file #6)
7. No 404s — all pages created + redirects in place
