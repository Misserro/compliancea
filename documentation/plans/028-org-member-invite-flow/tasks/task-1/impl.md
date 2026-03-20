# Task 1 Implementation Notes -- Invite DB Layer and API Routes

## Changes Made

### lib/db.js -- 7 new exported functions + crypto import

- **Added `import crypto from "crypto"`** at top (line 3) for `crypto.randomUUID()` token generation
- **`createOrgInvite(orgId, email, role)`** -- DELETEs any pending (non-accepted, non-expired) invite for same email+org, then INSERTs new row with UUID token and ISO 8601 `expiresAt` (7 days from now). Returns `{ token, orgId, email, role, expiresAt }`.
- **`getOrgInviteByToken(token)`** -- SELECT with JOIN to organizations. Returns `{ token, orgId, orgName, email, role, expiresAt, acceptedAt }` or null.
- **`listOrgInvites(orgId)`** -- SELECT pending-only invites (accepted_at IS NULL AND expires_at > datetime('now')). Returns `[{ token, email, role, expiresAt, createdAt }]` ordered by created_at DESC.
- **`acceptOrgInvite(token)`** -- UPDATE accepted_at = CURRENT_TIMESTAMP.
- **`revokeOrgInvite(token)`** -- DELETE FROM org_invites.
- **`getAllOrgMembershipsForUser(userId)`** -- SELECT with JOIN to organizations. Returns `[{ orgId, orgName, orgSlug, role, joinedAt }]`.
- **`getOrgMemberForOrg(userId, orgId)`** -- SELECT with JOIN to organizations. Returns `{ orgId, orgName, orgSlug, role }` or null.

### lib/db.d.ts -- 7 new declarations

Added type stubs for all 7 new functions following existing `(...args: any[]): any` pattern.

### src/lib/db-imports.ts -- 7 new re-exports

Added re-exports for `createOrgInvite`, `getOrgInviteByToken`, `listOrgInvites`, `acceptOrgInvite`, `revokeOrgInvite`, `getAllOrgMembershipsForUser`, `getOrgMemberForOrg`.

### src/app/api/org/invites/route.ts -- NEW (POST + GET)

**POST** -- Auth guard + owner/admin role check. Validates email (trimmed, lowercased, basic format regex) and role (must be 'member' or 'admin'). Calls `createOrgInvite`, `saveDb`, `logAction` (in that order). Returns `{ token, inviteUrl, email, role, expiresAt }` with status 201.

**GET** -- Auth guard + owner/admin role check. Returns `{ invites: listOrgInvites(orgId) }`.

### src/app/api/org/invites/[token]/route.ts -- NEW (DELETE)

Auth guard + owner/admin role check. Verifies invite belongs to caller's org via `getOrgInviteByToken` + orgId check (404 on mismatch). Calls `revokeOrgInvite`, `saveDb`, `logAction` (in that order). Returns 204.

### src/app/api/invites/[token]/route.ts -- NEW (public GET)

NO auth required. Calls `getOrgInviteByToken(token)`. Returns:
- `{ valid: false, reason: "not_found" }` if token doesn't exist
- `{ valid: false, reason: "already_accepted" }` if acceptedAt is set
- `{ valid: false, reason: "expired" }` if expiresAt < now
- `{ valid: true, orgName, role, email, expiresAt }` for valid tokens

## INTEGRATION Notes for Task 2, 3, and 4

- **Task 2:** `POST /api/invites/[token]/accept` needs to be added to `src/app/api/invites/[token]/route.ts` (same file as the public GET). Import `acceptOrgInvite`, `addOrgMember` from db-imports.
- **Task 3:** Invite UI calls `POST /api/org/invites`, `GET /api/org/invites`, `DELETE /api/org/invites/[token]` -- all ready.
- **Task 4:** `getAllOrgMembershipsForUser` and `getOrgMemberForOrg` are now in db.js and exported. Task 4 should NOT recreate them.
- **GOTCHA:** The public `GET /api/invites/[token]` route is now excluded from middleware via `api/invites` in the matcher negative lookahead (middleware.ts). Task 2 should add `/invite/` (the page route) to the same exclusion list.
- **GOTCHA:** `createOrgInvite` computes `expiresAt` as JavaScript ISO string (`new Date(...).toISOString()`). The `listOrgInvites` WHERE clause uses `datetime('now')` for comparison, which works correctly with ISO 8601 strings in SQLite.

## Review Fix Cycle 1

- **Fix 1 [COMPLETENESS]:** Added `api/invites` to middleware.ts matcher negative lookahead so `GET /api/invites/[token]` is accessible without auth.
- **Fix 2 [PATTERN]:** Reordered POST handler: `createOrgInvite` -> `saveDb()` -> `logAction()` (was logAction before saveDb).
- **Fix 3 [PATTERN]:** Reordered DELETE handler: `revokeOrgInvite` -> `saveDb()` -> `logAction()` (was logAction before saveDb).
- **Fix 4 [COMPLETENESS]:** Added `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` to org_invites CREATE TABLE + ALTER TABLE migration for existing DBs. Updated `listOrgInvites` SELECT to include `created_at AS createdAt` and ORDER BY `created_at DESC`.

## Test Fix Cycle 1

- **Fix 5 [BUG]:** ISO 8601 date format mismatch in SQLite comparisons. `createOrgInvite` stores `expires_at` as JS ISO string (`2026-03-20T...Z`) but `datetime('now')` returns space-separated format (`2026-03-20 ...`). The `T` > ` ` ASCII comparison caused expired invites to appear as pending. Fixed by wrapping `expires_at` in `datetime()` in both `listOrgInvites` WHERE clause and `createOrgInvite` DELETE clause: `datetime(expires_at) > datetime('now')`.

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors (verified after fix cycle 2)
