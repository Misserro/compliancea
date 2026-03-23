# Plan 038 — Law Firm Dashboard & Case Assignment

## Overview

Introduces two interconnected capabilities to the Legal Hub:

1. **Case Assignment** — every case is owned by exactly one user. On creation, cases auto-assign to the creator (for members) or the admin's chosen assignee. Admins can reassign from the case detail page. Members see only their assigned cases; admins and owners see all.

2. **"My law firm" admin tab** — a new tab in the Legal Hub visible to admins and owners, showing case statistics (counts by status, finalized in last 30 days) and an org member roster with lawyer profile data (first name, last name, phone, specialization, bar registration number) plus each member's current case count.

Plan 022 (`legal-hub`) explicitly deferred per-case access control as "multi-user roles plan (future)". This is that plan.

## Scope

### In scope
- `legal_cases`: new `assigned_to INTEGER REFERENCES users(id)` column (NOT NULL after migration)
- `org_members`: new profile columns — `first_name TEXT`, `last_name TEXT`, `phone TEXT`, `specialization TEXT`, `bar_registration_number TEXT` (all nullable)
- One-time migration: assign all existing cases to the org's owner (fallback: first admin)
- `getLegalCases`: filter by `assigned_to = user_id` when `orgRole === 'member'`; JOIN `users` to return `assigned_to_name`
- `POST /api/legal-hub/cases`: auto-assign to creator for members; accept `assigned_to` param for admins
- `PATCH /api/legal-hub/cases/[id]`: allow `assigned_to` updates for admins
- `GET /api/legal-hub/firm-stats`: case counts by status, cases finalized in last 30 days, member roster with profile + case count
- `PATCH /api/org/members/profile`: update own profile (members); update any member's profile (admins)
- `NewCaseDialog`: admin sees a member picker dropdown for initial assignment
- Case detail overview tab: "Assigned to" field; admin-only reassignment dropdown
- "My law firm" tab in Legal Hub main page (admin/owner only): stats panel + member roster with editable profiles

### Out of scope
- Multi-user assignment (a case can only have one assignee)
- Case assignment history / audit trail (status_history_json is not extended for this)
- Reassignment via the "My law firm" tab (reassignment is case-level only)
- Bulk reassignment UI (admin manually reassigns one case at a time)
- Splitting `users.name` into first/last (that is a global auth concern; lawyer profile fields live on `org_members`)
- Notifications on assignment change
- Case visibility for the AI chat or document retrieval endpoints (those are scoped by case access; members can only access cases they can see in the list)

## Architecture Notes

### Data model decisions

**Lawyer profiles on `org_members`, not `users`**

`users` is org-agnostic (used for auth, JWT, session display). Profile fields are org-specific — a user could be a member of multiple orgs with different roles. Adding `first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number` to `org_members` keeps them scoped to the org context without touching the auth layer.

**`assigned_to` on `legal_cases`**

```sql
-- Migration: add column (nullable first, then backfill)
ALTER TABLE legal_cases ADD COLUMN assigned_to INTEGER REFERENCES users(id);

-- Backfill: assign to org owner (fallback: first admin)
UPDATE legal_cases
SET assigned_to = (
  SELECT user_id FROM org_members
  WHERE org_id = legal_cases.org_id
    AND role IN ('owner', 'admin')
  ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, joined_at ASC
  LIMIT 1
)
WHERE assigned_to IS NULL;
```

**`org_members` profile columns:**
```sql
ALTER TABLE org_members ADD COLUMN first_name TEXT;
ALTER TABLE org_members ADD COLUMN last_name TEXT;
ALTER TABLE org_members ADD COLUMN phone TEXT;
ALTER TABLE org_members ADD COLUMN specialization TEXT;
ALTER TABLE org_members ADD COLUMN bar_registration_number TEXT;
```

### Access control rule

| Role | Case visibility |
|------|----------------|
| `member` | Only cases where `assigned_to = session.user.id` |
| `admin` | All cases in org |
| `owner` | All cases in org |
| `isSuperAdmin` | All cases in org (already bypasses everything) |

Applied in `getLegalCases(orgId, userId, orgRole)` — new `userId` and `orgRole` parameters added to the db.js function.

### API changes

**`GET /api/legal-hub/cases`** — passes `session.user.id` and `session.user.orgRole` to `getLegalCases`; response includes `assigned_to: number | null` and `assigned_to_name: string | null` per case.

**`POST /api/legal-hub/cases`** — body gains optional `assigned_to: number` (admin only; members get auto-assigned to themselves; if admin omits it, default to themselves).

**`PATCH /api/legal-hub/cases/[id]`** — `assigned_to` added to update allowlist, but only writable by admin/owner (API validates `orgRole`).

**`GET /api/legal-hub/firm-stats`** (new) — admin/owner only; returns:
```ts
{
  statsByStatus: { status: string; count: number }[];
  finalizedLast30Days: number;
  members: {
    user_id: number;
    name: string;           // users.name (display name)
    email: string;
    role: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    specialization: string | null;
    bar_registration_number: string | null;
    assigned_case_count: number;
  }[];
}
```

**`PATCH /api/org/members/profile`** (new) — updates `first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number` on `org_members`. Members can only update their own profile; admins can update any member's profile (requires `target_user_id` in body for admin targeting).

### `LegalCase` TypeScript interface update

```ts
// src/lib/types.ts
export interface LegalCase {
  // ... existing fields ...
  assigned_to: number | null;       // NEW
  assigned_to_name: string | null;  // NEW (joined from users)
}
```

### UI structure

**Legal Hub main page tab additions:**

```
LegalHubDashboard
  ├── [Cases tab — existing, renamed from default view]
  └── [My law firm tab — admin/owner only, new]
        ├── Stats panel (case counts by status + finalized 30d)
        └── Member roster (table with profile fields + case count + edit button)
```

The `LegalHubDashboard` currently has no tab shell — a `Tabs` component wrapping the existing case list and the new tab needs to be added.

**Case detail "Assigned to" field** — added to the Overview tab's metadata section, after the existing fields. Admin sees a `Select` dropdown to reassign; members see read-only display.

**`NewCaseDialog` admin assignee picker** — when `orgRole !== 'member'`, the dialog renders a `Select` populated from `GET /api/org/members`, defaulting to the current user.

## Tasks

<!-- TASK_LIST_START -->
- [ ] **Task 1 — DB schema migration: assigned_to + lawyer profile columns**
  Add `assigned_to INTEGER REFERENCES users(id)` to `legal_cases` and five profile columns (`first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number`) to `org_members` via `ALTER TABLE` statements in `lib/db.js`. Run the backfill migration to assign all existing cases to the org's owner (fallback to first admin by joined_at). Update `createLegalCase`, `getLegalCases`, and `updateLegalCase` in `lib/db.js` to handle the new `assigned_to` column. Update the `LegalCase` TypeScript interface in `src/lib/types.ts`.

  **Files:**
  - `lib/db.js` (modify — ALTER TABLE statements, migration backfill, function updates)
  - `src/lib/types.ts` (modify — add `assigned_to`, `assigned_to_name` to `LegalCase`)

  **Depends on:** none

  **Success criteria:** After startup, `legal_cases` has an `assigned_to` column. All existing cases have a non-null `assigned_to` pointing to a valid user. `org_members` has all five profile columns. `createLegalCase` accepts and stores `assigned_to`. `getLegalCases` accepts `userId` + `orgRole` params and filters correctly for members. `updateLegalCase` allows `assigned_to` in its update allowlist.

- [ ] **Task 2 — Case assignment API: create, list, reassign**
  Update the three case API routes to wire the new assignment logic. `GET /api/legal-hub/cases`: pass `session.user.id` and `session.user.orgRole` to `getLegalCases`; response includes `assigned_to` and `assigned_to_name`. `POST /api/legal-hub/cases`: auto-assign to session user for members; accept optional `assigned_to` body param for admins (validate it belongs to the same org). `PATCH /api/legal-hub/cases/[id]`: add `assigned_to` to the allowed update fields, validate admin-only write (return 403 for members attempting to change assignment).

  **Files:**
  - `src/app/api/legal-hub/cases/route.ts` (modify — GET filter + POST assigned_to)
  - `src/app/api/legal-hub/cases/[id]/route.ts` (modify — PATCH assigned_to allowlist + admin guard)

  **Depends on:** Task 1

  **Success criteria:** A member calling `GET /api/legal-hub/cases` receives only their assigned cases. An admin calling the same endpoint receives all org cases. `POST /api/legal-hub/cases` as a member auto-assigns the case to the caller. `POST /api/legal-hub/cases` as an admin with `assigned_to: userId` assigns to that user. `PATCH /api/legal-hub/cases/[id]` with `assigned_to` as admin succeeds. `PATCH` with `assigned_to` as member returns 403.

- [ ] **Task 3 — Firm stats API + lawyer profile update API**
  Create two new API endpoints. `GET /api/legal-hub/firm-stats`: admin/owner only (403 for members); queries case counts grouped by status, count of cases updated to 'closed'/'archived' status in last 30 days, and org member roster with profile fields joined from `org_members` + case count from a `COUNT` join on `legal_cases.assigned_to`. `PATCH /api/org/members/profile`: members can update their own profile fields; admins can update any member's profile by providing `target_user_id` in the body. Validates all profile fields are strings or null.

  **Files:**
  - `src/app/api/legal-hub/firm-stats/route.ts` (new)
  - `src/app/api/org/members/profile/route.ts` (new)
  - `lib/db.js` (modify — add `getFirmStats(orgId)` and `updateMemberProfile(orgId, userId, fields)` helpers)

  **Depends on:** Task 1

  **Success criteria:** `GET /api/legal-hub/firm-stats` returns `statsByStatus` array with correct counts, `finalizedLast30Days` count, and `members` array with profile fields and `assigned_case_count`. Returns 403 for members. `PATCH /api/org/members/profile` updates profile fields for own user (member) and for any org user (admin). Returns 403 when member attempts to update another user's profile.

- [ ] **Task 4 — Case assignment UI: case creation dialog + case detail reassignment**
  Update `NewCaseDialog` to fetch org members and render an assignee `Select` when the session user is admin/owner (defaulting to self). Update the case detail Overview tab to display the assigned user name and, for admins/owners, a reassignment `Select` that calls `PATCH /api/legal-hub/cases/[id]` on change. Update `CaseCard` to display the assigned user name below the case title.

  **Files:**
  - `src/components/legal-hub/new-case-dialog.tsx` (modify — admin member picker)
  - `src/components/legal-hub/case-metadata-form.tsx` or `case-header.tsx` (modify — assigned_to display + admin reassignment dropdown)
  - `src/components/legal-hub/case-card.tsx` (modify — show assigned_to_name)

  **Depends on:** Task 2

  **Success criteria:** Admin creating a case sees a member picker defaulting to themselves; selecting another user and submitting assigns the case correctly. Member creating a case has no picker (auto-assigned). Case detail Overview tab shows "Przypisany do: [name]". Admin sees a dropdown to change assignment; on change the case is re-fetched showing the new assignee. Member sees read-only assignee name. Case card shows assignee name. Case list for members shows only their cases.

- [ ] **Task 5 — "My law firm" admin tab UI**
  Add a tab shell to `LegalHubDashboard` using the existing `Tabs`/`TabsList`/`TabsContent` components from shadcn/ui. First tab: existing case list (renamed "Sprawy"). Second tab: "Moja kancelaria" (visible to admin/owner only, hidden for members). Tab content: stats panel showing case counts per status + finalized-in-30-days count, and a member roster table with columns: First name, Last name, Email, Phone, Specialization, Bar number, Cases. Each row has an edit button opening a modal/dialog to update the member's lawyer profile (calls `PATCH /api/org/members/profile`).

  **Files:**
  - `src/components/legal-hub/legal-hub-dashboard.tsx` (modify — add Tabs shell, fetch firm-stats, render My law firm tab)
  - `src/components/legal-hub/firm-stats-panel.tsx` (new — case stats display component)
  - `src/components/legal-hub/member-roster.tsx` (new — member table with edit modal)

  **Depends on:** Task 3

  **Success criteria:** Admin navigating to Legal Hub sees two tabs: "Sprawy" and "Moja kancelaria". Clicking "Moja kancelaria" shows case stats (counts per status, finalized last 30 days) and a member table with all profile columns and case count. Edit button opens a form with all five profile fields pre-filled; saving calls the profile API and refreshes the table. The "Moja kancelaria" tab is not visible to members (tab does not render in the tab list).
<!-- TASK_LIST_END -->

## Documentation Gaps

| Gap | Priority | Location |
|-----|----------|----------|
| `legal_cases` schema in `documentation/technology/architecture/database-schema.md` needs `assigned_to` column added | Low | `documentation/technology/architecture/database-schema.md` |
| `org_members` schema needs five new profile columns documented | Low | `documentation/technology/architecture/database-schema.md` |
| `documentation/product/requirements/features.md` Plan 022 section notes per-case access control as out of scope — update to reference Plan 038 | Low | `documentation/product/requirements/features.md` |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Members lose access to cases after rollout (migration incomplete) | Low | High | Migration backfill runs in db.js initialization before any route handles requests; verify with startup log |
| `getLegalCases` filter regression — admins accidentally filtered | Medium | High | Task 2 success criteria explicitly tests both admin and member GET responses |
| Reassignment by non-admin bypasses org isolation | Low | High | `PATCH /api/legal-hub/cases/[id]` validates `orgRole` server-side before applying `assigned_to` |
| `org_members` profile PATCH targets wrong org's user | Low | Medium | Profile update validates `user_id` exists in `org_members` for `session.user.orgId` before updating |
| Case chat / document retrieval endpoints not aware of assignment filter | Low | Low | Those endpoints operate on `case_id` — if the user cannot see the case in the list, they cannot navigate to the chat; no separate filter needed at the chat level |
