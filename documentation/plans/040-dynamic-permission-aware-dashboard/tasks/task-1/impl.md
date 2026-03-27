# Task 1 Complete -- Permission-gated dashboard API + legal hub DB function

## Files Changed

- **Modified:** `lib/db.js` (appended `getLegalHubDashboardData` function after `updateMemberProfile`, line ~4363)
- **Modified:** `lib/db.d.ts` (added TypeScript declaration for `getLegalHubDashboardData`, line ~211)
- **Modified:** `src/lib/db-imports.ts` (added `getLegalHubDashboardData` export, line ~200)
- **Modified:** `src/app/api/dashboard/route.ts` (full rewrite: permission gating + legalHub section)

## Implementation Details

### `getLegalHubDashboardData(orgId, userId, orgRole)` in `lib/db.js`
- Three synchronous sql.js queries using `query()` helper (read-only, no `run()`/`saveDb()`)
- **statsByStatus**: Counts open cases (excludes 'closed'/'archived') grouped by status
- **upcomingDeadlines**: Joins `case_deadlines` to `legal_cases` (deadlines table has no `org_id`), filters pending deadlines within 30 days
- **recentCases**: Top 5 most recent cases with `assigned_to_name` via LEFT JOIN to `users`
- **Member scoping**: All three queries append `AND lc.assigned_to = ?` when `orgRole === 'member'`, using a shared `memberFilter`/`baseParams` pattern

### Dashboard API route (`src/app/api/dashboard/route.ts`)
- Added imports: `hasPermission`, `PermissionLevel` from `@/lib/permissions`; `getLegalHubDashboardData` from `@/lib/db-imports`
- `canViewResource(r)` helper: returns true for superAdmin, non-member roles, or when `hasPermission` grants 'view' level
- Documents section gated by `canViewResource('documents')`
- Obligations + Contracts section gated by `canViewResource('contracts')`
- Legal Hub section gated by `canViewResource('legal_hub')`
- Response shape: only includes keys for accessible sections (missing keys = no access)
- `session.user.id` converted via `Number()` before passing to DB function

### TypeScript declaration (`lib/db.d.ts`)
- Added `export function getLegalHubDashboardData(...args: any[]): any;` to match existing pattern

## Integration Notes
- **INTEGRATION:** Task 2 (UI) should check for presence/absence of `docs`, `obligations`, `contracts`, `legalHub` keys in the API response to decide which sections to render
- **GOTCHA:** `session.user.id` is a string in NextAuth -- always use `Number(session.user.id)` when passing to DB functions
- **GOTCHA:** `case_deadlines` has no `org_id` column -- must JOIN through `legal_cases` for org scoping

## Verification
- TypeScript compilation passes cleanly (`npx tsc --noEmit` -- zero errors)
