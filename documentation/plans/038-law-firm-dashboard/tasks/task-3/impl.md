# Task 3 Complete -- Firm stats API + lawyer profile update API

## Changes

- **Modified:** `lib/db.js` (appended after line 4253) -- Added two new functions:
  - `getFirmStats(orgId)`: Returns `{ statsByStatus, finalizedLast30Days, members }`. Three queries: GROUP BY status for case counts, COUNT with date filter (`updated_at >= datetime('now', '-30 days')`) for finalized cases, and JOIN of org_members + users + LEFT JOIN subquery on legal_cases.assigned_to for member roster with assigned_case_count.
  - `updateMemberProfile(orgId, userId, fields)`: Validates target user belongs to org via `get()` check. Allowlist: `first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number`. Dynamic SET clause (same pattern as `updateLegalCase`). Returns updated member record or null if not in org.

- **Modified:** `lib/db.d.ts` (appended after line 205) -- Added TypeScript declarations:
  - `export function getFirmStats(...args: any[]): any;`
  - `export function updateMemberProfile(...args: any[]): any;`
  - Section comment: `// Law Firm Dashboard (Plan 038 Task 3)`

- **Modified:** `src/lib/db-imports.ts` (line 196) -- Added re-exports for `getFirmStats` and `updateMemberProfile` with section comment.

- **Created:** `src/app/api/legal-hub/firm-stats/route.ts` -- GET handler:
  - Auth: `auth()` from `@/auth`, 401 if no session
  - Positive admin guard: allows only `orgRole === 'admin' || orgRole === 'owner' || isSuperAdmin === true`, returns 403 otherwise
  - `await ensureDb()`, orgId check, calls `getFirmStats(orgId)`
  - Returns `{ statsByStatus, finalizedLast30Days, members }` directly

- **Created:** `src/app/api/org/members/profile/route.ts` -- PATCH handler:
  - Auth: 401 if no session
  - `await ensureDb()`, orgId check
  - Determines target user: defaults to session user; if `target_user_id` in body and differs from session user, requires admin/owner/superAdmin (403 for members)
  - Validates all profile fields are strings or null (400 if invalid type)
  - Calls `updateMemberProfile(orgId, targetUserId, fields)`, returns 404 if member not in org
  - Returns `{ member: {...} }` on success

## Integration Notes

- **INTEGRATION (Task 5):** `GET /api/legal-hub/firm-stats` response shape matches the README spec exactly: `{ statsByStatus: {status, count}[], finalizedLast30Days: number, members: {user_id, name, email, role, first_name, last_name, phone, specialization, bar_registration_number, assigned_case_count}[] }`
- **INTEGRATION (Task 5):** `PATCH /api/org/members/profile` expects body: `{ target_user_id?: number, first_name?: string|null, last_name?: string|null, phone?: string|null, specialization?: string|null, bar_registration_number?: string|null }`. Returns `{ member: {...} }`.
- No collision with Task 2: only NEW functions added to db.js; `getLegalCases`, `createLegalCase`, `updateLegalCase` untouched.

## Reviewer Feedback Applied

- Added `lib/db.d.ts` declarations (was missing from initial plan).
- Changed admin guard from negative check (`orgRole === 'member'`) to positive check (`orgRole === 'admin' || orgRole === 'owner' || isSuperAdmin === true`) per reviewer-3 concern about undefined orgRole slipping through.
