# Task 1 Implementation: Permission DB Layer

## Changes

### Modified: `lib/db.js`
- **initDb() (~line 737):** Added two CREATE TABLE IF NOT EXISTS statements for `member_permissions` and `org_permission_defaults` tables, placed after Plan 030 migrations and before `initSystemTemplates()`.
- **createOrganization (~line 3768):** Added `seedOrgPermissionDefaults(newOrgId)` call after INSERT, before returning the new org ID.
- **addOrgMember (~line 3483):** Added `if (role === 'member') { seedMemberPermissionsFromDefaults(orgId, userId); }` after INSERT.
- **End of file:** Added `PERMISSION_RESOURCES` constant and 8 new exported functions:
  1. `seedOrgPermissionDefaults(orgId)` — INSERT OR IGNORE 5 resources with action='full'
  2. `seedMemberPermissionsFromDefaults(orgId, userId)` — copies org defaults to member_permissions via INSERT OR IGNORE
  3. `getOrgPermissionDefaults(orgId)` — returns [{resource, action}]
  4. `setOrgPermissionDefault(orgId, resource, action)` — INSERT OR REPLACE
  5. `getMemberPermissions(orgId, userId)` — returns [{resource, action}]
  6. `getUserPermissionForResource(orgId, userId, resource)` — returns action string, defaults to 'full' if no row
  7. `setMemberPermission(orgId, userId, resource, action)` — INSERT OR REPLACE
  8. `resetMemberPermissions(orgId, userId)` — DELETE + seedMemberPermissionsFromDefaults

### Modified: `lib/db.d.ts`
- Added 9 declarations: `PERMISSION_RESOURCES` constant + 8 function stubs using `(...args: any[]): any` pattern.

### Modified: `src/lib/db-imports.ts`
- Added 9 re-exports: `PERMISSION_RESOURCES`, `seedOrgPermissionDefaults`, `seedMemberPermissionsFromDefaults`, `getOrgPermissionDefaults`, `setOrgPermissionDefault`, `getMemberPermissions`, `getUserPermissionForResource`, `setMemberPermission`, `resetMemberPermissions`.

## Exports for downstream tasks

- **Task 2 (JWT):** Import `getMemberPermissions` from `@/lib/db-imports` to hydrate JWT token with permission map.
- **Task 3 (API):** Import `getOrgPermissionDefaults`, `setOrgPermissionDefault`, `getMemberPermissions`, `setMemberPermission`, `resetMemberPermissions`, `getUserPermissionForResource` from `@/lib/db-imports`.
- **PERMISSION_RESOURCES:** Available from both `lib/db.js` and `@/lib/db-imports` for validation in API routes.

## INTEGRATION notes

- `getUserPermissionForResource` returns `'full'` when no row exists -- backward compatible for pre-031 members.
- First-run bootstrap enrolls users as `'owner'`, so `addOrgMember` seed hook is NOT triggered (correct -- owners bypass permission checks).
- `seedOrgPermissionDefaults` uses INSERT OR IGNORE so calling it multiple times is safe (idempotent).
- `seedMemberPermissionsFromDefaults` uses INSERT OR IGNORE so existing custom permissions are preserved if function is called again.
- `resetMemberPermissions` DELETEs first, then re-seeds -- this is the intentional "restore to defaults" behavior.

## Verification

- TypeScript compile (`npx tsc --noEmit`): passes with zero errors.
