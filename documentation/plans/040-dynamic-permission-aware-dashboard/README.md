# Plan 040 — Dynamic Permission-Aware Dashboard

## Goal

Update the main dashboard to:
1. Show only the sections a user has permission to access (documents, contracts, legal hub)
2. Include a Legal Hub section with open cases KPI (with status breakdown), upcoming court deadlines panel, and recent cases panel

Users with no access to any resource see only the page title.

---

## Background

The current dashboard (`/dashboard`) always renders all three KPI cards (Documents, Overdue, Contracts) and both detail panels (Upcoming Obligations, Contracts Expiring) regardless of the user's permissions. The API also queries all resources unconditionally.

The permission system (`lib/permissions.ts`) is already complete. Permissions live in the session JWT (`session.user.permissions`) — null for owner/admin (full access), explicit map for `member` role. The sidebar already uses this pattern for nav gating.

Legal Hub data is entirely absent from the dashboard.

---

## Architecture

```
session.user.permissions  ──►  /api/dashboard  ──►  dashboard/page.tsx
  (JWT, already present)         (skip queries        (conditional render)
                                  user can't access)
                                       │
                                  lib/db.js
                            getLegalHubDashboardData()
                              - statsByStatus
                              - upcomingDeadlines (30d)
                              - recentCases (top 5)
```

Permission check convention (matches existing routes):
```ts
const perm = (session.user.permissions ?? {})['resource'] ?? 'full';
const canView = session.user.isSuperAdmin
  || session.user.orgRole !== 'member'
  || hasPermission(perm as PermissionLevel, 'view');
```

---

## Tasks

- [ ] **Task 1 — Permission-gated dashboard API + legal hub DB function**
- [ ] **Task 2 — Permission-gated dashboard UI + legal hub sections**

---

## Task 1 — Permission-gated dashboard API + legal hub DB function

**Description:**
Add `getLegalHubDashboardData(orgId, userId, orgRole)` to `lib/db.js`, export it from `src/lib/db-imports.ts`, and update `/api/dashboard/route.ts` to check permissions before querying each resource and include the new legal hub data.

**Files:**
- `lib/db.js` — new function `getLegalHubDashboardData`
- `src/lib/db-imports.ts` — export new function
- `src/app/api/dashboard/route.ts` — permission checks + legal hub section

**New DB function spec:**
```js
getLegalHubDashboardData(orgId, userId, orgRole)
// Returns:
// {
//   statsByStatus: Array<{ status: string; count: number }>
//   upcomingDeadlines: Array<{ id, case_id, case_title, title, deadline_type, due_date }>
//   recentCases: Array<{ id, title, status, case_type, created_at, assigned_to_name }>
// }
//
// Member scoping: when orgRole === 'member', scope all queries to
// legal_cases.assigned_to = userId
```

**API changes:**
- Read `session.user.permissions`, `session.user.orgRole`, `session.user.isSuperAdmin`, `session.user.id`
- Build helper `canViewResource(resource)` using `hasPermission` from `lib/permissions.ts`
- Only call docs/obligations/contracts DB functions if user can view those resources
- Only call `getLegalHubDashboardData` if user can view `legal_hub`
- Return shape adds optional `legalHub` key:
  ```ts
  legalHub?: {
    statsByStatus: Array<{ status: string; count: number }>
    upcomingDeadlines: Array<{ id, case_id, case_title, title, deadline_type, due_date }>
    recentCases: Array<{ id, title, status, case_type, created_at, assigned_to_name }>
  }
  ```

**Success criteria:**
- GET `/api/dashboard` as an owner/admin returns all data including `legalHub`
- GET `/api/dashboard` as a member with `legal_hub: 'none'` returns no `legalHub` key and no docs/contracts/obligations data if those are also `'none'`
- GET `/api/dashboard` as a member with only `contracts: 'view'` returns only contracts data
- Upcoming deadlines are scoped to assigned cases when caller is a `member` role

---

## Task 2 — Permission-gated dashboard UI + legal hub sections

**Description:**
Update `src/app/(app)/dashboard/page.tsx` to read session permissions and conditionally render KPI cards and panels. Add legal hub KPI card (with inline status breakdown) and two new legal hub panels (upcoming court deadlines, recent cases). Add i18n translation keys to `messages/en.json` and `messages/pl.json`.

**Files:**
- `src/app/(app)/dashboard/page.tsx`
- `messages/en.json`
- `messages/pl.json`

**UI changes:**

KPI row — render only cards for accessible resources:
- Documents card: only if `canView('documents')`
- Overdue obligations card: only if `canView('contracts')` (obligations live under contracts resource)
- Contracts card: only if `canView('contracts')`
- Open Cases card: only if `canView('legal_hub')` — shows total open (non-closed) count, with compact status badges inline (e.g. `new 2 · intake 1 · filed 3`)

Panel grid — render accessible panels in a responsive grid:
- Upcoming Obligations panel: only if `canView('contracts')`
- Contracts Expiring panel: only if `canView('contracts')`
- Upcoming Court Deadlines panel: only if `canView('legal_hub')` — lists deadlines within 30 days from `legalHub.upcomingDeadlines`, links to `/legal-hub`
- Recent Cases panel: only if `canView('legal_hub')` — lists 5 most recent cases, links to `/legal-hub/{id}`

Empty state: if no section is visible (no permissions), render only the title/subtitle with no panels.

`canView` logic in the component:
```ts
const permissions = sessionData?.user?.permissions;
function canView(resource: string): boolean {
  if (!permissions) return true; // owner/admin
  const level = PERMISSION_LEVELS[(permissions[resource] ?? 'full') as PermissionLevel] ?? 3;
  return level >= 1;
}
```

**New i18n keys (en.json / pl.json):**
```
Dashboard.openCases          — "Open Cases" / "Otwarte sprawy"
Dashboard.openCasesSub       — "{count} statuses" / "{count} statusów"
Dashboard.caseStatusBreakdown — inline badge format, no key needed
Dashboard.upcomingDeadlines  — "Upcoming Court Deadlines" / "Nadchodzące terminy sądowe"
Dashboard.noUpcomingCaseDeadlines — "No upcoming court deadlines." / "Brak nadchodzących terminów sądowych."
Dashboard.recentCases        — "Recent Cases" / "Ostatnie sprawy"
Dashboard.noRecentCases      — "No cases yet." / "Brak spraw."
```

**Success criteria:**
- User with full access sees all 4 KPI cards and all 4 panels
- User with `legal_hub: 'none'` and `contracts: 'view'` sees only Documents + Contracts KPIs and both contracts panels; no legal hub panels
- User with only `legal_hub: 'view'` sees only Open Cases KPI + both legal hub panels; no contracts/obligations panels
- User with all resources `'none'` sees only page title and subtitle, no cards or panels
- Open Cases KPI card shows status breakdown as compact inline badges
- Upcoming Court Deadlines panel links each item to `/legal-hub` (cases page)
- Recent Cases panel links each item to `/legal-hub/{id}`
- Both English and Polish translation keys present and correct
