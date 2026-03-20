# Task 3 Plan: Permission Management API

## Overview

Create 3 new API route files with 5 endpoints total for managing org permission defaults and per-user permission overrides. All endpoints are owner/admin-only.

## Files to Create

### 1. `src/app/api/org/permissions/route.ts` (new file)

**GET handler** — return org permission defaults:
- Auth guard: 401 if no session
- Role guard: 403 if not owner/admin
- `ensureDb()`, extract `orgId`
- Call `getOrgPermissionDefaults(orgId)` from db-imports
- Map array to object: `Object.fromEntries(defaults.map(d => [d.resource, d.action]))`
- Return `{ defaults: { documents: 'full', ... } }`

**PUT handler** — update org permission defaults:
- Auth guard + role guard (owner/admin)
- Parse body, expect `{ defaults: { resource: action, ... } }`
- Validate each key is in `PERMISSION_RESOURCES`, each value is in `['none','view','edit','full']`
- Return 400 for invalid resource or action
- For each valid entry: `setOrgPermissionDefault(orgId, resource, action)`
- `saveDb()` BEFORE `logAction()`
- `logAction("org_permissions", orgId, "update", ...)` with userId/orgId options
- Re-fetch and return `{ defaults: {...} }`

### 2. `src/app/api/org/members/[id]/permissions/route.ts` (new file)

**GET handler** — return member's permissions:
- Auth guard + role guard (owner/admin)
- Parse `params.id`, validate numeric
- `ensureDb()`, extract `orgId`
- Call `getMemberPermissions(orgId, targetUserId)`
- Map to object, return `{ permissions: {...} }`

**PUT handler** — set member permissions:
- Auth guard + role guard (owner/admin)
- Parse `params.id`, validate numeric
- Parse body `{ permissions: { resource: action, ... } }`
- Validate resource names + action values
- For each: `setMemberPermission(orgId, targetUserId, resource, action)`
- `saveDb()` BEFORE `logAction()`
- Re-fetch and return `{ permissions: {...} }`

### 3. `src/app/api/org/members/[id]/permissions/reset/route.ts` (new file)

**POST handler** — reset member permissions to org defaults:
- Auth guard + role guard (owner/admin)
- Parse `params.id`, validate numeric
- `ensureDb()`, extract `orgId`
- `resetMemberPermissions(orgId, targetUserId)`
- `saveDb()` BEFORE `logAction()`
- Re-fetch `getMemberPermissions(orgId, targetUserId)`, map to object
- Return `{ permissions: {...} }`

## Patterns Followed

- **Auth pattern**: `auth()` -> check `session?.user` -> 401. From `src/app/api/org/members/[id]/route.ts`.
- **Role guard**: `orgRole !== "owner" && orgRole !== "admin"` -> 403. Same file.
- **Body parsing**: try/catch `request.json()` -> 400 "Invalid JSON body". Same file.
- **Error handling**: try/catch wrapping main logic, `err instanceof Error ? err.message : "Unknown error"` -> 500.
- **saveDb() before logAction()**: consistent with all existing routes.
- **logAction signature**: `logAction(entityType, entityId, action, details, { userId, orgId })`.
- **Imports**: `@/auth`, `@/lib/server-utils`, `@/lib/db-imports`, `@/lib/audit-imports`.
- **runtime export**: `export const runtime = "nodejs"`.
- **Param extraction**: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`.

## Validation Constants

- Valid resources: `['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards']` (from `PERMISSION_RESOURCES` in db-imports)
- Valid actions: `['none', 'view', 'edit', 'full']`

## Risks / Notes

- Task 1 DB functions must be available (confirmed: already exported in db-imports.ts)
- `src/lib/permissions.ts` does NOT exist yet (Task 2 scope), but we do not need it -- we import `PERMISSION_RESOURCES` from db-imports and define valid actions locally
- No scope creep: we do NOT add permission enforcement checks to these routes (that is Task 2's job) -- only the owner/admin role guard

## Success Criteria Mapping

- GET /api/org/permissions returns 5 resources -> covered by GET handler mapping array to object
- PUT /api/org/permissions persists changes -> covered by setOrgPermissionDefault + saveDb
- GET /api/org/members/[id]/permissions returns 5 resources -> covered by GET handler
- PUT /api/org/members/[id]/permissions overrides resources -> covered by setMemberPermission loop
- POST /api/org/members/[id]/permissions/reset restores defaults -> covered by resetMemberPermissions call
- All routes return 403 for member role -> covered by orgRole guard
