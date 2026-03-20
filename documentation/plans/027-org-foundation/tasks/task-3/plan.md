# Task 3 Implementation Plan -- Org Management UI

## Overview

Add org context to the sidebar, build org settings page, org member management API routes, and members page.

## Files to Create

### 1. `src/app/api/org/route.ts` (new)
- GET: return `{ id, name, slug, memberCount, createdAt }` for session user's org
  - Auth guard (401), ensureDb, getOrgById(session.user.orgId), count members via query
- PATCH: update org name (owner/admin only)
  - Auth guard, orgRole check (403 if member), validate name non-empty + max 80 chars
  - Update org name in DB via `run()`, saveDb(), logAction, return updated org

### 2. `src/app/api/org/members/route.ts` (new)
- GET: return array of `{ userId, name, email, role, joinedAt }` for all org members
  - Auth guard, ensureDb, JOIN org_members with users WHERE org_id = session.user.orgId

### 3. `src/app/api/org/members/[id]/route.ts` (new)
- PATCH: update member role
  - Auth guard, orgRole check (owner can do anything, admin can change member<->admin, member gets 403)
  - Cannot promote to owner unless you are owner
  - Cannot demote yourself if you are the only owner (count owners)
  - Validate role is one of ['owner', 'admin', 'member']
  - Update via `run()`, saveDb(), logAction
- DELETE: remove member from org
  - Auth guard, orgRole check (owner/admin only)
  - Cannot remove yourself (400)
  - Delete from org_members, saveDb(), logAction

### 4. `src/app/(app)/settings/org/page.tsx` (new)
- Client component with "use client"
- Fetches GET /api/org on mount
- Displays org name (editable input for owner/admin), slug (read-only), creation date, member count
- Save button calls PATCH /api/org; on success shows toast + triggers session update via router.refresh()
- Non-admin users see read-only view (no input, just text)
- Uses Card, Input, Button, Badge from shadcn/ui; toast from sonner

### 5. `src/app/(app)/org/members/page.tsx` (new)
- Client component with "use client"
- Fetches GET /api/org/members on mount + GET /api/org for org info
- Table with columns: name, email, role (Badge), joined date, actions
- Actions column (owner/admin only): Select dropdown for role, remove Button with AlertDialog confirmation
- Empty state for single-member org
- Non-admin: no actions column
- Role change calls PATCH /api/org/members/[id]; remove calls DELETE /api/org/members/[id]
- Optimistic UI: update list state immediately, revert on error

### 6. `src/components/layout/app-sidebar.tsx` (modify)
- Replace "ComplianceA" header text with `sessionData?.user?.orgName ?? "ComplianceA"` (fallback)
- Update footer: show `{userName} · {orgName}` where orgName comes from session
- Rename "Users" nav item to "Members" and update href from "/users" to "/org/members"
- Remove admin-only restriction on Members link (all org members can view)
- Add "Organization" link in the settings section pointing to "/settings/org"

## DB Functions Needed

New functions required in `lib/db.js` and exported via `src/lib/db-imports.ts`:
- `getOrgMembers(orgId)` -- returns all members with user info (JOIN org_members + users)
- `getOrgMemberById(orgId, userId)` -- returns single member record
- `updateOrgMemberRole(orgId, userId, role)` -- updates role
- `removeOrgMember(orgId, userId)` -- deletes from org_members
- `updateOrgName(orgId, name)` -- updates organizations.name
- `countOrgOwners(orgId)` -- counts members with role='owner'
- `countOrgMembers(orgId)` -- counts all members

These are all simple single-statement SQL functions following existing patterns in db.js.

## Changes to lib/db.d.ts

Add type declarations for all new functions.

## Changes to src/lib/db-imports.ts

Add re-exports for all new functions.

## How Success Criteria Are Met

1. **Sidebar shows org name**: orgName from session replaces hardcoded "ComplianceA"
2. **/settings/org loads**: new page fetches GET /api/org and renders org details
3. **Owner/admin can edit org name**: PATCH /api/org with role guard; sidebar updates via session
4. **/org/members lists users**: new page fetches GET /api/org/members
5. **Role change works**: PATCH /api/org/members/[id] with proper role authorization
6. **Remove member works**: DELETE /api/org/members/[id]; removed user hits org guard on next load
7. **Read-only for non-admin**: actions column hidden when orgRole === 'member'
8. **Self-remove returns 400**: DELETE handler checks session.user.id === target id

## Risks

- Session orgName is in JWT -- after org name change, the JWT won't update until next token refresh. Mitigation: the org settings page will store the new name in local state for immediate UI update; the sidebar can read from a shared state or the page can trigger a full page reload.
- Task 2 is running in parallel and may modify db.js concurrently. Mitigation: my new functions are appended to the end of db.js and don't modify existing functions, so merge conflicts are unlikely.
