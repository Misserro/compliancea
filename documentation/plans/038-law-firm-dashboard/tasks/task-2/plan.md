# Task 2 Plan — Case Assignment API: create, list, reassign

## Summary

Wire the case assignment logic into the three existing case API routes. Task 1 has already updated the DB layer (`getLegalCases` accepts `userId`/`orgRole`, `createLegalCase` accepts `assignedTo`). This task passes session data through and adds validation.

## Files to Modify

### 1. `src/app/api/legal-hub/cases/route.ts` (GET + POST)

**GET handler changes:**
- Pass `userId: Number(session.user.id)` and `orgRole: session.user.orgRole` to `getLegalCases()`.
- Current call: `getLegalCases({ search, status, caseType, orgId })`
- New call: `getLegalCases({ search, status, caseType, orgId, userId: Number(session.user.id), orgRole: session.user.orgRole as string })`
- No other GET changes needed -- the DB function already handles filtering and returns `assigned_to` + `assigned_to_name`.

**POST handler changes:**
- Add `getOrgMemberRecord` to the import from `@/lib/db-imports`.
- Determine `assignedTo`:
  - If `session.user.orgRole === 'member'` (and not superAdmin): force `assignedTo = Number(session.user.id)`. Ignore any `assigned_to` in body.
  - If admin/owner/superAdmin and `body.assigned_to` is provided:
    - Validate it's a number.
    - Call `getOrgMemberRecord(orgId, body.assigned_to)` to confirm user belongs to same org.
    - If not found, return 400 `"assigned_to user is not a member of this organization"`.
    - Use `body.assigned_to` as `assignedTo`.
  - If admin/owner/superAdmin and `body.assigned_to` is NOT provided: default to `Number(session.user.id)` (self-assign).
- Pass `assignedTo` to `createLegalCase(...)`.

### 2. `src/app/api/legal-hub/cases/[id]/route.ts` (PATCH)

**PATCH handler changes:**
- Add `getOrgMemberRecord` to import from `@/lib/db-imports`.
- Add `"assigned_to"` to the `allowedKeys` array.
- Before the allowlist loop, check: if `body.assigned_to !== undefined`:
  - If `session.user.orgRole === 'member'` and not `isSuperAdmin`: return 403 `"Members cannot change case assignment"`.
  - Validate `body.assigned_to` is a number.
  - Call `getOrgMemberRecord(orgId, body.assigned_to)` to confirm user belongs to same org.
  - If not found, return 400 `"assigned_to user is not a member of this organization"`.
- The `assigned_to` field then flows through the existing allowlist loop into `fields` and gets passed to `updateLegalCase`.

## Risks / Trade-offs

- **Race condition on org membership validation:** A user could be removed from the org between validation and case creation. This is acceptable for now (low probability, would produce a valid FK reference to a now-removed member).
- **No change to GET /api/legal-hub/cases/[id]:** The single-case GET endpoint does not add member-level access control (a member could fetch any case by ID if they know it). This is consistent with the plan scope -- the filtering gate is at the list level.

## Success Criteria Mapping

1. Member GET receives only their cases -- handled by passing `userId`/`orgRole` to `getLegalCases`
2. Admin GET receives all org cases -- `getLegalCases` only filters when `orgRole === 'member'`
3. POST as member auto-assigns -- force `assignedTo = session.user.id`
4. POST as admin with `assigned_to` -- validate membership, pass to `createLegalCase`
5. PATCH with `assigned_to` as admin -- allowed through allowlist + org validation
6. PATCH with `assigned_to` as member -- early 403 before allowlist processing
