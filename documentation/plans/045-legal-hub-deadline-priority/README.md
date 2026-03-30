# Plan 045 — Legal Hub Deadline Awareness + Case Priority

## Overview

Three improvements that address the most critical workflow gaps in the Legal Hub for professional legal use: a priority system for cases, in-app deadline alerts across all cases, and server-side pagination to handle large caseloads.

## Goals

1. **Case priority** — add `urgent/high/normal/low` priority field to cases; show on cards; filter and sort by priority on the case list
2. **Deadline alert banner** — cross-case notification banner on the Legal Hub page showing upcoming (≤7 days) and overdue deadlines
3. **Pagination** — server-side pagination on the case list with search/filter params pushed to the API instead of client-side filtering

## Tech Stack

- Next.js 15 App Router, shadcn/ui, next-intl (en/pl), Tailwind v4
- SQLite via `lib/db.js` — migrations follow the `try { db.run(ALTER TABLE...) } catch(e) {}` pattern (see line 811 of db.js)
- Existing `GET /api/legal-hub/cases` supports `search`, `status`, `caseType` query params but UI doesn't use them — Task 3 wires this up

## Architecture Notes

- **Migration pattern:** New columns are added in the startup migration block in `lib/db.js` using `try { db.run("ALTER TABLE legal_cases ADD COLUMN ...") } catch(e) {}` — this is idempotent and safe for existing databases
- **Priority ordering:** `urgent=0, high=1, normal=2, low=3` for sort purposes. Default `normal`.
- **Deadline alert data:** A new `GET /api/legal-hub/deadlines/upcoming` endpoint aggregates pending deadlines across all user-visible cases. Respects the same org + role visibility rules as the case list (members see only their assigned cases).
- **Pagination:** The existing GET `/api/legal-hub/cases` query in `lib/db.js` (`getLegalCases`) already accepts a search filter — add `limit` and `offset` params to it. Return `{ cases, total, page, pageSize }`. UI switches from client-side filter+sort to sending params to API.

## Tasks

---

### Task 1 — Priority Field on Cases

**Description:** Add a `priority` column to the `legal_cases` table. Expose it in the case metadata form (edit), display a priority badge on the case card, and add a priority filter chip + sort-by-priority option to the case list.

**Patterns to read:**
- `lib/db.js` lines 800–830 — migration block pattern; `getLegalCases` function — SELECT query to add priority; case INSERT/PATCH allowlists
- `src/app/api/legal-hub/cases/route.ts` — GET list response, POST create body
- `src/app/api/legal-hub/cases/[id]/route.ts` — PATCH metadata allowlist
- `src/components/legal-hub/case-metadata-form.tsx` — form field patterns; how `representing_side` from `extension_data` is handled as a select
- `src/components/legal-hub/case-card.tsx` — badge rendering (status badge, type badge patterns)
- `src/components/legal-hub/legal-hub-dashboard.tsx` — filter controls pattern
- `src/lib/types.ts` — `LegalCase` type definition
- `messages/en.json` — `LegalHub.*` namespace

**Files to modify:**
- `lib/db.js` — migration: `ALTER TABLE legal_cases ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`; add `priority` to SELECT in `getLegalCases`; add `priority` to allowed PATCH fields; include `priority` in INSERT for new cases
- `src/lib/types.ts` — add `priority: "urgent" | "high" | "normal" | "low"` to `LegalCase`; export `CASE_PRIORITIES` constant
- `src/app/api/legal-hub/cases/route.ts` — include `priority` in GET response; accept `priority` in POST body (default `"normal"`)
- `src/app/api/legal-hub/cases/[id]/route.ts` — add `priority` to PATCH allowlist
- `src/components/legal-hub/case-metadata-form.tsx` — add Priority select field (urgent/high/normal/low) with colored dot indicators
- `src/components/legal-hub/case-card.tsx` — show priority badge (colored dot + label) below the status badge; hide for `normal` to reduce clutter (only show urgent/high/low)
- `src/components/legal-hub/legal-hub-dashboard.tsx` — add priority filter dropdown + "Sort by priority" option alongside the existing sort controls (added by Plan 044 Task 3)
- `src/components/legal-hub/case-list.tsx` — apply priority filter; add priority sort: urgent → high → normal → low
- `messages/en.json` — add `LegalHub.priority.*`: label, urgent, high, normal, low; `LegalHub.dashboard.filterByPriority`, `LegalHub.dashboard.sortPriority`
- `messages/pl.json` — Polish equivalents

**Success criteria:**
- `legal_cases` table gains `priority TEXT NOT NULL DEFAULT 'normal'` via migration; existing cases default to `"normal"` without breaking
- Priority select appears in case metadata edit form with 4 options (urgent, high, normal, low)
- Case card shows a colored priority badge for non-normal priorities: urgent=red, high=orange, low=blue (normal shows nothing)
- Priority filter dropdown on case list filters cases by selected priority
- "Sort by priority" option orders cases: urgent first, then high, normal, low
- New cases created via the dialog default to "normal" priority
- `npx tsc --noEmit` passes

---

### Task 2 — In-App Deadline Alert Banner

**Description:** Add a new API endpoint that returns upcoming (within 7 days) and overdue pending deadlines across all user-visible cases. Render a dismissible alert banner at the top of the Legal Hub page showing the count and list of affected deadlines.

**Patterns to read:**
- `src/app/api/legal-hub/cases/route.ts` — auth + org/role visibility pattern to replicate for the new endpoint
- `lib/db.js` — `getLegalCases` role-scoped filter pattern; `case_deadlines` table structure (case_id, title, deadline_type, due_date, status, completed_at)
- `src/components/legal-hub/legal-hub-dashboard.tsx` — where to mount the banner (above the filter row); existing fetch pattern
- `src/components/ui/` — available shadcn components: `Alert`, `Badge`, `Button`, `Collapsible`
- `messages/en.json` — `LegalHub.deadlineAlert.*` namespace

**Files to create/modify:**
- `src/app/api/legal-hub/deadlines/upcoming/route.ts` (new) — `GET /api/legal-hub/deadlines/upcoming?days=7`; returns `{ upcoming: DeadlineAlert[], overdue: DeadlineAlert[] }` where `DeadlineAlert = { id, caseId, caseTitle, title, deadline_type, due_date, daysUntil }`. Respects role visibility (members only see their assigned cases).
- `src/components/legal-hub/deadline-alert-banner.tsx` (new) — fetch from the new endpoint; render a collapsible banner showing: "X overdue · Y due in 7 days" summary row; expanded list with case title + deadline title + due date for each; dismiss button (sessionStorage key per user); separate urgent (overdue) and upcoming sections
- `src/components/legal-hub/legal-hub-dashboard.tsx` — render `<DeadlineAlertBanner />` above the filter row
- `messages/en.json` — add `LegalHub.deadlineAlert.*`: title, overdue, upcoming, dismiss, noAlerts, daysUntil, overdueSuffix
- `messages/pl.json` — Polish equivalents

**Success criteria:**
- `GET /api/legal-hub/deadlines/upcoming` returns correct data; respects org + role visibility
- Banner appears on the Legal Hub case list page when there are upcoming or overdue deadlines
- Banner shows correct counts: overdue deadlines (due_date < today, status = pending) and upcoming (due_date within 7 days, status = pending)
- Expandable list shows case title + deadline title + due date for each alert entry
- Dismiss button hides the banner for the session (sessionStorage); it reappears on next visit
- No banner rendered when there are no active alerts
- Loading state: banner not shown until data resolves (no layout shift)
- Overdue deadlines styled in destructive/red color; upcoming in amber/warning color

---

### Task 3 — Case List Server-Side Pagination

**Description:** Switch the case list from "load all, filter client-side" to server-side pagination with 25 cases per page. Search, status filter, and case-type filter params move from client state to API query params. The existing `GET /api/legal-hub/cases` endpoint and `getLegalCases` DB function gain `limit`/`offset` support.

**Patterns to read:**
- `lib/db.js` — `getLegalCases` function (the full SELECT query, current params, WHERE clauses for search/status/caseType/role); note how `search`, `status`, `caseType` params are currently defined but the UI doesn't send them
- `src/app/api/legal-hub/cases/route.ts` — current GET handler; how query params are read
- `src/components/legal-hub/case-list.tsx` — current fetch call (`/api/legal-hub/cases` with no params); current client-side filter logic; how filtered cases are passed down
- `src/components/legal-hub/legal-hub-dashboard.tsx` — state for search, statusFilter, caseTypeFilter; how they're passed to CaseList
- `src/components/ui/` — available shadcn pagination component (if exists); otherwise build with Button + chevron icons
- `messages/en.json` — `LegalHub.dashboard.*` or new `LegalHub.pagination.*` namespace

**Files to modify:**
- `lib/db.js` — add `limit: number = 25` and `offset: number = 0` params to `getLegalCases`; add `COUNT(*) OVER() AS total_count` (window function) or a separate count query; return `{ cases, total }`
- `src/app/api/legal-hub/cases/route.ts` — read `page` (default 1) and `pageSize` (default 25) query params; compute `offset = (page-1)*pageSize`; pass `search`, `status`, `caseType`, `limit`, `offset` to `getLegalCases`; return `{ cases, total, page, pageSize }`
- `src/components/legal-hub/case-list.tsx` — remove all client-side filter logic; accept `cases` (already filtered by server), `total`, `page`, `pageSize`, `onPageChange` as props; render pagination controls below the list
- `src/components/legal-hub/legal-hub-dashboard.tsx` — add `page` state (default 1); when search/status/type filters change, reset page to 1; pass all filter params + page to CaseList's fetch; switch to server-driven fetch pattern (useEffect on filter + page change)
- `messages/en.json` — add `LegalHub.pagination.page`, `LegalHub.pagination.of`, `LegalHub.pagination.results`, `LegalHub.pagination.prev`, `LegalHub.pagination.next`
- `messages/pl.json` — Polish equivalents

**Success criteria:**
- Case list fetches only 25 cases per page via API; never loads all cases at once
- Search, status filter, and case type filter are sent as query params to `GET /api/legal-hub/cases`; client does no filtering
- Pagination controls show: "Showing X–Y of Z cases"; previous/next buttons; page number buttons (show up to 5 pages)
- Navigating to page 2+ works correctly; filters + page persist independently
- Changing any filter resets to page 1
- Total count is shown and correct
- Empty state (0 results) renders correctly with current filters
- SQLite `total_count` computation uses either `COUNT(*) OVER()` window function or a separate `SELECT COUNT(*)` query — whichever the executor finds more compatible with the SQLite version in use
- `npx tsc --noEmit` passes

## Concurrency

Tasks are sequential: Task 1 (schema change) must complete before Tasks 2 and 3, as both depend on the stable `legal_cases` shape. Tasks 2 and 3 are independent of each other but share `messages/*.json` — run sequentially for simplicity.

```
Task 1 (Priority field) → Task 2 (Deadline alerts) → Task 3 (Pagination)
```
