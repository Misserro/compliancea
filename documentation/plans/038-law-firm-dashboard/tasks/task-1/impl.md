# Task 1 Complete -- DB schema migration: assigned_to + lawyer profile columns

## Changes

- **Modified:** `lib/db.js` (lines ~810-826) -- Added Plan 038 migration block:
  - `ALTER TABLE legal_cases ADD COLUMN assigned_to INTEGER REFERENCES users(id)`
  - Five `ALTER TABLE org_members ADD COLUMN` statements for `first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number` (all nullable TEXT)
  - Backfill UPDATE: assigns all existing cases with `assigned_to IS NULL` to org owner (fallback: first admin by joined_at)
  - All ALTER TABLE statements wrapped in try/catch (idempotent, matches existing pattern)

- **Modified:** `lib/db.js` -- `getLegalCases` function (line ~2833):
  - Signature changed from `({ search, status, caseType, orgId })` to `({ search, status, caseType, orgId, userId, orgRole })`
  - Added `LEFT JOIN users u ON lc.assigned_to = u.id`
  - Added `u.name as assigned_to_name` to SELECT
  - When `orgRole === 'member'` and `userId` is provided, adds `AND lc.assigned_to = ?` filter

- **Modified:** `lib/db.js` -- `getLegalCaseById` function (line ~2872):
  - Added `LEFT JOIN users u ON lc.assigned_to = u.id`
  - Added `u.name as assigned_to_name` to SELECT

- **Modified:** `lib/db.js` -- `createLegalCase` function (line ~2889):
  - Added `assignedTo = null` to destructured params
  - Added `assigned_to` column to INSERT and corresponding value

- **Modified:** `lib/db.js` -- `updateLegalCase` function (line ~2939):
  - Added `"assigned_to"` to `allowedFields` array

- **Modified:** `src/lib/types.ts` -- `LegalCase` interface (line ~315):
  - Added `assigned_to: number | null`
  - Added `assigned_to_name: string | null`

## Integration Notes

- **INTEGRATION (Task 2):** `getLegalCases` now accepts `userId` and `orgRole` params. API routes in `src/app/api/legal-hub/cases/route.ts` need to pass `session.user.id` and `session.user.orgRole` to `getLegalCases`.
- **INTEGRATION (Task 2):** `createLegalCase` now accepts `assignedTo` param. POST route should pass `assigned_to` from request body (admin) or `session.user.id` (member auto-assign).
- **INTEGRATION (Task 2):** `updateLegalCase` now allows `assigned_to` in its update allowlist. PATCH route should validate admin-only access before including it in fields.
- **INTEGRATION (Task 3):** `getLegalCaseById` now returns `assigned_to_name` from the users JOIN -- no changes needed by Task 3 for this.
- `src/lib/db-imports.ts` does NOT need changes -- it re-exports functions by name, and the signature changes are backward-compatible (new params have defaults).

## Risks / Gotchas

- Backfill runs on every startup but is idempotent (`WHERE assigned_to IS NULL`). First run assigns all existing cases; subsequent runs are no-ops.
- If an org has zero owner/admin members, the backfill subquery returns NULL and those cases stay unassigned. This shouldn't occur in production since org creation always adds an owner.
