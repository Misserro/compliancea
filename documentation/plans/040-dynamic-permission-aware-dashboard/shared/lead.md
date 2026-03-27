# Lead Notes — Plan 040

## Plan Overview
Dynamic permission-aware dashboard. Two goals:
1. Gate existing KPI cards/panels by resource permission
2. Add Legal Hub section (open cases KPI + upcoming deadlines panel + recent cases panel)

## Concurrency Decision
2 tasks, sequential (Task 2 depends on Task 1). Max 1 active task-team.
Task 2 can be pipeline-spawned during Task 1's review/test phase.

## Task Dependency Graph
- Task 1: no dependencies
- Task 2: depends on Task 1

## Key Architectural Constraints
- Permissions in session JWT: `session.user.permissions` — null = full (owner/admin), explicit map for member role
- Permission check pattern: `(session.user.permissions ?? {})['resource'] ?? 'full'`
- `hasPermission` from `src/lib/permissions.ts` — null userLevel means full access
- DB functions are synchronous (sql.js); `ensureDb()` needed before first call per request
- Member scoping: `legal_hub` queries must filter `assigned_to = userId` when `orgRole === 'member'`
- `getFirmStats` already exists but also fetches member roster — do NOT reuse it for dashboard; write new `getLegalHubDashboardData`
- i18n: all new UI strings must go in both `messages/en.json` and `messages/pl.json`

## Execution Complete

**Plan:** 040 — Dynamic Permission-Aware Dashboard
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: Added `getLegalHubDashboardData` to `lib/db.js` + exported from `db-imports.ts` + rewrote `/api/dashboard/route.ts` with permission-gated sections
- Task 2: Rewrote `dashboard/page.tsx` with `canView()` gating, legal hub KPI + panels, added 6 i18n keys in en.json and pl.json

### Files Modified
- `lib/db.js` — added `getLegalHubDashboardData` function
- `lib/db.d.ts` — added TypeScript declaration
- `src/lib/db-imports.ts` — exported new function
- `src/app/api/dashboard/route.ts` — full permission-gating rewrite
- `src/app/(app)/dashboard/page.tsx` — full rewrite with conditional rendering + legal hub sections
- `messages/en.json` — 6 new Dashboard keys
- `messages/pl.json` — 6 new Dashboard keys

### Test Results
- Per-task tests: PASS (both tasks)
- Final gate: PASSED — all criteria verified by code inspection

### Minor deviation
`openCasesSub` implemented as "{count} active statuses" instead of "{count} statuses" — cosmetic enhancement, functionally correct.

---

## Critical Decisions
- New DB function `getLegalHubDashboardData(orgId, userId, orgRole)` instead of reusing `getFirmStats`
- API returns permissions-scoped data — sections absent from response if user has no access
- UI reads permissions from `useSession()` directly (same as sidebar pattern)
- Empty state for zero-permission users: title + subtitle only, no panels
