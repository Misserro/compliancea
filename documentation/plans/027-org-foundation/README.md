# Plan 027: Org Foundation

> Execute: /uc:plan-execution 027

## Objective

Introduce a multi-tenant organization model as the foundation for all future firm-specific features (storage, member management, invite flow). Every data entity becomes org-scoped. Auth session carries org context. Settings become persistent and per-org. A default org is auto-created on first run so existing deployments are unaffected.

## Context

- [Architecture Overview](../../technology/architecture/overview.md) — multi-tenancy model described
- [Database Schema](../../technology/architecture/database-schema.md) — current table definitions (pre-org)
- [Auth Standard](../../technology/standards/authentication-authorization.md) — JWT/session patterns to follow
- [Database Standard](../../technology/standards/database.md) — DB coding conventions
- [REST API Standard](../../technology/standards/rest-api.md) — route conventions
- [Plan 011 — Auth](../011-auth/) — original auth implementation
- [Plan 012 — Session Management](../012-user-session-admin-management/) — session revocation model
- Followed by: Plan 028 (Org Member Invite Flow), Plan 029 (Storage Layer)

## Tech Stack

- **sql.js** — SQLite in-process; schema changes via `ALTER TABLE ADD COLUMN` with try/catch pattern
- **NextAuth v5** — JWT session; type augmentation in `src/auth.ts`
- **Next.js App Router** — API routes in `src/app/api/`
- **React / Shadcn UI** — settings page and members UI components

## Scope

### In Scope
- `organizations`, `org_members`, `org_invites` table definitions
- `org_id` column added to all 12 data tables via migration
- Auto-create default org + backfill all existing data on first run
- Enroll all existing users in default org as `owner`
- Replace in-memory settings singleton with DB-backed per-org store
- `orgId` + `orgRole` added to JWT token and session type
- All DB query functions updated to accept and filter by `org_id`
- All API routes updated to extract `orgId` from session and pass to queries
- `user_id` added to `audit_log` entries
- Org settings page (name edit)
- Members management page (list, role change, remove)
- Org name in sidebar header

### Out of Scope
- Email invite flow (Plan 028)
- Org switcher for users belonging to multiple orgs (Plan 028)
- Storage configuration per org (Plan 029)
- Billing / plan management
- Org creation UI (default org is sufficient for now; new orgs created via DB or future admin UI)

## Success Criteria

- [ ] Fresh install: default org "Default Organization" created automatically, first registered user enrolled as `owner`
- [ ] Existing deployment: all data rows backfilled with `org_id = 1`; all existing users enrolled in default org
- [ ] Login produces a session where `session.user.orgId` and `session.user.orgRole` are populated
- [ ] User with no org membership is redirected to an error page — not a 500
- [ ] Changing a setting persists after server restart (no longer in-memory)
- [ ] Two distinct orgs cannot see each other's documents, cases, or any data
- [ ] All app pages load without errors (no 500s from missing `org_id` filters)
- [ ] Admin can edit org name; org name appears in sidebar header
- [ ] Admin can view members list, change roles, and remove members

---

## Tasks

### Task 1: Org Schema, Auth Org Context, and Settings Persistence

**Description:**

**Database schema (lib/db.js):**
Create three new tables:
- `organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
- `org_members (org_id INTEGER NOT NULL REFERENCES organizations(id), user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL DEFAULT 'member', joined_at DATETIME DEFAULT CURRENT_TIMESTAMP, invited_by INTEGER REFERENCES users(id), PRIMARY KEY (org_id, user_id))`
- `org_invites (token TEXT PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', expires_at DATETIME NOT NULL, accepted_at DATETIME)`

Add `org_id INTEGER REFERENCES organizations(id)` to the following tables via `ALTER TABLE ADD COLUMN` (wrapped in try/catch per existing migration pattern): `documents`, `legal_cases`, `contract_obligations`, `tasks`, `legal_holds`, `policy_rules`, `qa_cards`, `audit_log`, `case_templates`, `app_settings`, `chunks`, `product_features`.

Add `user_id INTEGER REFERENCES users(id)` to `audit_log` via the same pattern.

**First-run migration (lib/db.js `initDb()`):**
After schema creation, check if `organizations` table is empty. If so:
1. Insert default org: `{ name: "Default Organization", slug: "default" }`
2. Update all existing data rows to `org_id = 1` (one UPDATE per affected table)
3. Insert all existing users into `org_members` with `role = 'owner'`

**Settings system (lib/settings.js):**
Replace the module-level `let currentSettings` singleton with a DB-backed store:
- `getSettings(orgId)` — reads from `app_settings WHERE org_id = ?`, falls back to defaults for missing keys
- `updateSettings(orgId, patch)` — upserts key-value pairs into `app_settings` with `org_id`
- `resetSettings(orgId)` — deletes all `app_settings` rows for the org
- Remove the in-memory variable entirely

Update all settings API routes (`/api/settings/route.ts`, `/api/settings/defaults/route.ts`, `/api/settings/reset/route.ts`) to:
- Require authenticated session (return 401 if no session)
- Pass `session.user.orgId` to all `getSettings` / `updateSettings` calls

**Auth org context (src/auth.ts):**
In the JWT `authorize` callback (after credentials are validated), look up the user's org from `org_members` (take the first row ordered by `joined_at ASC`). Add `orgId` and `orgRole` to the JWT token object.

Update the TypeScript type augmentation (`src/auth.ts:9-28`) to add `orgId: number` and `orgRole: string` to both `Session.user` and `JWT`.

Update `src/app/(app)/layout.tsx`: after session validation, also check that `session.user.orgId` exists. If the user has no org, redirect to `/no-org` (a simple page explaining the issue) rather than allowing app access.

**Registration (src/app/api/auth/register/route.ts):**
After creating the user, look up the default org (first org in the table) and insert a row into `org_members` with `role = 'member'`.

**Files:**
- `lib/db.js` — new tables, migrations, first-run org bootstrap
- `src/auth.ts` — JWT callback + TypeScript type augmentation
- `src/app/(app)/layout.tsx` — org membership guard
- `src/app/(app)/no-org/page.tsx` — new: simple error page for users with no org
- `src/app/api/auth/register/route.ts` — auto-enroll in default org
- `lib/settings.js` — replace singleton with DB-backed per-org store
- `src/app/api/settings/route.ts` — add auth guard + orgId context
- `src/app/api/settings/defaults/route.ts` — add org context
- `src/app/api/settings/reset/route.ts` — add org context

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (JWT callback patterns, session type augmentation)
- `documentation/technology/standards/database.md` (migration pattern: ALTER TABLE with try/catch)
- `documentation/technology/architecture/database-schema.md` (current schema reference)

**Success Criteria:**
- App starts on empty DB → `organizations` has one row ("Default Organization"), all existing users are in `org_members` with role `owner`
- App starts with existing data → all data rows have `org_id = 1`, all users enrolled in org 1
- Logging in returns a session where `session.user.orgId` and `session.user.orgRole` are defined
- A user account with no `org_members` row redirects to `/no-org` on app access
- Changing a setting via `PATCH /api/settings`, restarting the server, then `GET /api/settings` returns the changed value
- `GET /api/settings` without a valid session returns 401

**Dependencies:** None

---

### Task 2: Full Data Isolation — Query Layer and API Route Org Scoping

**Description:**

**DB query layer (lib/db.js):**
Update every data-returning query function to accept `orgId` as a parameter and add `WHERE org_id = ?` (or `AND org_id = ?`) to the query. Functions to update (non-exhaustive, executor must grep for all):
- Document functions: `getAllDocuments`, `getDocumentById`, `getDocumentByPath`, `getDocumentsByCategory`, `searchDocuments`, `getAllChunks`, `getChunksByDocument`, and all document-related child entity functions
- Contract functions: `getAllContracts`, `getContractById`, `getContractsByStatus`, `getContractObligations`, `getObligationById`, and all sub-functions
- Case functions: `getLegalCases`, `getLegalCaseById`, `getCaseDocuments`, `getCaseDeadlines`, `getCaseParties`, `getCaseTemplates`, `getCaseGeneratedDocs`
- Other data functions: `getTasks`, `getLegalHolds`, `getPolicyRules`, `getQaCards`, `getQaCardById`, `getAuditLog`, `getDashboardStats`
- All INSERT functions for the above entities must also accept and store `org_id`

Update `src/lib/db-imports.ts` to reflect the new `orgId` parameter signatures.

**API routes (all routes in src/app/api/):**
After the existing `auth()` call and session null-check in every route handler, extract org context:
```typescript
const { orgId, role: orgRole } = session.user;
```
Pass `orgId` to every DB query call in the handler. Apply to all routes across:
- `api/documents/` (all sub-routes including analyze, process, download, versions, obligations)
- `api/contracts/` (all sub-routes including chat, invoices, documents)
- `api/legal-hub/cases/` (all sub-routes including chat, documents, deadlines, parties, generated-docs, actions)
- `api/legal-hub/templates/`
- `api/obligations/`
- `api/tasks/`
- `api/legal-holds/`
- `api/policies/`
- `api/qa-cards/`
- `api/audit/`
- `api/dashboard/`
- `api/ask/`
- `api/analyze/`
- `api/desk/analyze/`, `api/desk/questionnaire/`
- `api/nda/analyze/`
- `api/maintenance/`
- `api/gdrive/` (scoped to org's GDrive settings)

For audit log write calls throughout the codebase: update all `insertAuditLog(...)` calls to include `user_id: session.user.id` and `org_id: session.user.orgId`.

**Files:**
- `lib/db.js` (all query and insert functions — ~100 updates)
- `src/lib/db-imports.ts` (type signatures)
- `src/app/api/documents/route.ts` + all files under `src/app/api/documents/`
- `src/app/api/contracts/route.ts` + all files under `src/app/api/contracts/`
- `src/app/api/legal-hub/` (all route files)
- `src/app/api/obligations/` (all route files)
- `src/app/api/tasks/route.ts`
- `src/app/api/legal-holds/route.ts`
- `src/app/api/policies/route.ts`
- `src/app/api/qa-cards/route.ts`
- `src/app/api/audit/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/ask/route.ts`
- `src/app/api/analyze/route.ts`
- `src/app/api/desk/analyze/route.ts`, `src/app/api/desk/questionnaire/route.ts`
- `src/app/api/nda/analyze/route.ts`
- `src/app/api/maintenance/route.ts`
- `src/app/api/gdrive/route.ts` + sub-routes

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (auth guard pattern — every route must call `auth()` and check session)
- `documentation/technology/standards/database.md` (parameterized queries, no string interpolation)
- `documentation/technology/standards/rest-api.md` (error response shape)
- `documentation/technology/architecture/api-endpoints.md` (route reference)

**Success Criteria:**
- All app pages load without errors — Documents, Contracts, Legal Hub, Ask Library, Dashboard
- Documents page shows only documents belonging to the session user's org
- Cases page shows only cases belonging to the session user's org
- Dashboard stats reflect only the org's data
- Ask Library / RAG search returns only results from the org's document chunks
- New audit log entries include `user_id` and `org_id` (verifiable via DB inspection)
- Executor must run a post-update grep: `grep -r "getAllDocuments\|getDocumentById\|getLegalCases" src/app/api/` and verify every call site passes `orgId`

**Dependencies:** Task 1

---

### Task 3: Org Management UI — Sidebar Context, Settings Page, Members View

> Can run in parallel with Task 2 after Task 1 completes.

**Description:**

**Sidebar org context (src/components/layout/app-sidebar.tsx):**
- Replace the static "ComplianceA" header text with the org name from `session.user` (add an `orgName` field to the session, populated in `src/auth.ts` alongside `orgId`)
- Update the sidebar footer: display `{user.name} · {orgName}` instead of just the user email
- Rename the "Users" nav item to "Members"

**Org API routes (new files):**
- `GET /api/org` — returns `{ id, name, slug, memberCount, createdAt }` for the session user's org
- `PATCH /api/org` — updates org name (owner/admin only); validates name is non-empty, max 80 chars
- `GET /api/org/members` — returns array of `{ userId, name, email, role, joinedAt }` for all org members
- `PATCH /api/org/members/[id]` — updates a member's role (owner only can promote to owner; admin can change member↔admin); cannot demote yourself if you are the only owner
- `DELETE /api/org/members/[id]` — removes a user from the org; cannot remove yourself; the removed user's active sessions are not immediately terminated but their next request will fail the org membership check in AppLayout

**Org settings page (src/app/(app)/settings/org/page.tsx):**
- Display org name (editable inline or via form), org slug (read-only), creation date, member count
- Save triggers `PATCH /api/org`; updates sidebar org name immediately (optimistic update or revalidation)
- Visible to all org members; edit controls visible only to owners/admins
- Add navigation link to this page from the Settings section in the sidebar

**Members page (src/app/(app)/org/members/page.tsx or update src/app/(app)/users/page.tsx):**
- Table: member name, email, role badge, joined date, actions column
- Actions (owner/admin only): role selector dropdown, remove button with confirmation dialog
- Empty state for orgs with one member
- Read-only view for non-admin members (no action column)
- Role change and remove call the PATCH/DELETE org member endpoints

**Files:**
- `src/components/layout/app-sidebar.tsx`
- `src/auth.ts` (add `orgName` to JWT + session)
- `src/app/api/org/route.ts` (new)
- `src/app/api/org/members/route.ts` (new)
- `src/app/api/org/members/[id]/route.ts` (new)
- `src/app/(app)/settings/org/page.tsx` (new)
- `src/app/(app)/org/members/page.tsx` (new) or `src/app/(app)/users/page.tsx` (update)

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (auth guard, role checks)
- `documentation/technology/standards/rest-api.md` (error shapes, status codes)
- `documentation/technology/standards/design-system.md` (component conventions, Shadcn patterns)

**Success Criteria:**
- Sidebar header shows the org name (not hardcoded text); updates immediately after an org name change
- `/settings/org` page loads and displays org name, slug, and member count
- Owner/admin can edit org name and save; change persists after page refresh
- `/org/members` page lists all users in the org with correct roles
- Owner/admin can change another user's role; change is reflected immediately in the members list
- Owner/admin can remove a member; removed user gets redirected to `/no-org` on their next page load
- Non-admin users see the members page in read-only mode (no edit/remove controls)
- Attempting to remove yourself returns a 400 error shown in the UI

**Dependencies:** Task 1 (parallel with Task 2)

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/overview.md` | Updated | Added multi-tenancy model section: org tables, row-level isolation, JWT org context, deployment modes |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missing org_id filter on a query — cross-org data leak | Medium | Critical | Post-task-2 grep audit: verify every call site passes orgId. Add to success criteria. |
| SQLite migration fails on production data | Low | High | sql.js ALTER TABLE wrapped in try/catch per existing pattern; first-run bootstrap is idempotent |
| JWT schema change invalidates all active sessions | High | Low | Expected and acceptable — all users must re-login after deployment. Note in release. |
| In-memory settings lost during migration | Medium | Low | Settings singleton used defaults; losing them means reverting to defaults, which is acceptable. |
| Task 2 scope too large for one executor pass | Medium | Medium | Executor should batch: complete lib/db.js first, then routes by domain group (documents → contracts → legal-hub → others). Executor may request task split at execution time. |
| Only owner in org cannot be removed — edge case | Low | Medium | Task 3 PATCH/DELETE routes must validate: if removing/demoting the last owner, return 400 with clear message. |
