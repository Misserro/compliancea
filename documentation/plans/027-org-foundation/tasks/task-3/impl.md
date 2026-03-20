# Task 3 Implementation Notes -- Org Management UI

## Changes Made

### lib/db.js -- New Org Member Functions (appended at end of file)
- `getOrgMembers(orgId)` -- JOIN org_members + users, returns [{userId, name, email, role, joinedAt}]
- `getOrgMemberRecord(orgId, userId)` -- single member lookup by org+user
- `updateOrgMemberRole(orgId, userId, role)` -- UPDATE org_members SET role
- `removeOrgMember(orgId, userId)` -- DELETE FROM org_members
- `updateOrgName(orgId, name)` -- UPDATE organizations SET name
- `countOrgOwners(orgId)` -- COUNT members with role='owner' (for last-owner guard)
- `countOrgMembers(orgId)` -- COUNT all members

### lib/db.d.ts -- Added type declarations for all 7 new functions

### src/lib/db-imports.ts -- Added re-exports for all 7 new functions

### src/app/api/org/route.ts (new)
- GET: returns {id, name, slug, memberCount, createdAt} for session user's org
- PATCH: updates org name; owner/admin only (403 for members); validates name non-empty, max 80 chars; calls saveDb() + logAction()

### src/app/api/org/members/route.ts (new)
- GET: returns {members: [{userId, name, email, role, joinedAt}]} for all org members

### src/app/api/org/members/[id]/route.ts (new)
- PATCH: updates member role with full RBAC:
  - Owner can set any role (owner/admin/member)
  - Admin can change member<->admin only (cannot touch owners, cannot promote to owner)
  - Cannot demote self if only owner (counts owners first)
  - Validates role against allowed list
- DELETE: removes member from org
  - Owner/admin only
  - Cannot remove yourself (400)
  - Admin cannot remove owners (403)
  - Calls saveDb() + logAction()
- Both handlers await params (Next.js 15 Promise pattern) and validate ID with parseInt+isNaN

### src/app/(app)/settings/org/page.tsx (new)
- Client component; fetches GET /api/org on mount
- Displays org name (editable Input for owner/admin, read-only text for members), slug, creation date, member count
- Save calls PATCH /api/org; on success calls `updateSession()` to refresh JWT so sidebar picks up new name
- Uses Card, Input, Button, Badge from shadcn/ui; toast from sonner

### src/app/(app)/org/members/page.tsx (new)
- Client component; fetches GET /api/org/members on mount
- Table with name, email, role Badge (color-coded), joined date, actions column
- Actions (owner/admin only): Select dropdown for role change, AlertDialog for remove confirmation
- Empty state shown when org has only 1 member
- Read-only view for non-admin members (no actions column)
- Role change and remove update local state immediately (optimistic)

### src/components/layout/app-sidebar.tsx (modified)
- Header: replaced hardcoded "ComplianceA" with `sessionData?.user?.orgName ?? "ComplianceA"`
- Footer: replaced conditional email display with org name display (`{orgName}`)
- Bottom nav: removed admin-only "Users" link; added "Organization" (/settings/org) and "Members" (/org/members) links visible to all users
- Added Building2 icon import from lucide-react
- Removed `isAdmin` variable (no longer needed for nav gating)

## INTEGRATION Notes

- **Session orgName update after rename**: Fixed in review cycle 1. The JWT callback now always refreshes org context (orgId, orgRole, orgName) on every request instead of only when orgId is missing. This means `updateSession()` after org rename immediately picks up the new name. Cost is negligible since `getOrgMemberByUserId` is a synchronous sql.js query.
- **GOTCHA**: The old `/users` page still exists at `src/app/(app)/users/page.tsx` and is still accessible. It remains as the admin user management page (session termination). The new `/org/members` page is the org-scoped member management page. These serve different purposes.
- **Task 2 parallel**: No conflicts expected -- Task 2 modifies existing query functions, Task 3 adds new functions at the end of db.js.

## Review Fix Cycle 1

- **Fix 1 [QUALITY]**: Removed `if (!token.orgId)` guard in `src/auth.ts` JWT callback subsequent-requests branch. Org context (orgId, orgRole, orgName) is now always refreshed from DB on every request, ensuring org name changes are picked up immediately after `updateSession()`.
- **Fix 2 [PATTERN]**: Moved inline `ROLE_BADGE_CLASSES` from `src/app/(app)/org/members/page.tsx` to `src/lib/constants.ts` as `ORG_ROLE_COLORS`, following the design-system standard that domain colors must be centralized. Used `dark:` variants consistent with existing color maps. Updated members page to import from `@/lib/constants`.

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors for Task 3 files (concurrent Task 2 has pre-existing TS errors in its own files)
- Next.js build: all Task 3 pages compile successfully
