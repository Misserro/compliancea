# Lead Notes — Plan 027-org-foundation

## Plan Overview

Introduce a multi-tenant organization model as the foundation for all future firm-specific features. Every data entity becomes org-scoped. Auth session carries org context. Settings become persistent and per-org. A default org is auto-created on first run so existing deployments are unaffected.

## Concurrency Decision

- 3 tasks total → up to 2 concurrent task-teams
- Task 1 runs first (no dependencies)
- Tasks 2 and 3 run concurrently after Task 1 completes (Task 2 depends on Task 1; Task 3 depends on Task 1, parallel with Task 2)

## Task Dependency Graph

- Task 1: no dependencies — **runs first**
- Task 2: depends on Task 1 — org-scope all DB queries and API routes
- Task 3: depends on Task 1, parallel with Task 2 — org management UI

## Key Architectural Constraints

1. SQLite (sql.js) — all schema changes via `ALTER TABLE ADD COLUMN` wrapped in try/catch per existing migration pattern
2. NextAuth v5 JWT — type augmentation in `src/auth.ts`; `orgId` + `orgRole` must be added to both `Session.user` and `JWT`
3. First-run bootstrap must be idempotent — safe to run on both fresh install and existing deployments
4. Task 2 is a large scope (~100 query function updates + all API routes). Executor must batch: lib/db.js first, then routes by domain group
5. In-memory settings singleton (`lib/settings.js`) must be fully replaced with DB-backed per-org store
6. JWT schema change will invalidate all active sessions — expected and acceptable

## Critical Decisions

- Default org slug: "default", name: "Default Organization"
- New users (registration) auto-enrolled in default org with role: 'member'
- All existing users back-filled as 'owner' of default org on first run
- User with no org membership → redirect to `/no-org` (not a 500)
- Task 2 executor may request a task split if scope is too large — escalate to user if needed

## Agents Active

- knowledge-org-foundation
- pm-org-foundation
- executor-1, reviewer-1, tester-1 (Task 1)
- executor-2, reviewer-2, tester-2 (Task 2 — spawned after Task 1 done)
- executor-3, reviewer-3, tester-3 (Task 3 — spawned after Task 1 done, pipeline with Task 2)

---

## Execution Complete

**Plan:** 027-org-foundation
**Tasks:** 3 completed, 0 skipped, 0 escalated
**Wall-clock:** ~47 minutes (09:34 → 10:22)

### Tasks Completed

- **Task 1** — Org schema (organizations, org_members, org_invites tables), org_id migrations on 11 data tables, app_settings recreated with composite PK, first-run bootstrap, JWT org context (orgId/orgRole/orgName), settings DB-backed per-org store, org membership guard (/no-org), auto-enrollment on registration
- **Task 2** — ~30 DB query/insert functions scoped by orgId, lib/audit.js logAction extended with userId/orgId, lib/search.js org-scoped, lib/policies.js org-scoped, 78 API routes updated with auth guards + orgId threading throughout
- **Task 3** — GET/PATCH /api/org, GET /api/org/members, PATCH/DELETE /api/org/members/[id] with full RBAC, /settings/org page, /org/members page with role management and AlertDialog confirmation, sidebar org name dynamic

### Files Modified (key)

- `lib/db.js` — new org tables, migrations, bootstrap, ~30 query functions updated, 7 new org management functions
- `lib/db.d.ts` + `src/lib/db-imports.ts` — updated signatures
- `lib/audit.js` — logAction extended
- `lib/search.js` — org-scoped search
- `lib/policies.js` — org-scoped policies
- `lib/settings.js` — in-memory singleton replaced with DB-backed per-org store
- `lib/settings.d.ts` — updated signatures
- `src/auth.ts` — JWT/session type augmentation + callbacks (orgId/orgRole/orgName, unconditional refresh)
- `src/app/(app)/layout.tsx` — org membership guard
- `src/app/no-org/page.tsx` — new error page
- `src/app/api/auth/register/route.ts` — auto-enroll in default org
- `src/app/api/settings/` (3 routes) — auth guards + orgId
- `src/app/api/org/` (3 new route files)
- `src/app/(app)/settings/org/page.tsx` — new
- `src/app/(app)/org/members/page.tsx` — new
- `src/components/layout/app-sidebar.tsx` — dynamic org name
- `src/lib/constants.ts` — ORG_ROLE_COLORS added
- 78 API routes across all domains — auth + orgId
- `tests/integration/org-foundation.test.ts` — new (40 tests)
- `tests/integration/org-isolation.test.ts` — new (20 tests)

### Decisions Made During Execution

- `app_settings` PK migration: recreate table with (org_id, key) composite PK rather than ALTER TABLE (SQLite limitation)
- `getAllDocuments` made backward-compatible (orgId optional) to support admin/maintenance routes that legitimately operate cross-org
- `auth.config.ts` org guard reads JWT token only (edge-safe); no DB calls allowed there
- `maintenance/run/route.ts` intentionally not org-scoped — documented as global infrastructure operation
- `orgName` always re-fetched from DB on every JWT callback (not just lazy re-hydration) to support immediate sidebar update after rename

### Test Results

- Per-task tests: 125/125 passed (0 failures)
- Final gate (full suite): **PASSED** — 125/125, 6 test files, zero regressions

### Follow-up Items

- Plan 028: Org Member Invite Flow (email invite, tokenized invites via org_invites table — schema already in place)
- Plan 029: Storage Layer (per-org GDrive configuration)
- Consider adding `orgId` filter requirement to `documentation/technology/standards/database.md` (PM recommendation)
- Consider lazy tester spawn pattern for future plans (PM recommendation)
