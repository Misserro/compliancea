# Task 4 Implementation Plan: Org Switcher

## Overview

Fix JWT callback to persist chosen org across requests (instead of always defaulting to first org), add org switch + memberships API endpoints, and add a sidebar org switcher dropdown for multi-org users.

## Files to Modify

### 1. `src/lib/db-imports.ts` -- add re-exports
- Add `getAllOrgMembershipsForUser` and `getOrgMemberForOrg` to the export list
- These functions already exist in `lib/db.js` and `lib/db.d.ts` (created by Task 1)

### 2. `src/auth.ts` -- fix JWT callback
- Import `getOrgMemberForOrg` from `@/lib/db-imports`
- Modify JWT callback signature from `async jwt({ token, user })` to `async jwt({ token, user, trigger, session })`
- Change the `else if (token.sessionId && token.id)` branch (lines 85-101):
  - If `trigger === "update" && session?.switchToOrgId`: use `getOrgMemberForOrg(userId, switchToOrgId)` for explicit org switch
  - Else if `token.orgId`: use `getOrgMemberForOrg(userId, token.orgId)` to re-fetch current org; fall back to `getOrgMemberByUserId` if null (handles removal from org)
  - Else: use `getOrgMemberByUserId(userId)` -- first org (existing behavior)
- **Type consistency**: `token.orgId` is typed as `number` (JWT type augmentation line 30). `getOrgMemberForOrg` returns camelCase `orgId` (number), `getOrgMemberByUserId` returns snake_case `org_id`. Will store as number consistently: `membership.orgId` or `membership.org_id` depending on which function returned the result.
- **Solution for field name divergence**: use a unified setter pattern after choosing the membership. Both functions return `role` the same way. For orgId/orgName, use conditional access based on which function was called, or normalize into a local variable.

### 3. `src/app/api/org/switch/route.ts` -- new POST endpoint
- Auth guard (401 if no session)
- `ensureDb()`
- Parse body `{ targetOrgId: number }`; validate it's a number
- `getOrgMemberForOrg(Number(session.user.id), targetOrgId)` -- if null, return 403
- `logAction` + `saveDb()`
- Return `{ success: true }`

### 4. `src/app/api/org/memberships/route.ts` -- new GET endpoint
- Auth guard (401 if no session)
- `ensureDb()`
- `getAllOrgMembershipsForUser(Number(session.user.id))`
- Return `{ memberships: [...] }` (already camelCase from SQL aliases)

### 5. `src/components/layout/app-sidebar.tsx` -- conditional org switcher
- Import `useRouter` from `next/navigation`
- Destructure `update` from `useSession()` (change `const { data: sessionData } = useSession()` to `const { data: sessionData, update } = useSession()`)
- Add state: `memberships` array (fetched via useEffect from GET /api/org/memberships)
- Add state: `isSwitching` boolean (loading guard to prevent double-click)
- If memberships.length <= 1: render existing static `<h1>{orgName}</h1>` (no regression for single-org users)
- If memberships.length > 1: render `DropdownMenu` with:
  - Trigger: `<button>` styled to match current h1 + ChevronDown icon
  - Items: each org with its name; current org (matching `session.user.orgId`) shows Check icon
  - On click: set `isSwitching=true`, `await update({ switchToOrgId: item.orgId })`, `router.refresh()`, then `isSwitching=false`
  - Trigger disabled during switch
- Imports needed: `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`; `Check`, `ChevronDown` from `lucide-react`; `useRouter` from `next/navigation`

## Success Criteria Mapping

1. Single-org user sees static org name -- handled by `memberships.length <= 1` guard
2. Multi-org user sees dropdown with checkmark on current org
3. Clicking different org switches session via `update({ switchToOrgId })`
4. After switch, orgId/orgRole/orgName reflect new org (JWT callback fix)
5. Removal from active org falls back to first remaining org (fallback in JWT callback)
6. POST /api/org/switch with non-member targetOrgId returns 403
7. GET /api/org/memberships returns all orgs for authenticated user

## Risks

- **Field name mismatch**: `getOrgMemberForOrg` uses camelCase aliases (`orgId`, `orgName`), `getOrgMemberByUserId` uses snake_case (`org_id`, `org_name`). The JWT callback must normalize when setting token fields.
- **Concurrent Task 1**: Task 1 already created DB functions and db.d.ts entries. Only db-imports.ts re-exports are missing.
