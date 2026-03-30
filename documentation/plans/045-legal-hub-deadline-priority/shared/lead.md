# Lead Notes — Plan 045 Legal Hub Deadline Priority

## Plan Overview

Three improvements for professional legal use: case priority field, in-app deadline alert banner, and server-side pagination. Schema-dependent — Task 1 (priority column migration) must complete before Tasks 2 and 3.

## Concurrency Decision

**Sequential only** — Task 1 → Task 2 → Task 3.

Task 1 adds a schema migration. Tasks 2 and 3 both depend on stable `legal_cases` shape. Tasks 2 and 3 are independent of each other but share `messages/*.json` — sequential for simplicity.

Pipeline spawning applies: spawn Task 2 in pipeline mode (planning-only) when Task 1 enters review/test.

## Task Dependency Graph

```
Task 1 (Priority field) → Task 2 (Deadline alerts) → Task 3 (Pagination)
```

## Key Architectural Constraints

- **Next.js 15 App Router** — `src/app/(app)/` routes; `src/components/legal-hub/`
- **shadcn/ui** — use existing components only; no new UI libraries
- **next-intl** — all user-facing strings in both `messages/en.json` and `messages/pl.json` under `LegalHub.*` namespace
- **SQLite via lib/db.js** — migration pattern: `try { db.run("ALTER TABLE ... ADD COLUMN ...") } catch(e) {}` in startup block (idempotent, safe for existing DBs). See line ~811 of db.js.
- **Priority ordering:** `urgent=0, high=1, normal=2, low=3` for sort purposes. Default `normal`.
- **Deadline alert visibility:** respects org + role visibility rules — members see only their assigned cases. Same auth pattern as `GET /api/legal-hub/cases`.
- **`case_deadlines` table shape:** `{ id, case_id, title, deadline_type, due_date, status, completed_at }`
- **Pagination:** Add `limit`/`offset` to `getLegalCases` in db.js; return `{ cases, total }`. Return `COUNT(*) OVER()` window function or separate COUNT query.
- **Plan 044 Task 3** added `sortBy` state to `LegalHubDashboard` — Task 3 of this plan must preserve that without regression.

## Critical Decisions

- Task 1: `priority` column is `TEXT NOT NULL DEFAULT 'normal'` — existing rows default gracefully
- Task 1: Case card shows priority badge only for non-normal (urgent=red, high=orange, low=blue); normal shows nothing
- Task 2: New endpoint `GET /api/legal-hub/deadlines/upcoming?days=7` — new file, not modifying existing routes
- Task 2: Banner dismissal via sessionStorage key per user — reappears on next session
- Task 2: No banner shown when zero alerts; no layout shift (loading state hidden)
- Task 3: Default page size = 25; client sends `search`, `status`, `caseType`, `page`, `pageSize` as query params
- Task 3: Priority filter and sort (from Task 1 and Plan 044 Task 3) must move to server-side params too

## Execution Complete

**Plan:** 045-legal-hub-deadline-priority
**Tasks:** 3 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1 (Priority Field): migration + types + API + metadata form + card badge + filter/sort — reviewer PASS, tester PASS, 1 fix cycle (none needed)
- Task 2 (Deadline Alert Banner): new endpoint + banner component + dashboard mount — reviewer FAIL→PASS (3 pattern issues fixed: type deduplication, per-user sessionStorage key, amber dark mode variants), tester FAIL→PASS (due_date display added to expanded rows)
- Task 3 (Pagination): getLegalCases rewritten with limit/offset/priority/sortBy/multi-status IN clause + separate COUNT query + dashboard owns fetch + CaseList pure presentation + pagination controls — reviewer PASS, tester PASS

### Files Modified
- `lib/db.js` — getLegalCases: added priority, sortBy, limit, offset params; separate COUNT query; returns {cases,total}; also added getUpcomingDeadlinesForUser
- `lib/db.d.ts` — updated getLegalCases return type to {cases,total}; added getUpcomingDeadlinesForUser declaration
- `src/lib/types.ts` — added CASE_PRIORITIES, CasePriority, priority to LegalCase, DeadlineAlert
- `src/lib/constants.ts` — no changes needed (CASE_PRIORITY_COLORS added inline in components)
- `src/lib/db-imports.ts` — re-exported getUpcomingDeadlinesForUser
- `src/app/api/legal-hub/cases/route.ts` — GET reads page/pageSize/priority/sortBy; POST accepts priority
- `src/app/api/legal-hub/cases/[id]/route.ts` — PATCH allowlist includes priority
- `src/app/api/legal-hub/deadlines/upcoming/route.ts` (new) — GET endpoint for deadline alerts
- `src/components/legal-hub/case-metadata-form.tsx` — priority select field
- `src/components/legal-hub/case-card.tsx` — priority badge (non-normal only)
- `src/components/legal-hub/legal-hub-dashboard.tsx` — priority filter/sort; DeadlineAlertBanner mount; fetch lifecycle for pagination
- `src/components/legal-hub/case-list.tsx` — pure presentation with pagination controls
- `src/components/legal-hub/deadline-alert-banner.tsx` (new) — collapsible dismissible banner
- `messages/en.json` — LegalHub.priority.*, LegalHub.deadlineAlert.*, LegalHub.pagination.*
- `messages/pl.json` — Polish equivalents
- `tests/integration/org-isolation.test.ts` — updated for {cases,total} return shape

### Decisions Made During Execution
- Separate SELECT COUNT(*) over window function (sql.js compatibility)
- Client-side sort preserved on 25 fetched rows (spec only required server filtering)
- Server-side sort also implemented via ORDER BY CASE expression (executor added bonus)
- Multi-status IN clause added for checkbox UI support
- 300ms search debounce added to prevent API hammering
- DeadlineAlert type moved to types.ts (reviewer-2 catch)
- sessionStorage dismiss key made per-user with session-loading guard (reviewer-2 catch)

### Test Results
- Per-task tests: all passed (reviewer + tester PASS on all 3 tasks after fix cycles)
- Final gate (full suite): PASSED — 890/891 (1 pre-existing court-fee.test.ts failure from Plan 033)
