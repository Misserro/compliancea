# Lead Notes — Plan 031-user-permissions

## Plan Overview

Per-user, per-feature action-level permissions for the `member` org role. Five resources × four action levels. Owner/admin bypass. Org default template + per-user overrides. Permissions re-hydrated from DB in JWT callback on every request (same pattern as orgRole).

## Concurrency Decision

- 5 tasks → up to 3 concurrent task-teams
- Wave 1: Task 1 (no deps)
- Wave 2: Task 2 ∥ Task 3 (both depend on Task 1, parallel)
- Wave 3: Task 4 (after T3) ∥ Task 5 (after T2)

## Task Dependency Graph

- Task 1: no dependencies — DB tables, functions, seeding hooks
- Task 2: depends on Task 1 — JWT + API enforcement (~80 routes)
- Task 3: depends on Task 1 — Permission management API (parallel with T2)
- Task 4: depends on Task 3 — Permission management UI
- Task 5: depends on Task 2 — Sidebar + page button hiding

## Key Architectural Constraints

1. **Permission check placement**: immediately after `orgId = Number(session.user.orgId)` in each handler, BEFORE `ensureDb()`
2. **Bypass rule**: `if (session.user.isSuperAdmin || session.user.orgRole !== 'member') skip check` — owners/admins always pass
3. **Fallback**: `getUserPermissionForResource` returns `'full'` when no row exists — backward compatible with existing members who have no permissions rows
4. **Permissions in JWT**: `token.permissions` = `Record<string, 'none'|'view'|'edit'|'full'>` for members; `null` for owner/admin (bypass signal)
5. **HTTP method → required level**: GET→view, POST→edit, PATCH→edit, DELETE→full
6. **Exception**: analyze/ask routes (POST but read-like) → `documents:view`
7. **Three-step bridge rule**: any new lib/ functions → lib/db.d.ts → src/lib/db-imports.ts
8. **Module bridge**: `src/lib/permissions.ts` is a NEW TypeScript file in src/ — NO lib/ equivalent needed (pure TS)
9. **saveDb() BEFORE logAction()** — systemic rule
10. **`resources` constant**: `['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards']`

## Critical Decisions

- Dedicated `member_permissions` + `org_permission_defaults` tables (NOT app_settings KV)
- `seedOrgPermissionDefaults` called from `createOrganization` (existing Plan 030 function)
- `seedMemberPermissionsFromDefaults` called from `addOrgMember` (existing Plan 027 function) — ONLY when role === 'member'
- Owners/admins joining org do NOT get member_permissions rows (they bypass anyway)
- `getUserPermissionForResource` returns 'full' when no row → backward compat
- All existing tests use owner/admin sessions → no regressions expected from enforcement

---

## Execution Complete

**Plan:** 031-user-permissions
**Tasks:** 5 completed, 0 skipped, 0 escalated
**Wall-clock:** ~27 minutes

### Tasks Completed
- **Task 1**: `member_permissions` + `org_permission_defaults` tables, 8 DB functions (seedOrgPermissionDefaults, seedMemberPermissionsFromDefaults, getOrgPermissionDefaults, setOrgPermissionDefault, getMemberPermissions, getUserPermissionForResource, setMemberPermission, resetMemberPermissions), seed hooks in createOrganization + addOrgMember
- **Task 2**: `src/lib/permissions.ts` (RESOURCES, PERMISSION_LEVELS, hasPermission, RESOURCE_LABELS), permissions in JWT type augmentation + callback (re-hydrated per request, null for owner/admin), ~70 API routes with permission enforcement
- **Task 3**: GET/PUT `/api/org/permissions` (org defaults), GET/PUT `/api/org/members/[id]/permissions` (per-user), POST `/api/org/members/[id]/permissions/reset`
- **Task 4**: `src/components/org/member-permissions-dialog.tsx`, members page Shield button + dialog, settings/org Default Member Permissions Card section, PERMISSION_LEVEL_COLORS in constants.ts
- **Task 5**: Sidebar conditional nav groups (contracts/legal_hub/documents/policies), documents upload/action/delete gating via canEdit/canDelete props threaded through DocumentList → DocumentCard, contracts "Add New Contract" gating, legal-hub "New Case" gating

### Files Modified (key)
- `lib/db.js` — 2 new tables, 8 new functions, seed hooks
- `lib/db.d.ts`, `src/lib/db-imports.ts` — declarations + re-exports
- `src/lib/permissions.ts` — new shared helper
- `src/auth.ts` — permissions in JWT type augmentation + callbacks
- `src/app/api/org/permissions/route.ts` — new
- `src/app/api/org/members/[id]/permissions/route.ts` — new
- `src/app/api/org/members/[id]/permissions/reset/route.ts` — new
- ~70 API route files — permission enforcement
- `src/components/org/member-permissions-dialog.tsx` — new
- `src/app/(app)/org/members/page.tsx` — Shield button + dialog
- `src/app/(app)/settings/org/page.tsx` — defaults section
- `src/lib/constants.ts` — PERMISSION_LEVEL_COLORS
- `src/components/layout/app-sidebar.tsx` — conditional nav groups
- `src/app/(app)/documents/page.tsx`, `document-list.tsx`, `document-card.tsx` — canEdit/canDelete threading
- `src/components/contracts/contracts-tab.tsx`, `legal-hub-dashboard.tsx` — button gating
- `tests/integration/permission-db-layer.test.ts` (32 tests), `permission-management-api.test.ts` (80 tests), `jwt-permissions-enforcement.test.ts` (88 tests)

### Test Results
- Per-task tests: 676/676 passed
- Final gate: **PASSED** — 676/676, 18 test files, zero regressions

### Follow-up Items
- Add UI pre-implementation checklist to design-system.md (PM recommendation — prevents first-pass review failures)
- Task 2 scope (70+ routes) was too large; future API enforcement tasks should split by resource group
- reviewer-5 stale-read pattern: reviewers should re-read files immediately before issuing verdict

## Pipeline Spawn Strategy

- When T1 enters review/test: pipeline-spawn executor-2 AND executor-3 simultaneously (both plan in parallel)
- When T2 enters review/test: pipeline-spawn executor-5
- When T3 enters review/test: pipeline-spawn executor-4
