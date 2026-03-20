# Task 2 Plan -- Admin API Routes

## Overview

Create all `/api/admin/orgs` routes with `requireSuperAdmin` guard. Four files total: one helper, three route files.

## Files to Create

### 1. `src/lib/require-super-admin.ts` (new)
- Export `requireSuperAdmin(session)` helper
- Checks `session?.user` (401) then `session.user.isSuperAdmin` (403)
- Returns `Response | null` -- null means authorized

### 2. `src/app/api/admin/orgs/route.ts` (new)
- **GET**: list all orgs
  - `requireSuperAdmin(session)` guard
  - `ensureDb()`, `getAllOrganizations()`
  - For each org: compute status (`active` / `pending_deletion` / `expired`) based on `deleted_at`
  - `daysUntilDeletion` = 30 - Math.ceil((now - deleted_at) / MS_PER_DAY)
  - Return `{ orgs: [...] }`

- **POST**: create org
  - `requireSuperAdmin(session)` guard
  - Parse body `{ name, slug, ownerEmail? }`
  - Validate: name non-empty, slug matches `/^[a-z0-9-]+$/`
  - Check slug uniqueness via `get('SELECT id FROM organizations WHERE slug = ?', [slug])` -- 409 on conflict
  - `createOrganization(name.trim(), slug)` returns orgId
  - If `ownerEmail`: `createOrgInvite(orgId, ownerEmail.trim().toLowerCase(), 'owner')` -- bypasses role cap
  - Build inviteUrl from `NEXTAUTH_URL`
  - `saveDb()` BEFORE `logAction()`
  - Re-fetch org via `getOrgWithMemberCount(orgId)`
  - Return `{ org, inviteUrl? }` with status 201

### 3. `src/app/api/admin/orgs/[id]/route.ts` (new)
- **GET**: org detail
  - `requireSuperAdmin(session)` guard
  - Parse + validate numeric id
  - `getOrgWithMemberCount(id)` -- 404 if not found
  - `getOrgMembers(id)` -- member list
  - Return `{ org, members }`

- **PATCH**: rename org
  - `requireSuperAdmin(session)` guard
  - Parse body `{ name?, slug? }`
  - Validate non-empty updates, slug format, slug uniqueness (excluding current org)
  - `updateOrgName(id, name)` if name provided
  - `run('UPDATE organizations SET slug = ? WHERE id = ?', [slug, id])` if slug provided
  - `saveDb()` BEFORE `logAction()`
  - Re-fetch via `getOrgWithMemberCount(id)`
  - Return `{ message, org }`

- **DELETE**: soft-delete
  - `requireSuperAdmin(session)` guard
  - Parse + validate numeric id
  - `getOrgById(id)` -- 404 if not found
  - Check `deleted_at IS NULL` -- 409 if already deleted
  - `softDeleteOrg(id)`
  - `saveDb()` BEFORE `logAction()`
  - Return 204 (no body, use `new NextResponse(null, { status: 204 })`)

### 4. `src/app/api/admin/orgs/[id]/restore/route.ts` (new)
- **POST**: restore org
  - `requireSuperAdmin(session)` guard
  - Parse + validate numeric id
  - `getOrgById(id)` -- 404 if not found
  - Check `deleted_at IS NOT NULL` -- 400 if not deleted
  - Check within 30-day window -- 409 if expired
  - `restoreOrg(id)`
  - `saveDb()` BEFORE `logAction()`
  - Re-fetch via `getOrgWithMemberCount(id)`
  - Return `{ org }`

## Imports Strategy (Module Separation)

All routes import from:
- `@/auth` for `auth()`
- `@/lib/server-utils` for `ensureDb`
- `@/lib/db-imports` for DB functions (getAllOrganizations, createOrganization, etc.)
- `@/lib/audit-imports` for `logAction`
- `@/lib/require-super-admin` for the guard helper

The `require-super-admin.ts` file imports `Session` from `next-auth` and `NextResponse` from `next/server`. No bridge violations.

## logAction Patterns

Following existing codebase patterns (e.g., `org/invites/route.ts`, `org/members/[id]/route.ts`):
- `logAction(entityType, entityId, action, details, { userId, orgId? })`
- For admin operations: `userId = Number(session.user.id)`, `orgId` = the target org id (not session org)

## Success Criteria Mapping

1. GET /api/admin/orgs without super admin -> requireSuperAdmin returns 403
2. GET /api/admin/orgs with super admin -> returns all orgs with status/daysUntilDeletion
3. POST /api/admin/orgs creates org; ownerEmail -> inviteUrl
4. POST /api/admin/orgs duplicate slug -> 409
5. DELETE /api/admin/orgs/[id] sets deleted_at
6. POST /api/admin/orgs/[id]/restore within 30 days -> clears deleted_at
7. POST /api/admin/orgs/[id]/restore after 30 days -> 409

## Risks

- Slug uniqueness check is a SELECT-before-INSERT pattern; the UNIQUE constraint on the DB is the final guard (SQLite single-writer mitigates race conditions)
- `getOrgById` does NOT filter by deleted_at -- correct for admin routes but worth noting
- For PATCH slug update: need to exclude current org from uniqueness check (`WHERE slug = ? AND id != ?`)
