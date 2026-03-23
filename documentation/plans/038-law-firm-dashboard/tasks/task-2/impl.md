# Task 2 Implementation — Case Assignment API: create, list, reassign

## Changes

### Modified: `src/app/api/legal-hub/cases/route.ts`
- **Import:** Added `getOrgMemberRecord` from `@/lib/db-imports`
- **GET handler (line 42-44):** Now passes `userId: Number(session.user.id)` and `orgRole: session.user.orgRole` to `getLegalCases()`. The DB function filters by `assigned_to = userId` when `orgRole === 'member'`; admins/owners/superAdmins see all org cases. Response already includes `assigned_to` and `assigned_to_name` fields (handled by Task 1's JOIN).
- **POST handler (lines 93-119):** Added `assigned_to` determination logic before `createLegalCase`:
  - Members: auto-assigned to `session.user.id` (body `assigned_to` ignored)
  - Admin/owner/superAdmin with `body.assigned_to`: validates it is a positive integer, then calls `getOrgMemberRecord(orgId, body.assigned_to)` to confirm membership. Returns 400 if invalid or not in org.
  - Admin/owner/superAdmin without `body.assigned_to`: defaults to self.
  - Passes `assignedTo` to `createLegalCase()`.

### Modified: `src/app/api/legal-hub/cases/[id]/route.ts`
- **Import:** Added `getOrgMemberRecord` from `@/lib/db-imports`
- **PATCH handler (lines 104-126):** Added `assigned_to` validation block before the allowlist loop:
  - If `body.assigned_to !== undefined` and caller is member (not superAdmin): returns 403 "Members cannot change case assignment"
  - If `body.assigned_to` is null, non-integer, or <= 0: returns 400 "assigned_to must be a positive integer" (per reviewer advisory: null rejection is explicit since unassigning is out of scope)
  - Validates target user is in same org via `getOrgMemberRecord(orgId, body.assigned_to)`: returns 400 if not found
- **Allowlist (line 133):** Added `"assigned_to"` to `allowedKeys` array so validated values flow through to `updateLegalCase`

## Integration Notes
- INTEGRATION: Task 4 (Case assignment UI) will consume the `assigned_to` and `assigned_to_name` fields from GET responses and send `assigned_to` in POST/PATCH bodies.
- The `assigned_to` field in PATCH flows through the existing allowlist loop without special serialization (it is a plain integer, unlike `tags`/`extension_data` which need JSON.stringify).
- GET `/api/legal-hub/cases/[id]` (single case) does NOT filter by assignment -- a member could fetch any case by direct ID. This is consistent with plan scope (filtering gate is at the list level).
