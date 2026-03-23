# Lead Notes — Plan 038: Law Firm Dashboard & Case Assignment

## Overview
Adds case assignment (mandatory 1:1 ownership) and an admin "My law firm" tab to Legal Hub.
Every case must have an assigned user. Members only see their assigned cases. Admins/owners see all.

## Concurrency Decision
2 concurrent task-teams. Task 1 blocks all others. After Task 1: Tasks 2 & 3 run in parallel.
Tasks 4 & 5 pipeline-spawn when 2 & 3 enter review/test respectively.

## Task Dependency Graph
- Task 1 (DB schema + migration): no dependencies — CRITICAL BLOCKER
- Task 2 (Case assignment API): depends on Task 1
- Task 3 (Firm stats + profile API): depends on Task 1
- Task 4 (Case assignment UI): depends on Task 2
- Task 5 ("My law firm" tab UI): depends on Task 3

## Key Architectural Constraints

### DB Changes
- `legal_cases`: ADD `assigned_to INTEGER REFERENCES users(id)` (nullable → backfill → effectively required)
- `org_members`: ADD `first_name TEXT`, `last_name TEXT`, `phone TEXT`, `specialization TEXT`, `bar_registration_number TEXT` (all nullable)
- Migration backfill: assign all existing cases with `assigned_to IS NULL` to the org's owner (fallback: first admin by joined_at)

### Access Control Rule
| Role | Case visibility |
|------|----------------|
| `member` | Only `assigned_to = session.user.id` |
| `admin` | All cases in org |
| `owner` | All cases in org |
| `isSuperAdmin` | All cases in org |

Applied in `getLegalCases(orgId, userId, orgRole)` — new `userId` and `orgRole` params.

### Auth Pattern
- Use `auth()` from `@/auth` — NOT `@/lib/auth-imports`
- Session carries: `orgId`, `orgRole` (`member`/`admin`/`owner`), `isSuperAdmin`, `permissions`
- Members: `session.user.orgRole === 'member'`
- Admin/owner: `session.user.orgRole !== 'member'`

### Existing Patterns to Follow
- All AI routes: inline `new Anthropic(...)`, file-based prompts — NOT relevant here (no AI)
- Case API routes: `src/app/api/legal-hub/cases/route.ts` pattern (auth, ensureDb, try/catch)
- DB functions in `lib/db.js` — pure CJS, all helpers exported from `src/lib/db-imports.ts`
- REST standard: `await ensureDb()` required in every handler
- Permission check: `hasPermission(perm, 'edit')` for legal_hub resource
- TypeScript type changes: `src/lib/types.ts` → `LegalCase` interface

### Profile Fields Location
Lawyer profiles on `org_members` (org-scoped), NOT `users` (global auth). `users.name` stays as-is.

### New API Endpoints
- `GET /api/legal-hub/firm-stats` — admin/owner only, returns stats + member roster
- `PATCH /api/org/members/profile` — member updates own; admin updates any (with target_user_id)

### UI Patterns
- Tabs: use existing shadcn/ui `Tabs`/`TabsList`/`TabsContent` from `@/components/ui/tabs`
- `LegalHubDashboard` currently has no tab shell — add one
- Case detail: assignment field in Overview tab (existing `case-metadata-form.tsx` or `case-header.tsx`)
- `NewCaseDialog`: add `Select` for admin assignee picker (populated from `GET /api/org/members`)

## Critical Decisions
- Lawyer profile on `org_members`, not `users` (org-specific, not auth layer)
- Migration assigns existing cases to org owner (deterministic: role=owner first, then admin, by joined_at)
- `assigned_to` filter applied at `getLegalCases` level — single gate for all case queries
- Case chat/document endpoints don't need their own filter (user can only reach them via case detail which requires list access)

## Files of Interest
- `lib/db.js` — all DB schema, migrations, getLegalCases, createLegalCase, updateLegalCase
- `src/lib/db-imports.ts` — TS bridges to CJS db functions
- `src/lib/types.ts` — LegalCase interface (needs assigned_to, assigned_to_name)
- `src/app/api/legal-hub/cases/route.ts` — GET list + POST create
- `src/app/api/legal-hub/cases/[id]/route.ts` — PATCH update
- `src/app/api/org/members/route.ts` — existing member list endpoint
- `src/components/legal-hub/legal-hub-dashboard.tsx` — main Legal Hub page component
- `src/components/legal-hub/new-case-dialog.tsx` — case creation modal
- `src/components/legal-hub/case-metadata-form.tsx` — case detail metadata

## Execution Complete

**Plan:** 038-law-firm-dashboard
**Tasks:** 5 completed, 0 skipped, 0 escalated
**Wall-clock:** ~18 minutes
**Final gate:** PASSED (709/709 tests, TypeScript clean)

### Tasks Completed
- **Task 1** (DB schema migration): `assigned_to` on `legal_cases`, 5 profile columns on `org_members`, backfill migration, `getLegalCases` filter, `createLegalCase`/`updateLegalCase` updates, `LegalCase` type
- **Task 2** (Case assignment API): `GET /api/legal-hub/cases` member filter, `POST` auto-assign + admin picker, `PATCH` admin-only reassignment with 403 guard
- **Task 3** (Firm stats + profile API): `GET /api/legal-hub/firm-stats`, `PATCH /api/org/members/profile`, `getFirmStats` + `updateMemberProfile` in db.js
- **Task 4** (Case assignment UI): `NewCaseDialog` admin picker, `CaseMetadataForm` reassignment dropdown, `CaseCard` assignee display
- **Task 5** ("My law firm" tab): Tab shell in `LegalHubDashboard`, `FirmStatsPanel`, `MemberRoster` with edit modal

### Files Modified
- `lib/db.js`, `lib/db.d.ts` — schema migration, new db functions
- `src/lib/types.ts` — LegalCase, OrgMember interfaces
- `src/lib/db-imports.ts` — new exports
- `src/app/api/legal-hub/cases/route.ts`, `[id]/route.ts` — assignment API
- `src/app/api/legal-hub/firm-stats/route.ts` — new
- `src/app/api/org/members/profile/route.ts` — new
- `src/components/legal-hub/new-case-dialog.tsx`, `case-metadata-form.tsx`, `case-card.tsx` — assignment UI
- `src/components/legal-hub/legal-hub-dashboard.tsx`, `firm-stats-panel.tsx`, `member-roster.tsx` — admin tab

### Decisions Made During Execution
- Auth import corrected to `@/auth` (not `@/lib/auth-imports`)
- Backfill uses `run()` wrapper not `db.run()` — reviewer-1 caught persistence risk
- Positive admin guard (`orgRole === 'admin' || 'owner' || isSuperAdmin`) instead of negative — reviewer-3 caught undefined orgRole edge case
- `OrgMember` moved to `types.ts` — reviewer-4 caught module-separation violation
- Empty catch block replaced with `console.warn` in case-metadata-form — reviewer-4
- Task 5 used manual tab pattern (no radix-tabs) — executor-5 correctly identified missing dependency
- `lib/db.d.ts` added to task-3 scope after reviewer-3 pre-analysis

### Test Results
- Per-task: 5/5 all passed review + test
- Final gate: PASS — 709/709, `npx tsc --noEmit` clean
