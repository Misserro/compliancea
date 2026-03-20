# Task 2 Implementation Notes -- Admin API Routes

## Changes Made

### src/lib/require-super-admin.ts (new file)
- Exports `requireSuperAdmin(session: Session | null): Response | null`
- Returns 401 if no session/user, 403 if not super admin, null if authorized
- Imports `Session` type from `next-auth`, `NextResponse` from `next/server`
- Synchronous helper -- each route handler calls `auth()` independently and passes the session in

### src/app/api/admin/orgs/route.ts (new file)
- **GET**: Lists all organizations (including soft-deleted) via `getAllOrganizations()`
  - Computes `status` field: `active`, `pending_deletion`, or `expired`
  - Computes `daysUntilDeletion` for deleted orgs (30 - days since deletion)
  - Returns `{ orgs: [...] }` with enriched org objects
- **POST**: Creates organization with optional first-owner invite
  - Validates name (non-empty), slug (non-empty, `/^[a-z0-9-]+$/` pattern), slug uniqueness
  - Calls `createOrganization(name, slug)` which returns orgId
  - If `ownerEmail` provided: calls `createOrgInvite(orgId, email, 'owner')` directly -- bypasses route-level role cap
  - `saveDb()` BEFORE `logAction()` -- critical rule followed
  - Returns `{ org, inviteUrl? }` with status 201

### src/app/api/admin/orgs/[id]/route.ts (new file)
- **GET**: Org detail with member list
  - `getOrgWithMemberCount(id)` for org data, `getOrgMembers(id)` for member list
  - Returns `{ org, members }`
- **PATCH**: Rename org (name and/or slug)
  - Uses allowlist-based field filtering per REST API standard
  - Validates slug format and uniqueness (excluding current org: `WHERE slug = ? AND id != ?`)
  - Uses `updateOrgName()` for name, `run()` for slug UPDATE
  - `saveDb()` BEFORE `logAction()`
  - Re-fetches and returns `{ message, org }`
- **DELETE**: Soft-delete
  - Checks org exists (404) and not already deleted (409)
  - `softDeleteOrg(id)`, `saveDb()` BEFORE `logAction()`
  - Returns 204 via `new NextResponse(null, { status: 204 })`

### src/app/api/admin/orgs/[id]/restore/route.ts (new file)
- **POST**: Restore soft-deleted org within 30-day window
  - Checks org exists (404), is deleted (400 if not), within retention window (409 if expired)
  - `restoreOrg(id)`, `saveDb()` BEFORE `logAction()`
  - Re-fetches and returns `{ org }`

### lib/db.js (modified -- fix cycle 1)
- **`getOrgMemberByUserId(userId)`**: Added `AND o.deleted_at IS NULL` to WHERE clause so first-org fallback skips soft-deleted orgs
- **`getOrgMemberForOrg(userId, orgId)`**: Added `AND o.deleted_at IS NULL` to WHERE clause so JWT refresh returns null for members of soft-deleted orgs
- Effect: After `softDeleteOrg(id)`, on next JWT refresh `getOrgMemberForOrg` returns null, JWT callback falls through, `token.orgId` becomes undefined, org guard in `(app)/layout.tsx` fires redirect to `/no-org`

## Patterns Followed
- Import ordering: next/server, @/auth, @/lib/server-utils, @/lib/require-super-admin, @/lib/db-imports, @/lib/audit-imports
- `export const runtime = "nodejs"` on every route file
- `await ensureDb()` as first statement after auth guard
- Params awaited: `const { id } = await params` (Next.js 15 pattern)
- Numeric ID parsed with `parseInt(id, 10)` + `isNaN()` guard
- JSON body parsed inside try/catch with 400 on failure
- PATCH uses allowlist array for field filtering
- Error catch blocks type as `unknown`, extract message safely
- `saveDb()` always called BEFORE `logAction()` -- no exceptions
- logAction imported from `@/lib/audit-imports` (not db-imports)
- 204 responses use `new NextResponse(null, { status: 204 })` (existing pattern from org/invites/[token]/route.ts)

## INTEGRATION Notes for Task 3
- **Task 3:** All admin API routes are available at `/api/admin/orgs`, `/api/admin/orgs/[id]`, `/api/admin/orgs/[id]/restore`
- **GET /api/admin/orgs** returns `{ orgs }` with `status`, `memberCount`, `daysUntilDeletion` fields ready for UI rendering
- **POST /api/admin/orgs** returns `{ org, inviteUrl? }` -- UI should show invite URL in a copy-to-clipboard state after successful creation
- **DELETE** returns 204 (no body) -- UI should `router.refresh()` after success
- **POST restore** returns `{ org }` -- UI should `router.refresh()` after success

## Build Verification
- TypeScript: `npx tsc --noEmit` passes with zero errors
