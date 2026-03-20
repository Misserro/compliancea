# Lead Notes — Plan 028-org-member-invite-flow

## Plan Overview

Enable org owners/admins to invite users via a shareable copy-link (no email). New and existing users follow the link, authenticate, and are enrolled in the inviting org with the specified role. Users in multiple orgs can switch between them via a sidebar dropdown without re-logging in.

## Concurrency Decision

- 4 tasks total → up to 2 concurrent task-teams
- Wave 1 (parallel): Task 1 (Invite DB + API) + Task 4 (Org Switcher)
- Wave 2 (parallel, after Task 1 done): Task 2 (Acceptance Flow) + Task 3 (Invite UI)

## Task Dependency Graph

- Task 1: no dependencies — runs in Wave 1
- Task 2: depends on Task 1 — runs in Wave 2 (acceptance flow needs invite API)
- Task 3: depends on Task 1 — runs in Wave 2 (UI needs invite API)
- Task 4: no dependencies — runs in Wave 1 (independent of invite flow)

## Key Architectural Constraints

1. **`org_invites` table already exists** (Plan 027) — schema is in place, zero JS functions yet
2. **JWT callback must be fixed in Task 4** — current `src/auth.ts` always re-fetches FIRST org membership; must change to use `token.orgId` when set, and handle `trigger === "update"` for explicit org switching
3. **`/invite/[token]` is a PUBLIC route** — must be added to `middleware.ts` matcher exclusions AND `auth.config.ts` authorized callback. Place page at `src/app/invite/[token]/page.tsx` (outside `(app)` group)
4. **`getAllOrgMembershipsForUser` overlap** — both Task 1 and Task 4 define this function. Whichever task runs second must check if it already exists and skip creation
5. **Token security** — use `crypto.randomUUID()`, 7-day expiry, single-use (mark `accepted_at`), re-invite auto-revokes pending token for same email+org
6. **`GET /api/invites/[token]`** — PUBLIC route, no auth. Must be added to middleware exclusions too
7. **`useSession().update({ switchToOrgId })` triggers JWT `trigger: "update"` callback** — client-side session mutation without re-login
8. **`session.user.orgId` is stored as string** in JWT — always `Number(session.user.orgId)` before DB calls

## Critical Decisions

- Copy-link only (no email delivery)
- Acceptance requires authentication — anonymous acceptance not supported
- Token is sole auth factor for invite acceptance — email match not enforced
- 7-day expiry, re-invite revokes old pending token
- Org switcher shows dropdown only when user has 2+ orgs (no regression for single-org users)
- `POST /api/org/switch` is a validation-only endpoint — actual session update done client-side via `updateSession()`

## Systemic Pattern Identified

**MUTATION LIFECYCLE ORDER — Wave 1 both failed on this:**
Both executor-1 and executor-4 called `logAction()` BEFORE `saveDb()`. The correct order per rest-api.md is:
```
mutate → saveDb() → logAction()
```
**Wave 2 executors (tasks 2 and 3) must follow this order in all mutation handlers.**

---

## Execution Complete

**Plan:** 028-org-member-invite-flow
**Tasks:** 4 completed, 0 skipped, 0 escalated
**Wall-clock:** ~23 minutes

### Tasks Completed
- **Task 1**: org invite DB functions (createOrgInvite, getOrgInviteByToken, listOrgInvites, acceptOrgInvite, revokeOrgInvite, getAllOrgMembershipsForUser, getOrgMemberForOrg), POST/GET /api/org/invites, DELETE /api/org/invites/[token], public GET /api/invites/[token], middleware exclusion for api/invites
- **Task 2**: /invite/[token] public page (outside (app) group), POST /api/invites/[token]/accept, login/register invite-token awareness (sessionStorage, banners, redirect), middleware + auth.config.ts updated for /invite/* public access
- **Task 3**: invite form + copy-link display + pending invites table with AlertDialog revoke on /org/members page
- **Task 4**: JWT callback three-branch fix (trigger===update, token.orgId persistence, first-org fallback), POST /api/org/switch, GET /api/org/memberships, sidebar org switcher dropdown (conditional on 2+ orgs)

### Files Modified (key)
- `lib/db.js` — 7 new invite/org functions
- `lib/db.d.ts` + `src/lib/db-imports.ts` — declarations + re-exports
- `src/auth.ts` — JWT callback three-branch fix
- `src/app/api/org/invites/route.ts` — new POST + GET
- `src/app/api/org/invites/[token]/route.ts` — new DELETE
- `src/app/api/invites/[token]/route.ts` — new GET (public) + POST (accept)
- `src/app/invite/[token]/page.tsx` — new public landing page
- `src/app/invite/[token]/invite-accept-client.tsx` — new client auto-accept component
- `src/app/(auth)/login/page.tsx` — invite awareness
- `src/app/(auth)/register/page.tsx` — invite awareness
- `src/app/api/org/switch/route.ts` — new POST
- `src/app/api/org/memberships/route.ts` — new GET
- `src/app/(app)/org/members/page.tsx` — invite form + pending invites table
- `src/components/layout/app-sidebar.tsx` — org switcher dropdown
- `middleware.ts` — /invite + api/invites excluded
- `auth.config.ts` — /invite/* allowed without auth
- `tests/integration/org-invite-api.test.ts` — new (45 tests)
- `tests/integration/org-invite-acceptance.test.ts` — new (43 tests)
- `tests/integration/org-switcher.test.ts` — new (45 tests)

### Decisions Made During Execution
- `update()` with no args sufficient for org join — JWT callback re-hydrates unconditionally
- Dynamic `/invite/[token]` route avoids useSearchParams/Suspense requirement
- `addOrgMember(invitedBy=null)` — traceability not enforced (acceptable, noted by reviewer-2)
- `datetime(expires_at) > datetime('now')` normalization for ISO vs SQLite date format
- Both middleware matcher AND auth.config.ts authorized callback updated for defense-in-depth

### Test Results
- Per-task tests: 271/271 passed (0 failures)
- Final gate (full suite): **PASSED** — 271/271, 9 test files, zero regressions

### Follow-up Items
- Add `saveDb() before logAction()` rule to documentation/technology/standards/rest-api.md (PM recommendation)
- Add SQLite datetime() normalization note to documentation/technology/standards/database.md (PM recommendation)
- Plan 029: Storage Layer

## Agents Active

- knowledge-org-member-invite-flow
- pm-org-member-invite-flow
- executor-1, reviewer-1, tester-1 (Task 1 — Wave 1)
- executor-4, reviewer-4, tester-4 (Task 4 — Wave 1, parallel with Task 1)
- executor-2, reviewer-2, tester-2 (Task 2 — Wave 2, after Task 1)
- executor-3, reviewer-3, tester-3 (Task 3 — Wave 2, after Task 1)
