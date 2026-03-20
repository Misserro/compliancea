# Task 1 Implementation Plan: Permission DB Layer

## Files to modify

### 1. `lib/db.js`

**A. New constant (top-level, near other constants):**
- Add `PERMISSION_RESOURCES` array after existing constants, before initDb or near the end with other org functions.
- Actually, place it near the permission functions for locality. Will add just before the new function block.

**B. initDb() — two new CREATE TABLE statements:**
- Insert after line 735 (Plan 030 migrations), before `initSystemTemplates()` call at line 738.
- Use `db.run()` (raw sql.js, not the `run()` wrapper) per established pattern.
- Two tables: `member_permissions` and `org_permission_defaults`, both with `CREATE TABLE IF NOT EXISTS`.

**C. Eight new exported functions (append after `getOrgWithMemberCount` at end of file):**
1. `seedOrgPermissionDefaults(orgId)` — loop PERMISSION_RESOURCES, INSERT OR IGNORE with action='full'
2. `seedMemberPermissionsFromDefaults(orgId, userId)` — query org defaults, INSERT OR IGNORE each into member_permissions
3. `getOrgPermissionDefaults(orgId)` — SELECT resource, action FROM org_permission_defaults WHERE org_id = ?
4. `setOrgPermissionDefault(orgId, resource, action)` — INSERT OR REPLACE
5. `getMemberPermissions(orgId, userId)` — SELECT resource, action FROM member_permissions WHERE org_id = ? AND user_id = ?
6. `getUserPermissionForResource(orgId, userId, resource)` — get() single row, return row.action or 'full' if null
7. `setMemberPermission(orgId, userId, resource, action)` — INSERT OR REPLACE
8. `resetMemberPermissions(orgId, userId)` — DELETE + seedMemberPermissionsFromDefaults

**D. Seed hooks:**
- `createOrganization` (~line 3748): after INSERT, call `seedOrgPermissionDefaults(result.lastInsertRowId)` before return
- `addOrgMember` (~line 3463): after INSERT, add `if (role === 'member') { seedMemberPermissionsFromDefaults(orgId, userId); }`

### 2. `lib/db.d.ts`

Append 9 new declarations (8 functions + PERMISSION_RESOURCES constant):
```typescript
export const PERMISSION_RESOURCES: string[];
export function seedOrgPermissionDefaults(...args: any[]): any;
export function seedMemberPermissionsFromDefaults(...args: any[]): any;
export function getOrgPermissionDefaults(...args: any[]): any;
export function setOrgPermissionDefault(...args: any[]): any;
export function getMemberPermissions(...args: any[]): any;
export function getUserPermissionForResource(...args: any[]): any;
export function setMemberPermission(...args: any[]): any;
export function resetMemberPermissions(...args: any[]): any;
```

### 3. `src/lib/db-imports.ts`

Add 9 new re-exports to the existing export block:
```typescript
PERMISSION_RESOURCES,
seedOrgPermissionDefaults,
seedMemberPermissionsFromDefaults,
getOrgPermissionDefaults,
setOrgPermissionDefault,
getMemberPermissions,
getUserPermissionForResource,
setMemberPermission,
resetMemberPermissions,
```

## Success Criteria Mapping

- seedOrgPermissionDefaults(1) creates 5 rows with action='full' -- loop over PERMISSION_RESOURCES with INSERT OR IGNORE
- seedMemberPermissionsFromDefaults(1, 2) creates 5 rows mirroring defaults -- reads org defaults, inserts each
- getUserPermissionForResource returns 'full' after seeding -- get() with fallback to 'full'
- setMemberPermission overrides specific resource -- INSERT OR REPLACE
- resetMemberPermissions restores to defaults -- DELETE then re-seed
- createOrganization seeds automatically -- hook after INSERT
- addOrgMember with role='member' seeds permissions -- conditional hook after INSERT

## Risks

- Multiple `run()` calls in seed functions = multiple saveDb() calls. This is acceptable per existing patterns (e.g., deleteDocument does multiple run() calls). No transactions available.
- The first-run org bootstrap at line 740 uses raw `run()` to create default org but won't trigger our seed because it bypasses `createOrganization()`. We should NOT modify the bootstrap -- the seed hook only applies to new orgs created via `createOrganization()`.
