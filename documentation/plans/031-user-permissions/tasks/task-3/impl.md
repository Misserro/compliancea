# Task 3 Implementation Notes: Permission Management API

## Files Created

### 1. `src/app/api/org/permissions/route.ts` (new file)
- **GET**: Returns org permission defaults as `{ defaults: { documents: 'full', ... } }`. Owner/admin only.
- **PUT**: Accepts `{ defaults: { resource: action } }`, validates resources against `PERMISSION_RESOURCES` and actions against `['none','view','edit','full']`. Calls `setOrgPermissionDefault` per entry, then `saveDb()` BEFORE `logAction()`.

### 2. `src/app/api/org/members/[id]/permissions/route.ts` (new file)
- **GET**: Returns member permissions as `{ permissions: { documents: 'view', ... } }`. Validates member exists in org via `getOrgMemberRecord`. Owner/admin only.
- **PUT**: Accepts `{ permissions: { resource: action } }`, validates, calls `setMemberPermission` per entry, `saveDb()` BEFORE `logAction()`. Returns updated permissions.

### 3. `src/app/api/org/members/[id]/permissions/reset/route.ts` (new file)
- **POST**: Calls `resetMemberPermissions(orgId, userId)` which deletes + re-seeds from org defaults. `saveDb()` BEFORE `logAction()`. Returns fresh permissions.

## Pattern Compliance
- All files follow the exact pattern from `src/app/api/org/members/[id]/route.ts`:
  - `export const runtime = "nodejs"`
  - Auth guard -> role guard -> ensureDb -> try/catch
  - `{ params }: { params: Promise<{ id: string }> }` for dynamic routes
  - Body parsing with try/catch for "Invalid JSON body" 400
  - `saveDb()` before `logAction()` (critical rule)
  - Error handler: `err instanceof Error ? err.message : "Unknown error"` -> 500

## Imports Used
- `@/auth` (auth), `@/lib/server-utils` (ensureDb), `@/lib/db-imports` (DB functions + PERMISSION_RESOURCES), `@/lib/audit-imports` (logAction)

## INTEGRATION Notes
- Task 4 (UI) should call these endpoints: `GET/PUT /api/org/permissions` for defaults, `GET/PUT /api/org/members/[id]/permissions` for member overrides, `POST /api/org/members/[id]/permissions/reset` for reset
- These routes do NOT have member-role permission checks (they are owner/admin-only management endpoints, not data endpoints)
- `PERMISSION_RESOURCES` is imported from db-imports (sourced from lib/db.js) -- no dependency on `src/lib/permissions.ts` (Task 2)

## Type Check
- `npx tsc --noEmit` -- zero errors in new files (only pre-existing Next.js node_modules noise)
