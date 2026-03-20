# Plan 031: User Permission System

> Execute: /uc:plan-execution 031

## Objective

Introduce per-user, per-feature action-level permissions for the `member` org role. Org admins configure a default permission template (applied to new members automatically) and can override permissions for individual members. Permission levels: `none` (hidden), `view` (read-only), `edit` (create/modify), `full` (create/modify/delete). Owners and admins always have full access — permission checks only apply to `member` role users.

## Context

- [Architecture Overview](../../technology/architecture/overview.md)
- [Database Schema](../../technology/architecture/database-schema.md) — `member_permissions` and `org_permission_defaults` tables
- [Auth Standard](../../technology/standards/authentication-authorization.md) — `permissions` field in JWT type augmentation
- [REST API Standard](../../technology/standards/rest-api.md) — auth guard pattern, saveDb before logAction
- [Plan 027 — Org Foundation](../027-org-foundation/) — org roles, JWT org context, 78 API routes with orgId
- [Plan 030 — Global Admin](../030-global-admin/) — `isSuperAdmin` bypass, `requireSuperAdmin` helper pattern

## Tech Stack

- **sql.js** — ALTER TABLE migrations + new permission tables
- **NextAuth v5** — JWT callback extension (`permissions` field re-hydrated per request)
- **Next.js App Router** — new permission management API routes
- **React / Shadcn UI** — permission management UI on members page + settings

## Permission Model

**Resources:** `documents`, `contracts`, `legal_hub`, `policies`, `qa_cards`

**Action levels (hierarchical):**

| Level | Value | Allowed operations |
|-------|-------|-------------------|
| `none` | 0 | No access — section hidden in UI |
| `view` | 1 | GET (list + detail) |
| `edit` | 2 | GET + POST (create) + PATCH (update) |
| `full` | 3 | GET + POST + PATCH + DELETE |

**Route → permission mapping:**

| HTTP Method | Required level |
|-------------|---------------|
| GET (list/detail) | `view` |
| POST (create) | `edit` |
| PATCH (update) | `edit` |
| DELETE | `full` |

**Bypass rules:**
- `orgRole === 'owner'` OR `orgRole === 'admin'` → full access, no permission check
- `isSuperAdmin === true` → full access across all orgs, no permission check
- `orgRole === 'member'` → enforce from `session.user.permissions`

## Scope

### In Scope
- `member_permissions (org_id, user_id, resource, action)` table + migrations
- `org_permission_defaults (org_id, resource, action)` table + migrations
- Seed org defaults (all `full`) when org is created (`createOrganization` in lib/db.js)
- Seed user permissions from org defaults when user joins org (`addOrgMember` in lib/db.js)
- 9 new DB functions: `getMemberPermissions`, `setMemberPermission`, `getOrgPermissionDefaults`, `setOrgPermissionDefault`, `seedMemberPermissionsFromDefaults`, `getUserPermissionForResource`, `resetMemberPermissions`, `getOrgPermissionsForUI`, `getMemberPermissionsForUI`
- `src/lib/permissions.ts` — shared helper: `RESOURCES`, `PERMISSION_LEVELS`, `hasPermission(level, required)`, `RESOURCE_LABELS`
- Permissions loaded into JWT on every request (DB re-hydrated in JWT callback for `member` role; `null` = full access for owner/admin)
- Permission check added to all data API routes for `member` role users:
  - `api/documents/` (all sub-routes: list, upload, download, analyze, process, versions, etc.)
  - `api/contracts/` (all sub-routes)
  - `api/legal-hub/` (all sub-routes)
  - `api/policies/` (all sub-routes)
  - `api/qa-cards/` (all sub-routes)
  - `api/ask/`, `api/analyze/`, `api/desk/`, `api/nda/` → `documents` resource
- `GET /api/org/permissions` — org defaults (owner/admin)
- `PUT /api/org/permissions` — set org defaults (owner/admin)
- `GET /api/org/members/[id]/permissions` — member's permissions (owner/admin)
- `PUT /api/org/members/[id]/permissions` — set member permissions (owner/admin)
- Permission management UI: dropdowns per resource per member on `/org/members` page
- Org defaults UI: permission dropdowns on `/settings/org` page
- Sidebar: hide feature nav groups when `permissions[resource] === 'none'`
- Page action buttons: hide upload/create/delete buttons based on permission level

### Out of Scope
- Per-action granularity within a resource (e.g., can view contracts but not download attachments)
- Permission inheritance / groups
- Time-limited permissions
- Audit log of permission changes
- API rate limiting based on permission level

## Success Criteria

- [ ] New org created → `org_permission_defaults` seeded with `full` for all 5 resources
- [ ] New member joins org → `member_permissions` seeded from org defaults
- [ ] `session.user.permissions` is populated for `member` role users; `null` for owner/admin
- [ ] `member` user with `none` permission on `contracts` → `GET /api/contracts` returns 403
- [ ] `member` user with `view` permission on `documents` → `GET /api/documents` returns 200; `DELETE /api/documents/[id]` returns 403
- [ ] `member` user with `edit` permission on `legal_hub` → `POST /api/legal-hub/cases` returns 201; `DELETE /api/legal-hub/cases/[id]` returns 403
- [ ] Owner/admin always gets 200 regardless of what's in `member_permissions` for their account
- [ ] `PUT /api/org/members/[id]/permissions` updates member permissions; takes effect on next request
- [ ] `PUT /api/org/permissions` updates org defaults; new members joining after get the new defaults
- [ ] Sidebar nav group hidden when `session.user.permissions?.contracts === 'none'`
- [ ] Full regression: all existing tests pass (0 regressions)

---

## Tasks

### Task 1: Permission DB Layer

**Description:**

**New tables (`lib/db.js` `initDb()`):**
```javascript
db.run(`CREATE TABLE IF NOT EXISTS member_permissions (
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  resource TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'full',
  PRIMARY KEY (org_id, user_id, resource)
)`);

db.run(`CREATE TABLE IF NOT EXISTS org_permission_defaults (
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  resource TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'full',
  PRIMARY KEY (org_id, resource)
)`);
```

**Seed org defaults in `createOrganization(name, slug)` (already in lib/db.js from Plan 030):**
After INSERT INTO organizations, call a new `seedOrgPermissionDefaults(orgId)` function.

**Seed user permissions in `addOrgMember(orgId, userId, role, invitedBy)` (lib/db.js from Plan 027):**
After INSERT INTO org_members, if role is `'member'`, call `seedMemberPermissionsFromDefaults(orgId, userId)`.

**New DB functions (`lib/db.js` exports):**

```javascript
// Resources enum (also used in src/lib/permissions.ts)
const RESOURCES = ['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards'];

// Seed org defaults with 'full' for all resources (called on org creation)
function seedOrgPermissionDefaults(orgId) {
  for (const resource of RESOURCES) {
    run(`INSERT OR IGNORE INTO org_permission_defaults (org_id, resource, action) VALUES (?, ?, 'full')`, [orgId, resource]);
  }
}

// Seed member permissions from org defaults (called on user enrollment)
function seedMemberPermissionsFromDefaults(orgId, userId) {
  const defaults = getOrgPermissionDefaults(orgId);
  for (const { resource, action } of defaults) {
    run(`INSERT OR IGNORE INTO member_permissions (org_id, user_id, resource, action) VALUES (?, ?, ?, ?)`, [orgId, userId, resource, action]);
  }
}

// Get all org defaults
function getOrgPermissionDefaults(orgId) → [{ resource, action }]

// Set a single org default
function setOrgPermissionDefault(orgId, resource, action)

// Get all permissions for a specific user in an org
function getMemberPermissions(orgId, userId) → [{ resource, action }]

// Get single permission for a user
function getUserPermissionForResource(orgId, userId, resource) → 'none' | 'view' | 'edit' | 'full'

// Set a single user permission override
function setMemberPermission(orgId, userId, resource, action)

// Reset user permissions back to org defaults
function resetMemberPermissions(orgId, userId)
```

Update `lib/db.d.ts` and `src/lib/db-imports.ts` with all new function signatures.

**Files:**
- `lib/db.js` — 2 new tables, 8 new functions, seed hooks in `createOrganization` + `addOrgMember`
- `lib/db.d.ts` — type declarations
- `src/lib/db-imports.ts` — re-exports

**Patterns:**
- `documentation/technology/standards/database.md` (CREATE TABLE IF NOT EXISTS, three-step bridge)
- `documentation/technology/standards/rest-api.md` (saveDb before logAction)

**Success Criteria:**
- `seedOrgPermissionDefaults(1)` creates 5 rows (one per resource) with action='full' in org_permission_defaults
- `seedMemberPermissionsFromDefaults(1, 2)` creates 5 rows in member_permissions mirroring org defaults
- `getUserPermissionForResource(orgId, userId, 'documents')` returns 'full' after seeding
- `setMemberPermission(orgId, userId, 'contracts', 'view')` — subsequent `getUserPermissionForResource` returns 'view'
- `resetMemberPermissions(orgId, userId)` restores user back to org defaults
- `getOrgPermissionDefaults` + `getMemberPermissions` return arrays with all 5 resources
- `createOrganization` now seeds org defaults automatically
- `addOrgMember` with role='member' seeds user permissions from org defaults

**Dependencies:** None

---

### Task 2: JWT Integration and API Enforcement

**Description:**

**Shared permissions helper (`src/lib/permissions.ts` — new file):**
```typescript
export const RESOURCES = ['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards'] as const;
export type Resource = typeof RESOURCES[number];
export type PermissionLevel = 'none' | 'view' | 'edit' | 'full';

export const PERMISSION_LEVELS: Record<PermissionLevel, number> = {
  none: 0, view: 1, edit: 2, full: 3,
};

export function hasPermission(
  userLevel: PermissionLevel | undefined | null,
  required: PermissionLevel
): boolean {
  if (userLevel === undefined || userLevel === null) return true; // null = full access (owner/admin)
  return PERMISSION_LEVELS[userLevel] >= PERMISSION_LEVELS[required];
}

export const RESOURCE_LABELS: Record<Resource, string> = {
  documents: 'Documents',
  contracts: 'Contracts',
  legal_hub: 'Legal Hub',
  policies: 'Policies',
  qa_cards: 'QA Cards',
};
```

**JWT callback update (`src/auth.ts`):**

Add `permissions?: Record<string, PermissionLevel> | null` to both `Session.user` and `JWT` type augmentation blocks.

In the JWT callback's subsequent-requests branch (where org context is re-hydrated), after getting org membership:
```typescript
// Load permissions for member role (owner/admin get null = full access)
if (membership && membership.role === 'member') {
  const perms = getMemberPermissions(Number(token.id), Number(token.orgId));
  token.permissions = Object.fromEntries(perms.map((p: any) => [p.resource, p.action]));
} else {
  token.permissions = null; // full access for owner/admin
}
```
In session callback: `session.user.permissions = token.permissions`

**Permission enforcement in API routes:**

Add to every data-returning route handler, immediately after the orgId extraction, before `ensureDb()`:

```typescript
import { hasPermission } from "@/lib/permissions";
// ... existing auth guard ...
const orgId = Number(session.user.orgId);

// Permission check (only for member role; owner/admin/superAdmin bypass)
if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
  const perm = session.user.permissions?.['documents'] ?? 'full';
  if (!hasPermission(perm, 'view')) {  // adjust 'view' to 'edit' or 'full' per method
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**Routes to update (batched by resource):**

`documents` resource (view for GET, edit for POST/PATCH, full for DELETE):
- `src/app/api/documents/route.ts` — GET → view
- `src/app/api/documents/upload/route.ts` — POST → edit
- `src/app/api/documents/[id]/route.ts` — GET→view, PATCH→edit, DELETE→full
- `src/app/api/documents/[id]/download/route.ts` — GET → view
- `src/app/api/documents/[id]/process/route.ts` — POST → edit
- `src/app/api/documents/[id]/analyze-contract/route.ts` — POST → view (analysis is read-like)
- `src/app/api/documents/[id]/category/route.ts` — PATCH → edit
- `src/app/api/documents/[id]/metadata/route.ts` — PATCH → edit
- All other `documents/[id]/` sub-routes — apply appropriate level
- `src/app/api/ask/route.ts` — POST → documents:view
- `src/app/api/analyze/route.ts` — POST → documents:view
- `src/app/api/desk/analyze/route.ts` — POST → documents:view
- `src/app/api/desk/questionnaire/route.ts` — GET→view, POST→edit
- `src/app/api/nda/analyze/route.ts` — POST → documents:view
- `src/app/api/gdrive/route.ts` + sub-routes → documents:edit (GDrive sync adds documents)
- `src/app/api/obligations/route.ts` + sub-routes — part of documents context

`contracts` resource:
- `src/app/api/contracts/route.ts` — GET→view
- `src/app/api/contracts/[id]/route.ts` — GET→view, PATCH→edit, DELETE→full
- All `contracts/[id]/` sub-routes — appropriate level

`legal_hub` resource:
- `src/app/api/legal-hub/cases/route.ts` — GET→view, POST→edit
- All `legal-hub/cases/[id]/` sub-routes — appropriate level
- `src/app/api/legal-hub/templates/route.ts` + sub-routes

`policies` resource:
- `src/app/api/policies/route.ts` — GET→view, POST→edit
- `src/app/api/policies/[id]/route.ts` — GET→view, PATCH→edit, DELETE→full
- `src/app/api/legal-holds/route.ts` + sub-routes (legal holds are policy-adjacent)
- `src/app/api/tasks/route.ts` + sub-routes (tasks are obligation/policy-adjacent)

`qa_cards` resource:
- `src/app/api/qa-cards/route.ts` — GET→view, POST→edit
- `src/app/api/qa-cards/[id]/route.ts` — GET→view, PATCH→edit, DELETE→full

**Files:**
- `src/lib/permissions.ts` — new helper
- `src/auth.ts` — permissions in JWT type augmentation + callback
- All ~80 API route files — permission check added

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md`
- `documentation/technology/standards/rest-api.md`
- `documentation/technology/standards/module-separation.md`

**Success Criteria:**
- `member` with `permissions.documents = 'none'` → `GET /api/documents` returns 403
- `member` with `permissions.documents = 'view'` → `GET /api/documents` returns 200; `DELETE /api/documents/[id]` returns 403
- `member` with `permissions.documents = 'edit'` → `POST /api/documents/upload` returns 200; DELETE returns 403
- `member` with `permissions.documents = 'full'` → all document operations succeed
- Owner and admin bypass: all operations succeed regardless of member_permissions table
- `isSuperAdmin` bypass: all operations succeed
- `session.user.permissions` populated for member role; null for owner/admin
- npm test: 0 regressions

**Dependencies:** Task 1

---

### Task 3: Permission Management API

**Description:**

Create CRUD endpoints for managing org defaults and per-user permission overrides.

**`GET /api/org/permissions`** — get org defaults (owner/admin only):
- Return `{ defaults: { documents: 'full', contracts: 'full', ... } }` from `getOrgPermissionDefaults(orgId)`

**`PUT /api/org/permissions`** — set org defaults (owner/admin only):
- Body: `{ defaults: { documents: 'view', contracts: 'full', ... } }` — partial updates allowed
- Validate each resource is valid, each action is one of `none|view|edit|full`
- Call `setOrgPermissionDefault(orgId, resource, action)` for each key
- saveDb() BEFORE logAction()
- Return `{ defaults: {...} }`

**`GET /api/org/members/[id]/permissions`** — get member's permissions (owner/admin only):
- Return `{ permissions: { documents: 'view', ... } }` from `getMemberPermissions(orgId, userId)`

**`PUT /api/org/members/[id]/permissions`** — set member permissions (owner/admin only):
- Body: `{ permissions: { documents: 'view', ... } }` — partial updates allowed
- Validate resource names and action values
- For each key: `setMemberPermission(orgId, userId, resource, action)`
- saveDb() BEFORE logAction()
- Return `{ permissions: {...} }`

**`POST /api/org/members/[id]/permissions/reset`** — reset to org defaults (owner/admin only):
- `resetMemberPermissions(orgId, userId)` — deletes existing rows, re-seeds from org defaults
- saveDb() BEFORE logAction()
- Return `{ permissions: {...} }` (fresh from defaults)

**Note on seeding:** `resetMemberPermissions` should call `seedMemberPermissionsFromDefaults(orgId, userId)` after clearing — same as initial enrollment. The DB function handles this internally.

**Files:**
- `src/app/api/org/permissions/route.ts` — GET + PUT org defaults
- `src/app/api/org/members/[id]/permissions/route.ts` — GET + PUT member permissions
- `src/app/api/org/members/[id]/permissions/reset/route.ts` — POST reset

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (auth guard, orgRole check)
- `documentation/technology/standards/rest-api.md` (saveDb before logAction, 200/201 responses)
- `documentation/technology/standards/module-separation.md` (bridge imports)

**Success Criteria:**
- `GET /api/org/permissions` returns all 5 resources with their default actions
- `PUT /api/org/permissions` with `{ defaults: { contracts: 'view' } }` → subsequent GET shows contracts='view'
- `GET /api/org/members/[id]/permissions` returns all 5 resources for that member
- `PUT /api/org/members/[id]/permissions` overrides specific resources
- `POST /api/org/members/[id]/permissions/reset` restores member to current org defaults
- All routes return 403 for `member` role (owner/admin only)

**Dependencies:** Task 1 (parallel with Task 2)

---

### Task 4: Permission Management UI

**Description:**

Add permission management controls to the existing `/org/members` page and `/settings/org` page.

**Update `/org/members` page (`src/app/(app)/org/members/page.tsx`):**

For each member in the table, add a "Permissions" column (or expand row / modal):
- Show current permission level per resource as colored badges
- Owners/admins: click badge → inline Select dropdown (none/view/edit/full)
- Call `PUT /api/org/members/[id]/permissions` on change
- "Reset to defaults" button → `POST /api/org/members/[id]/permissions/reset`
- Can be a compact view: one badge per resource, click to change

Recommended UX: a "Permissions" button per member row that opens a Popover or Dialog showing the 5 resources with Select dropdowns.

**Update `/settings/org` page (`src/app/(app)/settings/org/page.tsx`):**

Add "Default Member Permissions" section:
- Table/list: 5 rows (one per resource), each with a Select dropdown (none/view/edit/full)
- Label + description for each resource
- Call `PUT /api/org/permissions` on change (auto-save or Save button)
- Fetch from `GET /api/org/permissions` on mount
- Visible to owners and admins only

**Files:**
- `src/app/(app)/org/members/page.tsx` — add permissions column + management
- `src/app/(app)/settings/org/page.tsx` — add org default permissions section
- `src/components/org/member-permissions-dialog.tsx` — new dialog/popover component (if complex enough to extract)

**Patterns:**
- `documentation/technology/standards/design-system.md` (Select, Popover, Dialog, Badge, no inline colors)
- `documentation/technology/standards/rest-api.md` (error handling, toast feedback)

**Success Criteria:**
- Org admin can view current permission level for each member per resource
- Changing a permission level via dropdown calls the API and updates immediately
- "Reset to defaults" restores member to org defaults
- Org default permissions section in settings shows current defaults with editable dropdowns
- Changing org defaults via UI persists across page refresh
- Non-admin members see no permission controls (canManage check)

**Dependencies:** Task 3

---

### Task 5: UI Feature Hiding

**Description:**

Conditionally hide navigation items and action buttons based on `session.user.permissions`.

**Sidebar (`src/components/layout/app-sidebar.tsx`):**

The sidebar uses `useSession()`. Add permission-based visibility:

```typescript
const permissions = sessionData?.user?.permissions; // null = full access (owner/admin)

// Helper: check if user has at least 'view' for a resource
function canView(resource: string) {
  if (!permissions) return true; // null = full access
  return (PERMISSION_LEVELS[permissions[resource] ?? 'full'] ?? 3) >= 1;
}

// Hide entire nav group if no resources in it are viewable:
// Documents Hub: hide if !canView('documents') (also hides Ask, Analyze which are document-based)
// Contract Hub: hide if !canView('contracts')
// Legal Hub: hide if !canView('legal_hub')
// Policies: hide if !canView('policies')
// QA Cards: hide if !canView('qa_cards')
```

Import `PERMISSION_LEVELS` from `@/lib/permissions`.

**Page action buttons:**

Update key pages to hide action buttons based on permissions:

- `src/app/(app)/documents/page.tsx` (or wherever documents page is) — hide "Upload Document" button if `permissions.documents` is `view` or `none`
- `src/app/(app)/contracts/page.tsx` — hide "Create Contract" if contracts < edit
- `src/app/(app)/legal-hub/cases/page.tsx` — hide "Create Case" if legal_hub < edit
- Delete buttons throughout: hide if resource permission < full

**Note:** These are soft UI hints — the API enforcement in Task 2 is the hard gate. UI hiding improves UX by not showing affordances the user can't use.

**Files:**
- `src/components/layout/app-sidebar.tsx` — conditional nav groups
- Key page components — hide create/upload/delete buttons

**Patterns:**
- `documentation/technology/standards/design-system.md`
- `src/lib/permissions.ts` — import PERMISSION_LEVELS

**Success Criteria:**
- Member with `permissions.contracts = 'none'` → Contract Hub nav item hidden in sidebar
- Member with `permissions.documents = 'view'` → Documents nav visible but Upload button hidden
- Member with `permissions.legal_hub = 'full'` → all Legal Hub UI visible and functional
- Owner/admin: all nav items always visible (permissions = null bypass)
- Super admin: all nav items always visible

**Dependencies:** Task 2 (permissions in JWT needed for session.user.permissions in sidebar)

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Updated | Added member_permissions and org_permission_defaults table definitions |
| `documentation/technology/standards/authentication-authorization.md` | Updated | Added `permissions` field to JWT type augmentation |
| `documentation/product/requirements/features.md` | Updated | Added User Permission System section under Organization Management |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Task 2 scope (80 routes) overwhelms executor | Medium | High | Executor batches by resource group; clear template for each check; most routes are identical 3-line additions |
| Existing tests fail after permission enforcement | Medium | Medium | All existing tests use owner/admin sessions → bypass; member-session tests would need permissions seeded; tester must verify regression count |
| Member with old membership (pre-031) has no permissions rows | High | High | `getUserPermissionForResource` returns `'full'` as default fallback when no row exists — backward compatible |
| Permissions stale in JWT between requests | Low | Low | JWT callback re-hydrates `permissions` from DB on every request — same approach as orgRole |
| Task 5 UI hiding misses a page | Medium | Low | Soft gate only — API enforcement (Task 2) is the hard gate; missed UI hiding is a UX issue, not a security issue |
