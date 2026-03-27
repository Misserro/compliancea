# Task 1 — Implementation Plan

## Overview
Add `getLegalHubDashboardData(orgId, userId, orgRole)` to `lib/db.js`, export it from `src/lib/db-imports.ts`, and update `/api/dashboard/route.ts` to check permissions before querying each resource and include the new legal hub data.

## Files to Modify

### 1. `lib/db.js` — Add `getLegalHubDashboardData` (after `updateMemberProfile`, line ~4362)

New exported function with three SQL queries:

```js
export function getLegalHubDashboardData(orgId, userId, orgRole) {
  // Query 1: statsByStatus — open cases (exclude 'closed' and 'archived') grouped by status
  // Uses member scoping: adds `AND assigned_to = ?` when orgRole === 'member'

  // Query 2: upcomingDeadlines — pending deadlines in next 30 days
  // Joins case_deadlines -> legal_cases -> users to get case_title and assigned_to_name
  // Filters: cd.status = 'pending', cd.due_date BETWEEN date('now') AND date('now', '+30 days')
  // Member scoping: adds `AND lc.assigned_to = ?` when orgRole === 'member'
  // Returns: { id, case_id, case_title, title, deadline_type, due_date }

  // Query 3: recentCases — top 5 most recent cases (all statuses)
  // Joins legal_cases -> users for assigned_to_name
  // Member scoping: adds `AND lc.assigned_to = ?` when orgRole === 'member'
  // Returns: { id, title, status, case_type, created_at, assigned_to_name }
  // ORDER BY created_at DESC LIMIT 5

  return { statsByStatus, upcomingDeadlines, recentCases };
}
```

Pattern followed: `getFirmStats` (line 4266) uses `query()` and `get()` helpers with parameterized SQL. `getLegalCases` (line 2836) demonstrates the member scoping pattern (`orgRole === 'member'` + `assigned_to = userId`).

### 2. `src/lib/db-imports.ts` — Export `getLegalHubDashboardData`

Add `getLegalHubDashboardData` to the existing export list, placed after `getFirmStats` under the "Law Firm Dashboard (Plan 038 Task 3)" comment section — or add a new comment section for Plan 040.

### 3. `src/app/api/dashboard/route.ts` — Permission checks + legal hub section

Changes:
- Add imports: `hasPermission`, `PermissionLevel` from `@/lib/permissions`; `getLegalHubDashboardData` from `@/lib/db-imports`
- Read `session.user.permissions`, `session.user.orgRole`, `session.user.isSuperAdmin`, `session.user.id`
- Build helper: `const canViewResource = (r: string) => session.user.isSuperAdmin || session.user.orgRole !== 'member' || hasPermission(((session.user.permissions ?? {}) as Record<string, string>)[r] as PermissionLevel ?? 'full', 'view');`
- Wrap docs queries in `if (canViewResource('documents'))`
- Wrap obligations + contracts queries in `if (canViewResource('contracts'))`
- Add `if (canViewResource('legal_hub'))` block calling `getLegalHubDashboardData(orgId, Number(session.user.id), session.user.orgRole)`
- Build response object conditionally: only include `docs` key if documents accessible, `obligations`/`contracts` keys if contracts accessible, `legalHub` key if legal_hub accessible

## Success Criteria Mapping

1. **Owner/admin returns all data including legalHub** — `canViewResource` returns true for all resources when `orgRole !== 'member'` or `isSuperAdmin`
2. **Member with legal_hub:'none'** — `hasPermission('none', 'view')` returns false, so no legalHub key
3. **Member with only contracts:'view'** — only contracts queries run, response has only contracts data
4. **Deadlines scoped to assigned cases for member** — `getLegalHubDashboardData` filters by `assigned_to = userId` when `orgRole === 'member'`

## Risks / Trade-offs

- The `legal_cases` table has `org_id` added via ALTER TABLE (line ~811), confirmed present. The `assigned_to` column is also added via ALTER TABLE on the same line.
- Using `date('now')` in SQLite for date comparison — this is consistent with how the codebase handles dates elsewhere.
- All three sub-queries in `getLegalHubDashboardData` are synchronous (sql.js), matching all existing DB functions.
