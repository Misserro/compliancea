# Lead Notes — Plan 030-global-admin

## Plan Overview

Introduce a system-level super admin role (`is_super_admin` flag on users) that can manage organizations across the entire app. Super admins get a dedicated `/admin` panel to create orgs, soft-delete orgs (immediately inaccessible, 30-day retention), and restore orgs. Normal users are unaffected.

## Concurrency Decision

- 3 tasks, sequential pipeline: T1 → T2 → T3
- T1 runs first (foundational DB + auth changes)
- T2 is pipeline-spawned (planning only) during T1 review/test
- T3 is pipeline-spawned (planning only) during T2 review/test
- Max 1 active implementation at a time (1 slot)

## Task Dependency Graph

- Task 1: no dependencies — DB migrations, auth, seeding
- Task 2: depends on Task 1 — API routes need DB functions + isSuperAdmin in session
- Task 3: depends on Task 2 — UI needs API routes to exist

## Key Architectural Constraints

1. **`users.role` is legacy** — ALL users currently have `role = 'admin'` as default. Do NOT repurpose this field. Add `is_super_admin INTEGER NOT NULL DEFAULT 0` as new column.
2. **`auth.config.ts` is edge-safe** — can read `auth.user.isSuperAdmin` from JWT token (safe). Cannot call DB, bcrypt, or sql.js (Node.js only).
3. **Super admin org guard bypass** — `src/app/(app)/layout.tsx` currently redirects to `/no-org` if `!session.user.orgId`. Must add `&& !session.user.isSuperAdmin` bypass.
4. **`(admin)` route group outside `(app)` layout** — admin panel lives in `src/app/(admin)/` — no org membership required, no AppSidebar.
5. **`getAllOrganizations()` does NOT exist** — must be created. All current org queries are single-org scoped.
6. **Invite role cap** — `POST /api/org/invites` caps invited role at `member|admin`. Admin creating org + inviting first owner must call `createOrgInvite(orgId, email, 'owner')` directly from DB layer, bypassing route-level role cap.
7. **Soft-delete + JWT refresh** — After `softDeleteOrg(id)`, existing member sessions still have `orgId` in JWT. On next request, `getOrgMemberForOrg` (called in JWT callback) returns null → `token.orgId` becomes undefined → org guard fires → member redirected to `/no-org`. Verify `getOrgById` (or `getOrgMemberForOrg`) handles deleted org correctly.
8. **saveDb() BEFORE logAction()** — systemic rule from Plans 027-029. Never violate.
9. **Module bridge rule** — TypeScript src/ files must not import from `../../lib/*.js` directly. Use `@/lib/*-imports` bridge files.
10. **`SUPER_ADMIN_EMAIL` env var** — bootstrap seeding in `initDb()`. If set and user with that email exists, mark as super admin. Idempotent.

## Critical Decisions

- Super admin is purely management-layer: cannot access org data (no org membership assumed)
- Soft-delete: 30-day retention, hard-delete logic deferred (for now just surface expired orgs in UI)
- Admin panel at `/admin` inside `(admin)` route group
- `createOrganization(name, slug)` needed as new DB function (no such function exists)
- `setSuperAdmin(userId, flag)` for future use (not exposed in UI for Plan 030, seeding only)
- Invite URL returned from `POST /api/admin/orgs` — reuses Plan 028 invite system

---

## Execution Complete

**Plan:** 030-global-admin
**Tasks:** 3 completed, 0 skipped, 0 escalated
**Wall-clock:** ~25 minutes

### Tasks Completed
- **Task 1**: `is_super_admin` + `deleted_at` migrations, SUPER_ADMIN_EMAIL seeding, 7 new DB functions, `isSuperAdmin` in JWT type augmentation + callback (both branches), session callback, `auth.config.ts` /admin gating, org guard bypass in (app)/layout.tsx
- **Task 2**: `requireSuperAdmin` helper, `GET/POST /api/admin/orgs`, `GET/PATCH/DELETE /api/admin/orgs/[id]`, `POST /api/admin/orgs/[id]/restore`, **critical fix**: `getOrgMemberForOrg` + `getOrgMemberByUserId` filter `AND o.deleted_at IS NULL` so soft-deleted org members are redirected to /no-org
- **Task 3**: `src/app/(admin)/layout.tsx` (nested, no html/body), `src/app/(admin)/admin/page.tsx` (server component, DB direct), `AdminOrgList` client component (table, AlertDialog delete, restore), `CreateOrgDialog` (form, invite URL copy), `ORG_STATUS_COLORS` in constants.ts

### Files Modified (key)
- `lib/db.js` — is_super_admin + deleted_at migrations, seeding, 7 new org functions, getOrgMemberForOrg + getOrgMemberByUserId deleted_at filter
- `lib/db.d.ts` + `src/lib/db-imports.ts` — declarations + re-exports
- `src/auth.ts` — isSuperAdmin in type augmentation + JWT callback + session callback
- `auth.config.ts` — /admin/* gating with isSuperAdmin
- `src/app/(app)/layout.tsx` — org guard bypass for super admins
- `src/lib/require-super-admin.ts` — new guard helper
- `src/app/api/admin/orgs/` (3 route files) — new admin API
- `src/lib/constants.ts` — ORG_STATUS_COLORS
- `src/app/(admin)/layout.tsx` — new admin layout
- `src/app/(admin)/admin/page.tsx` — new admin page
- `src/components/admin/admin-org-list.tsx` — new client component
- `src/components/admin/create-org-dialog.tsx` — new client component
- `tests/integration/super-admin-db-auth.test.ts` — 48 new tests
- `tests/integration/admin-api-routes.test.ts` — 65 new tests

### Decisions Made During Execution
- Soft-delete JWT propagation: `getOrgMemberForOrg` + `getOrgMemberByUserId` both filter `AND o.deleted_at IS NULL` (tester-2 caught this; the plan's Risk Assessment had flagged `getOrgById` but the actual fix was on these two functions)
- Admin layout has no html/body tags (executor-3 correctly identified the plan README had an error — root layout provides html/body)
- Status computation duplicated in API route + server component (acceptable trade-off for direct DB access)

### Test Results
- Per-task tests: 476/476 passed
- Final gate (full suite): **PASSED** — 476/476, 15 test files, zero regressions

### Follow-up Items
- Plan 031: User Permission System (action-level access per feature)
- Extract org status computation to shared utility if it needs to change (PM recommendation)
- Consider adding "Admin Panel" link to sidebar only for super admins

## Pipeline Spawn Strategy

- When Task 1 enters review/test: pipeline-spawn executor-2 (planning only)
- When Task 2 enters review/test: pipeline-spawn executor-3 (planning only)
- This allows T2 and T3 to plan while T1 and T2 are in review — saves wall-clock time
