# Task 1 Plan -- Super Admin DB, Auth, and Seeding

## Files to Modify

1. **`lib/db.js`** -- 2 ALTER TABLE migrations, bootstrap seeding, 7 new exported functions
2. **`lib/db.d.ts`** -- Type declarations for 7 new functions
3. **`src/lib/db-imports.ts`** -- Re-exports for 7 new functions
4. **`src/auth.ts`** -- `isSuperAdmin` in type augmentation, JWT callback, session callback
5. **`auth.config.ts`** -- Extended `authorized` callback with admin route gating + org guard bypass
6. **`src/app/(app)/layout.tsx`** -- Org guard bypass for super admins

## Changes Per File

### lib/db.js

**Migrations (insert after storage columns migration at line 731, before `initSystemTemplates()` call at line 733):**
- `ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0` (try/catch)
- `ALTER TABLE organizations ADD COLUMN deleted_at DATETIME` (try/catch)

**Bootstrap seeding (insert after the first-run org bootstrap block ends at line 761, before `saveDb()` at line 764):**
- Read `process.env.SUPER_ADMIN_EMAIL`
- If set, look up user by normalized email via `get()`
- If user found, UPDATE `is_super_admin = 1` via `run()`
- Idempotent: setting 1 on an already-1 user is a no-op write

**7 new exported functions (append at end of file, after `getOrgMemberForOrg`):**
1. `getAllOrganizations()` -- SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at, COUNT(om.user_id) as member_count FROM organizations o LEFT JOIN org_members om ON om.org_id = o.id GROUP BY o.id ORDER BY o.created_at DESC
2. `getActiveOrganizations()` -- same but WHERE o.deleted_at IS NULL
3. `createOrganization(name, slug)` -- INSERT INTO organizations (name, slug), return lastInsertRowId
4. `softDeleteOrg(id)` -- UPDATE organizations SET deleted_at = datetime('now') WHERE id = ?
5. `restoreOrg(id)` -- UPDATE organizations SET deleted_at = NULL WHERE id = ?
6. `setSuperAdmin(userId, flag)` -- UPDATE users SET is_super_admin = ? WHERE id = ?
7. `getOrgWithMemberCount(id)` -- SELECT o.*, COUNT(om.user_id) as member_count ... WHERE o.id = ? GROUP BY o.id

### lib/db.d.ts

Add 7 function declarations at the end, following existing pattern (`...args: any[]): any`):
- `getAllOrganizations`, `getActiveOrganizations`, `createOrganization`, `softDeleteOrg`, `restoreOrg`, `setSuperAdmin`, `getOrgWithMemberCount`

### src/lib/db-imports.ts

Add 7 new re-exports to the existing export block.

### src/auth.ts

**Type augmentation:**
- Add `isSuperAdmin?: boolean` to `Session.user` (in `declare module "next-auth"`)
- Add `isSuperAdmin?: boolean` to `JWT` (in `declare module "@auth/core/jwt"`)

**Import change:**
- Add `get` to the existing import from `@/lib/db-imports`

**JWT callback -- first sign-in branch (inside `if (user)`):**
- After the existing org membership lookup (line 84), query `get('SELECT is_super_admin FROM users WHERE id = ?', [Number(user.id)])`
- Set `token.isSuperAdmin = !!row?.is_super_admin`

**JWT callback -- subsequent requests branch (inside `else if (token.sessionId && token.id)`):**
- After the org context refresh block (around line 116), query `get('SELECT is_super_admin FROM users WHERE id = ?', [Number(token.id)])`
- Set `token.isSuperAdmin = !!u?.is_super_admin`

**Session callback:**
- Add `session.user.isSuperAdmin = token.isSuperAdmin` after existing mappings

### auth.config.ts

**Import `NextResponse` from `next/server`.**

**Replace the existing `authorized` callback:**
```typescript
authorized({ auth, request: { nextUrl } }) {
  const { pathname } = nextUrl;
  if (pathname.startsWith('/invite') || pathname.startsWith('/no-org')) return true;
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    return !!(auth?.user as any)?.isSuperAdmin;
  }
  if (!auth?.user) return false;
  if (!auth.user.orgId && !(auth?.user as any)?.isSuperAdmin) {
    return NextResponse.redirect(new URL('/no-org', nextUrl));
  }
  return true;
}
```
- Edge-safe: no DB calls, only reads JWT-derived fields from auth.user
- Uses `(auth?.user as any)?.isSuperAdmin` because edge config doesn't have the type augmentation

### src/app/(app)/layout.tsx

**Change line 25:**
- From: `if (!session.user.orgId) redirect('/no-org')`
- To: `if (!session.user.orgId && !session.user.isSuperAdmin) redirect('/no-org')`

## Success Criteria Mapping

1. SUPER_ADMIN_EMAIL env var set -> user seeded in initDb bootstrap
2. Super admin logs in -> isSuperAdmin populated in JWT -> session.user.isSuperAdmin === true
3. Non-super admin visiting /admin -> auth.config.ts returns false -> redirect to login
4. Super admin with no org visiting (app) layout -> bypass guard -> not redirected
5. ALTER TABLE migrations -> try/catch pattern, idempotent

## Risks / Notes

- `get` is not currently imported in auth.ts -- will add it to the existing import line from `@/lib/db-imports`
- The `authorized` callback growth is significant but stays edge-safe
- Super admin seeding runs every initDb() -- idempotent (SET 1 on already-1 is fine)
- `getOrgMemberForOrg` does not filter by `deleted_at` -- this is noted but out of scope. The lead notes say the org guard in layout.tsx + JWT refresh flow handle this. Task 2 API routes will need to verify `getOrgById` behavior for deleted orgs.
