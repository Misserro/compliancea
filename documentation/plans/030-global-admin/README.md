# Plan 030: Global Admin

> Execute: /uc:plan-execution 030

## Objective

Introduce a system-level super admin role that can create and manage organizations across the entire app, independent of org membership. Super admins get a dedicated `/admin` panel to view all organizations, create new orgs (with an optional first-owner invite), soft-delete orgs (immediately inaccessible to members, data retained 30 days), and restore orgs within the retention window. Normal users and org admins are unaffected.

## Context

- [Architecture Overview](../../technology/architecture/overview.md)
- [Database Schema](../../technology/architecture/database-schema.md) — `is_super_admin` on users, `deleted_at` on organizations
- [Auth Standard](../../technology/standards/authentication-authorization.md) — updated JWT type augmentation, super admin guard pattern
- [REST API Standard](../../technology/standards/rest-api.md) — saveDb before logAction (enforced)
- [Plan 027 — Org Foundation](../027-org-foundation/) — org tables, JWT org context
- [Plan 028 — Invite Flow](../028-org-member-invite-flow/) — invite system reused for first-owner invite
- Followed by: Plan 031 (User Permission System)

## Tech Stack

- **sql.js** — ALTER TABLE migrations for `is_super_admin`, `deleted_at`
- **NextAuth v5** — JWT callback extension, `auth.config.ts` route gating
- **Next.js App Router** — new `(admin)` route group outside `(app)` layout
- **React / Shadcn UI** — org management table, create org modal, soft-delete AlertDialog

## Scope

### In Scope
- `ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0`
- `ALTER TABLE organizations ADD COLUMN deleted_at DATETIME`
- Bootstrap: `SUPER_ADMIN_EMAIL` env var seeds first super admin in `initDb()`
- New DB functions: `getAllOrganizations()`, `createOrganization(name, slug)`, `softDeleteOrg(id)`, `restoreOrg(id)`, `setSuperAdmin(userId, flag)`, `getOrgWithMemberCount(id)`
- `src/auth.ts` — `isSuperAdmin` added to JWT type augmentation and callback
- `src/app/(app)/layout.tsx` — org guard bypass for super admins (`!session.user.orgId && !session.user.isSuperAdmin` → redirect)
- `auth.config.ts` — `/admin/*` and `/api/admin/*` paths require `isSuperAdmin === true`
- `GET /api/admin/orgs` — list all orgs (active + soft-deleted with days remaining)
- `POST /api/admin/orgs` — create org + optional owner invite (returns invite URL)
- `GET /api/admin/orgs/[id]` — org detail with member list
- `DELETE /api/admin/orgs/[id]` — soft-delete (set `deleted_at`)
- `POST /api/admin/orgs/[id]/restore` — restore (clear `deleted_at`) if within 30 days
- `PATCH /api/admin/orgs/[id]` — rename org (name + slug)
- `src/app/(admin)/layout.tsx` — new route group, super admin check, no org guard
- `src/app/(admin)/admin/page.tsx` — org list table with status badges, actions
- Create org modal (name, slug, optional owner email → shows invite link)
- Soft-delete AlertDialog with 30-day countdown for pending-deletion orgs
- Restore button

### Out of Scope
- Per-user action-level permissions (Plan 031)
- Super admin impersonating an org / reading org data
- Hard-delete (data permanence until 30-day window expires)
- Org billing/plan management
- Super admin creating other super admins via UI (seeding only for now)

## Success Criteria

- [ ] `SUPER_ADMIN_EMAIL=x@y.com` in env → user with that email has `is_super_admin = 1` after `initDb()` runs
- [ ] Super admin logs in → `session.user.isSuperAdmin === true`
- [ ] Non-super admin visiting `/admin` → redirected away (403 or dashboard)
- [ ] `GET /api/admin/orgs` returns all organizations including soft-deleted (with `daysUntilDeletion` for soft-deleted ones)
- [ ] `POST /api/admin/orgs` creates a new org; if email provided, returns `{ inviteUrl }` using existing invite system
- [ ] `DELETE /api/admin/orgs/[id]` sets `deleted_at`; org members accessing app are redirected to `/no-org`
- [ ] `POST /api/admin/orgs/[id]/restore` clears `deleted_at` within 30 days; org members can log in again
- [ ] All existing org queries (`getAllDocuments`, `getLegalCases`, etc.) implicitly exclude soft-deleted orgs (via `getOrgById` returning null for deleted orgs)
- [ ] `/admin` page lists all orgs with correct active/pending-deletion status
- [ ] Super admin can create org from UI, copy invite link, and send to first owner
- [ ] Soft-deleted org shows 30-day countdown in admin UI; restore button available

---

## Tasks

### Task 1: Super Admin DB, Auth, and Seeding

**Description:**

**DB migrations (`lib/db.js` `initDb()`):**
```javascript
// Add to existing migration batch:
try { db.run(`ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0`); } catch (e) {}
try { db.run(`ALTER TABLE organizations ADD COLUMN deleted_at DATETIME`); } catch (e) {}
```

**Bootstrap seeding (after existing first-run bootstrap in `initDb()`):**
```javascript
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
if (superAdminEmail) {
  const user = get(`SELECT id FROM users WHERE email = ?`, [superAdminEmail.trim().toLowerCase()]);
  if (user) {
    run(`UPDATE users SET is_super_admin = 1 WHERE id = ?`, [user.id]);
  }
}
```

**New DB functions:**
- `getAllOrganizations()` — `SELECT o.*, COUNT(om.user_id) as member_count FROM organizations o LEFT JOIN org_members om ON om.org_id = o.id GROUP BY o.id ORDER BY o.created_at DESC` — returns all orgs including soft-deleted
- `getActiveOrganizations()` — same but `WHERE o.deleted_at IS NULL`
- `createOrganization(name, slug)` — `INSERT INTO organizations (name, slug)` — returns new org id
- `softDeleteOrg(id)` — `UPDATE organizations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`
- `restoreOrg(id)` — `UPDATE organizations SET deleted_at = NULL WHERE id = ?`
- `setSuperAdmin(userId, flag)` — `UPDATE users SET is_super_admin = ? WHERE id = ?`
- `getOrgWithMemberCount(id)` — single org by id with member count JOIN (including deleted)

Update `lib/db.d.ts` and `src/lib/db-imports.ts` with all new function signatures.

**`src/auth.ts` — JWT type augmentation:**

Add to the existing `declare module "next-auth"` block:
```typescript
isSuperAdmin?: boolean;
```
Add to the existing `declare module "@auth/core/jwt"` block:
```typescript
isSuperAdmin?: boolean;
```

**JWT callback — populate `isSuperAdmin`:**

In the `jwt` callback, after the existing first-sign-in block that reads org membership, also read `users.is_super_admin`:
- On first sign-in (when `user` object is present): query `SELECT is_super_admin FROM users WHERE id = ?` and set `token.isSuperAdmin = !!row?.is_super_admin`
- On subsequent requests (in the `else if (token.id)` branch): add `token.isSuperAdmin` re-hydration (read from DB, same as orgRole refresh) to pick up promotions without requiring re-login

**Session callback:**
Add `session.user.isSuperAdmin = token.isSuperAdmin` mapping.

**`auth.config.ts` — super admin route protection:**

Extend the `authorized` callback to gate `/admin/*` and `/api/admin/*`:
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
Note: `auth.config.ts` is edge-safe — reading JWT token fields is safe; no DB calls allowed here.

**`src/app/(app)/layout.tsx` — org guard bypass:**

Change the org guard condition from:
```typescript
if (!session.user.orgId) redirect('/no-org');
```
To:
```typescript
if (!session.user.orgId && !session.user.isSuperAdmin) redirect('/no-org');
```

**Files:**
- `lib/db.js` — 2 ALTER TABLE migrations, bootstrap seeding, 7 new functions
- `lib/db.d.ts` — declarations for 7 new functions
- `src/lib/db-imports.ts` — re-exports
- `src/auth.ts` — `isSuperAdmin` in type augmentation, JWT callback, session callback
- `auth.config.ts` — extended `authorized` callback
- `src/app/(app)/layout.tsx` — org guard bypass

**Patterns:**
- `documentation/technology/standards/database.md` (ALTER TABLE try/catch, three-step bridge)
- `documentation/technology/standards/authentication-authorization.md` (JWT callback patterns, type augmentation)
- `documentation/technology/standards/rest-api.md`

**Success Criteria:**
- `SUPER_ADMIN_EMAIL` env var set → user with that email has `is_super_admin = 1` after `initDb()`
- Super admin logs in → `session.user.isSuperAdmin === true`
- Non-super admin visiting `/admin` → not allowed (auth.config.ts blocks it)
- Super admin visiting `/(app)/` layout with no org membership → not redirected to `/no-org`
- All 8+ ALTER TABLE migrations run without error on existing DB

**Dependencies:** None

---

### Task 2: Admin API Routes

**Description:**

Create all `/api/admin/orgs` routes. All require a `requireSuperAdmin` guard helper.

**Helper (`src/lib/require-super-admin.ts` or inline):**
```typescript
export function requireSuperAdmin(session: Session | null): Response | null {
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
```

**`GET /api/admin/orgs`** — list all orgs:
- Call `getAllOrganizations()`
- For soft-deleted orgs: compute `daysUntilDeletion = 30 - daysSince(deleted_at)` (if ≤ 0, org is past retention — surface for hard delete, but don't delete in this endpoint)
- Return `{ orgs: [{ id, name, slug, memberCount, createdAt, status: 'active'|'pending_deletion'|'expired', daysUntilDeletion?, deletedAt? }] }`

**`POST /api/admin/orgs`** — create org:
- Body: `{ name, slug, ownerEmail? }`
- Validate: name non-empty, slug matches `/^[a-z0-9-]+$/`, slug not already taken (`SELECT id FROM organizations WHERE slug = ?`)
- `createOrganization(name, slug)` → `orgId`
- If `ownerEmail` provided: `createOrgInvite(orgId, ownerEmail, 'owner')` → return invite URL
  - Note: bypass the `orgRole` check from `/api/org/invites` — admin can invite as `owner`
  - Use `createOrgInvite` directly from DB layer
- `saveDb()` → `logAction()` → return `{ org: { id, name, slug }, inviteUrl? }`
- Status: 201

**`GET /api/admin/orgs/[id]`** — org detail:
- `getOrgWithMemberCount(id)` — 404 if not found
- `getOrgMembers(id)` — include member list
- Return `{ org, members }`

**`PATCH /api/admin/orgs/[id]`** — rename:
- Body: `{ name?, slug? }`
- Validate non-empty, slug format/uniqueness
- `updateOrgName(id, name)` + `run('UPDATE organizations SET slug = ? WHERE id = ?', [slug, id])` if slug provided
- `saveDb()` → `logAction()`

**`DELETE /api/admin/orgs/[id]`** — soft-delete:
- Verify org exists and `deleted_at IS NULL` (409 if already deleted)
- `softDeleteOrg(id)`
- `saveDb()` → `logAction("organization", id, "soft_deleted", ...)`
- Return 204

**`POST /api/admin/orgs/[id]/restore`** — restore:
- Verify org exists and `deleted_at IS NOT NULL`
- Check `deleted_at` is within 30 days — if expired, return 409 `{ error: "Retention period expired" }`
- `restoreOrg(id)`
- `saveDb()` → `logAction()`
- Return `{ org }`

**Files:**
- `src/app/api/admin/orgs/route.ts` — GET list, POST create
- `src/app/api/admin/orgs/[id]/route.ts` — GET detail, PATCH rename, DELETE soft-delete
- `src/app/api/admin/orgs/[id]/restore/route.ts` — POST restore
- `src/lib/require-super-admin.ts` — helper (or inline in routes)

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (auth guard — use requireSuperAdmin instead of orgRole check)
- `documentation/technology/standards/rest-api.md` (201 on create, saveDb before logAction, 204 on delete)
- `documentation/technology/standards/module-separation.md` (bridge imports)

**Success Criteria:**
- `GET /api/admin/orgs` without super admin session returns 403
- `GET /api/admin/orgs` with super admin returns all orgs including soft-deleted with correct status
- `POST /api/admin/orgs` creates org; if `ownerEmail` provided, returns `{ inviteUrl }`
- `POST /api/admin/orgs` with duplicate slug returns 409
- `DELETE /api/admin/orgs/[id]` sets `deleted_at`; org members accessing `/(app)/` redirected to `/no-org` (session's `orgId` still set but `getOrgById` returns null for deleted org → JWT refresh sets `orgId = undefined`)
- `POST /api/admin/orgs/[id]/restore` within 30 days clears `deleted_at`
- `POST /api/admin/orgs/[id]/restore` after 30 days returns 409

**Dependencies:** Task 1

---

### Task 3: Admin UI

**Description:**

Create the dedicated admin panel as a new `(admin)` route group outside the `(app)` layout.

**New layout `src/app/(admin)/layout.tsx`:**
- Server component
- Calls `await auth()`; if `!session?.user?.isSuperAdmin` → `redirect('/dashboard')` (non-super-admins land on the normal app)
- Simple wrapper with a minimal nav (just "Admin" heading + link back to app)
- No `AppSidebar`, no org context required

**Admin page `src/app/(admin)/admin/page.tsx`:**
- Server component (fetches data server-side via `GET /api/admin/orgs`)
- Renders a table with columns: Name, Slug, Members, Created, Status, Actions
- Status badge: `Active` (green) | `Pending Deletion` (red with "X days left")
- Actions per row:
  - Active org: "Edit" (inline name/slug edit), "Delete" (opens AlertDialog)
  - Pending deletion org: "Restore" button, days remaining shown
- "Create organization" button → opens a dialog/modal
- Static page with `router.refresh()` after mutations (no complex state management)

**Create org dialog (client component):**
- Fields: Organization Name (required), Slug (auto-generated from name, editable), Owner Email (optional, label: "Invite first owner")
- Slug auto-generation: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
- On submit: `POST /api/admin/orgs` → if `inviteUrl` in response, show a copy-to-clipboard success state displaying the invite link
- Validates slug format client-side before submit

**Soft-delete AlertDialog:**
```
Are you sure you want to delete "{orgName}"?
All {memberCount} members will lose access immediately.
Data will be permanently deleted after 30 days.
```
- Two buttons: Cancel, Delete (destructive variant)
- On confirm: `DELETE /api/admin/orgs/[id]` → `router.refresh()`

**Files:**
- `src/app/(admin)/layout.tsx` — new route group layout
- `src/app/(admin)/admin/page.tsx` — org list page (server component)
- `src/components/admin/create-org-dialog.tsx` — create org form (client component)

**Patterns:**
- `documentation/technology/standards/design-system.md` (AlertDialog, Badge, Table, Button, Dialog)
- `documentation/technology/standards/authentication-authorization.md` (super admin guard in layout)

**Success Criteria:**
- Non-super admin visiting `/admin` → redirected to `/dashboard`
- `/admin` page renders org list with correct columns and status badges
- Create org form: name + slug validation; submit creates org via API
- If owner email provided: invite link shown with copy button after creation
- Delete AlertDialog shows org name + member count; confirm triggers soft-delete + page refresh
- Pending-deletion orgs show days remaining + restore button
- Restore button calls restore API + page refreshes showing org as active again

**Dependencies:** Task 2

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/standards/authentication-authorization.md` | Updated | JWT type augmentation block updated with orgId/orgRole/orgName (Plans 027-028) and isSuperAdmin (Plan 030) |
| `documentation/technology/standards/rest-api.md` | Updated | saveDb() BEFORE logAction() rule made explicit with rationale |
| `documentation/technology/architecture/database-schema.md` | Updated | Added deleted_at to organizations table; is_super_admin to users pending Plan 030 |
| `documentation/product/requirements/features.md` | Updated | Added Global Admin section under Organization Management |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Soft-deleted org: existing sessions still have `orgId` in JWT — members not immediately blocked | Medium | High | JWT callback re-hydrates org on every request via `getOrgMemberForOrg` — if `getOrgById` returns null for deleted org, `token.orgId` becomes undefined, org guard blocks access. Verify `getOrgById` filters `deleted_at IS NOT NULL`. |
| `SUPER_ADMIN_EMAIL` env var not set on first run — no way to access admin panel | High | Medium | Document clearly in deployment guide. Alternative: seed script. Accept this risk for now. |
| `auth.config.ts` isSuperAdmin check reads stale JWT | Low | Medium | JWT callback re-hydrates `isSuperAdmin` on every subsequent request (same pattern as orgRole refresh). Promotion takes effect on next request without re-login. |
| Slug uniqueness check race condition | Low | Low | SQLite is single-writer; UNIQUE constraint on slug is the final guard. |
| Task 3 needs task 2 routes to exist — sequentially dependent | High | Low | Clear dependency chain: T1 → T2 → T3. No parallelism possible. |
