## Task 1 Complete -- Legal Hub route migration + /legal dashboard

### Files Created
- `src/app/(app)/legal/page.tsx` (NEW) -- Legal hub dashboard with KPI cards (Open Cases, Upcoming Deadlines) and detail panels (deadlines list, recent cases list). Client component fetching from `/api/dashboard`, extracting `legalHub` section. Permission-gated with `canView('legal_hub')`. Follows exact `KpiCard` pattern from `dashboard/page.tsx`.
- `src/app/(app)/legal/cases/page.tsx` (NEW) -- Cases list page, renders `<LegalHubDashboard />` (moved from `legal-hub/page.tsx`)
- `src/app/(app)/legal/cases/[id]/page.tsx` (NEW) -- Case detail page, renders `<CaseDetailPage />` (moved from `legal-hub/[id]/page.tsx`)
- `src/app/(app)/legal/templates/page.tsx` (NEW) -- Templates page (moved from `legal-hub/templates/page.tsx`)
- `src/app/(app)/legal/firm/page.tsx` (NEW) -- Firm page (moved from `legal-hub/firm/page.tsx`)
- `documentation/plans/051-nav-restructure-hub-dashboards/tasks/task-1/redirects.json` -- Redirect entries for Lead to consolidate into `next.config.mjs`

### Files Modified
- `src/components/legal-hub/case-card.tsx` (line 50) -- Changed `href` from `/legal-hub/${id}` to `/legal/cases/${id}`
- `src/components/legal-hub/case-header.tsx` (line 33) -- Changed `href` from `/legal-hub` to `/legal/cases`
- `src/components/legal-hub/case-generate-tab.tsx` (line 286) -- Changed `href` from `/legal-hub/templates` to `/legal/templates`
- `src/components/legal-hub/firm-dashboard.tsx` (line 43) -- Changed `router.replace` from `/legal-hub` to `/legal/cases`
- `messages/en.json` -- Added `LegalDashboard` i18n namespace (title, subtitle, openCases, upcomingDeadlines, etc.)
- `messages/pl.json` -- Added `LegalDashboard` i18n namespace (Polish translations)

### Files Deleted
- `src/app/(app)/legal-hub/page.tsx`
- `src/app/(app)/legal-hub/[id]/page.tsx`
- `src/app/(app)/legal-hub/templates/page.tsx`
- `src/app/(app)/legal-hub/firm/page.tsx`
- `src/app/(app)/legal-hub/` directory (removed entirely)

### Redirects (in redirects.json, not yet in next.config.mjs)
- `/legal-hub/templates` -> `/legal/templates` (permanent)
- `/legal-hub/firm` -> `/legal/firm` (permanent)
- `/legal-hub/:id` -> `/legal/cases/:id` (permanent)
- `/legal-hub` -> `/legal/cases` (permanent)

### INTEGRATION notes
- Task 4 (sidebar refactor): sidebar links in `app-sidebar.tsx` still point to `/legal-hub/*` -- Task 4 will update these when rewriting the sidebar
- Task 5 (link sweep): `dashboard/page.tsx` still has `/legal-hub` references at lines 126, 257, 296 -- Task 5 will update these
- API routes at `/api/legal-hub/*` are NOT moved -- they remain as-is
- Lead will consolidate `redirects.json` from tasks 1, 2, 3 into `next.config.mjs`

### GOTCHA
- The `KpiCard` component is duplicated between `dashboard/page.tsx` and `legal/page.tsx`. Future cleanup could extract it to a shared component.
- The new `/legal/page.tsx` uses `useTranslations("LegalDashboard")` -- a new namespace separate from the existing `"LegalHub"` namespace used by the cases list component.
