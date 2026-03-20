# Task 1 Implementation Notes -- Super Admin DB, Auth, and Seeding

## Changes Made

### lib/db.js -- Migrations, Bootstrap, New Functions

**Migrations (after storage columns migration, before initSystemTemplates()):**
- `ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0` (try/catch)
- `ALTER TABLE organizations ADD COLUMN deleted_at DATETIME` (try/catch)

**Bootstrap seeding (after first-run org bootstrap, before final saveDb()):**
- Reads `process.env.SUPER_ADMIN_EMAIL`
- If set, looks up user by normalized email via `get()`
- If user found, sets `is_super_admin = 1` via `run()`
- Runs every initDb() call -- idempotent

**7 new exported functions (appended at end of file):**
1. `getAllOrganizations()` -- all orgs (including soft-deleted) with member_count via LEFT JOIN
2. `getActiveOrganizations()` -- same but WHERE deleted_at IS NULL
3. `createOrganization(name, slug)` -- INSERT, returns lastInsertRowId
4. `softDeleteOrg(id)` -- sets deleted_at = datetime('now')
5. `restoreOrg(id)` -- sets deleted_at = NULL
6. `setSuperAdmin(userId, flag)` -- sets is_super_admin = flag (0 or 1)
7. `getOrgWithMemberCount(id)` -- single org by id with member count

### lib/db.d.ts -- Type Declarations
- Added 7 function declarations following existing `...args: any[]): any` pattern

### src/lib/db-imports.ts -- Re-exports
- Added 7 new re-exports: getAllOrganizations, getActiveOrganizations, createOrganization, softDeleteOrg, restoreOrg, setSuperAdmin, getOrgWithMemberCount

### src/auth.ts -- Type Augmentation + JWT/Session Callbacks
- Added `isSuperAdmin?: boolean` to `Session.user` in `declare module "next-auth"`
- Added `isSuperAdmin?: boolean` to `JWT` in `declare module "@auth/core/jwt"`
- Added `get` to import from `@/lib/db-imports`
- JWT callback first sign-in branch: queries `SELECT is_super_admin FROM users WHERE id = ?`, sets `token.isSuperAdmin`
- JWT callback subsequent-requests branch: re-reads `is_super_admin` from DB on every request (picks up promotions without re-login)
- Session callback: maps `token.isSuperAdmin` to `session.user.isSuperAdmin`

### auth.config.ts -- Extended Authorized Callback
- Imported `NextResponse` from `next/server`
- Added `/no-org` to public paths (alongside `/invite`)
- Added `/admin` and `/api/admin` gating: requires `isSuperAdmin === true` in JWT token
- Added org guard: redirects to `/no-org` if no orgId AND not super admin
- Remains edge-safe: no DB calls, only reads JWT-derived fields

### src/app/(app)/layout.tsx -- Org Guard Bypass
- Changed `if (!session.user.orgId)` to `if (!session.user.orgId && !session.user.isSuperAdmin)`

## INTEGRATION Notes for Task 2 and Task 3
- **Task 2:** All 7 new DB functions are available via `@/lib/db-imports`. `requireSuperAdmin` helper should check `session.user.isSuperAdmin`.
- **Task 3:** `session.user.isSuperAdmin` is available for layout guard in `(admin)` route group.
- **GOTCHA:** `getOrgMemberForOrg` does NOT filter by `deleted_at`. After soft-delete, the org membership still exists in the JOIN. However, the auth.config.ts org guard + layout guard combination handles blocking deleted-org members: on next JWT refresh, if `getOrgById` returns null (a concern for Task 2 to verify), `token.orgId` becomes undefined, triggering the org guard redirect.

## Build Verification
- TypeScript: `npx tsc --noEmit` passes with zero errors
