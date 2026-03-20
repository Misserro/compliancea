## Task 4 Complete -- Org Switcher

- Modified: `src/auth.ts` (JWT callback fix -- lines 68, 95-116)
  - Added `getOrgMemberForOrg` import
  - Changed JWT callback signature to include `trigger` and `session` parameters
  - Replaced unconditional `getOrgMemberByUserId` call with three-branch logic:
    1. `trigger === "update" && session?.switchToOrgId` -- explicit org switch via `useSession().update()`
    2. `token.orgId` set -- re-fetch current active org via `getOrgMemberForOrg`; falls back to `getOrgMemberByUserId` if removed from org
    3. No org set -- pick first via `getOrgMemberByUserId` (existing behavior)
  - Normalized field names: `membership.orgId ?? membership.org_id` handles both camelCase (getOrgMemberForOrg) and snake_case (getOrgMemberByUserId) return shapes

- Created: `src/app/api/org/switch/route.ts` (new POST endpoint)
  - Auth guard, ensureDb, validate targetOrgId is number
  - getOrgMemberForOrg check -- 403 if not a member
  - logAction + saveDb
  - Returns `{ success: true }`

- Created: `src/app/api/org/memberships/route.ts` (new GET endpoint)
  - Auth guard, ensureDb
  - getAllOrgMembershipsForUser
  - Returns `{ memberships: [...] }` with camelCase keys from SQL aliases

- Modified: `src/components/layout/app-sidebar.tsx` (conditional org switcher)
  - Added imports: DropdownMenu components, Check, ChevronDown, useRouter
  - Added `update` from useSession(), `memberships` state, `isSwitching` state
  - Added useEffect to fetch memberships from GET /api/org/memberships on mount
  - SidebarHeader: if memberships.length > 1, renders DropdownMenu with org list + checkmark on current org; otherwise renders static h1 (no regression for single-org users)
  - handleOrgSwitch: calls `update({ switchToOrgId })` then `router.refresh()`, with isSwitching guard

- NOT modified: `lib/db.js`, `lib/db.d.ts`, `src/lib/db-imports.ts` -- all DB functions and re-exports already created by Task 1

- INTEGRATION: Task 2 (acceptance flow) should call `update({ switchToOrgId: result.orgId })` after accepting an invite to switch session to the new org. The JWT callback will handle the rest.

- GOTCHA: `getOrgMemberForOrg` returns camelCase field names (`orgId`, `orgName`) while `getOrgMemberByUserId` returns snake_case (`org_id`, `org_name`). The JWT callback normalizes with `membership.orgId ?? membership.org_id`.
