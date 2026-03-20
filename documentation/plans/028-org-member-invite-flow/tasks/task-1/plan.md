# Task 1 Plan -- Invite DB Layer and API Routes

## Overview

Add 7 invite/membership DB functions to `lib/db.js` and create 4 API route files for invite management.

## Files to Modify

### 1. `lib/db.js` -- 7 new exported functions (append after `countOrgMembers`)

- **`createOrgInvite(orgId, email, role)`** -- DELETE any pending (non-accepted, non-expired) invite for same email+org first, then INSERT with `crypto.randomUUID()` token and `datetime('now', '+7 days')` expires_at. Return `{ token, orgId, email, role, expiresAt }`.
- **`getOrgInviteByToken(token)`** -- SELECT with JOIN to organizations. Return `{ token, orgId, orgName, email, role, expiresAt, acceptedAt }` or null.
- **`listOrgInvites(orgId)`** -- SELECT WHERE `org_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')` ORDER BY `expires_at ASC`. Return `[{ token, email, role, expiresAt }]`.
- **`acceptOrgInvite(token)`** -- UPDATE SET `accepted_at = CURRENT_TIMESTAMP` WHERE `token = ?`.
- **`revokeOrgInvite(token)`** -- DELETE FROM org_invites WHERE `token = ?`.
- **`getAllOrgMembershipsForUser(userId)`** -- SELECT om + JOIN organizations. Return `[{ orgId, orgName, orgSlug, role, joinedAt }]`.
- **`getOrgMemberForOrg(userId, orgId)`** -- SELECT om + JOIN organizations. Return `{ orgId, orgName, orgSlug, role }` or null.

Note: `org_invites` table has no `created_at` column. The task description return type for `listOrgInvites` does not include `createdAt`, so we order by `expires_at ASC` (earliest expiring first). The README mentions `createdAt` but the concrete task spec omits it -- following the task spec.

Note: `crypto.randomUUID()` is available natively in Node 16+. Will use `const crypto = require('crypto')` since db.js is CJS -- actually db.js uses ESM (`export function`). Will use `import crypto from 'crypto'` or inline `crypto.randomUUID()`. Need to check if crypto is already imported.

### 2. `lib/db.d.ts` -- 7 new declarations (append at end)

```typescript
export function createOrgInvite(...args: any[]): any;
export function getOrgInviteByToken(...args: any[]): any;
export function listOrgInvites(...args: any[]): any;
export function acceptOrgInvite(...args: any[]): any;
export function revokeOrgInvite(...args: any[]): any;
export function getAllOrgMembershipsForUser(...args: any[]): any;
export function getOrgMemberForOrg(...args: any[]): any;
```

### 3. `src/lib/db-imports.ts` -- add 7 re-exports

### 4. `src/app/api/org/invites/route.ts` -- NEW file (POST + GET)

**POST** -- create invite:
- Auth guard (`auth()`, 401 if no session)
- Role check: `orgRole` must be `'owner'` or `'admin'` (403)
- `ensureDb()`
- Parse JSON body, validate `email` (non-empty, basic regex), `role` (must be `'member'` or `'admin'`)
- Normalize email: `email.trim().toLowerCase()`
- Call `createOrgInvite(orgId, email, role)`
- `logAction` + `saveDb()` -- note: `createOrgInvite` already calls `run()` which calls `saveDb()` internally, but the task says to call `saveDb()` explicitly. Following the pattern from existing routes.
- Return `{ token, inviteUrl, email, role, expiresAt }` with status 201

**GET** -- list pending invites:
- Auth guard + role check (owner/admin)
- `ensureDb()`
- Return `{ invites: listOrgInvites(orgId) }`

### 5. `src/app/api/org/invites/[token]/route.ts` -- NEW file (DELETE)

- Auth guard + role check (owner/admin)
- `ensureDb()`
- `getOrgInviteByToken(token)` -- verify `invite.orgId === Number(session.user.orgId)` (404 if mismatch or not found)
- `revokeOrgInvite(token)`
- `logAction` + `saveDb()`
- Return 204

### 6. `src/app/api/invites/[token]/route.ts` -- NEW file (GET, public)

- NO auth required
- `ensureDb()`
- `getOrgInviteByToken(token)`
- If null: `{ valid: false, reason: "not_found" }`
- If acceptedAt set: `{ valid: false, reason: "already_accepted" }`
- If expiresAt < now: `{ valid: false, reason: "expired" }`
- Otherwise: `{ valid: true, orgName, role, email, expiresAt }`

## Risks and Trade-offs

1. **`run()` auto-saves** -- The `run()` wrapper already calls `saveDb()`. Calling `saveDb()` again in the route is redundant but harmless and consistent with existing patterns (e.g., `org/members/[id]/route.ts`).
2. **No `created_at` on `org_invites`** -- The table schema from Plan 027 omits this column. We follow the task spec which also omits it from the return type.
3. **`crypto.randomUUID()`** -- db.js uses ESM. We'll import from `node:crypto`. Need to verify this works in the existing module setup.
4. **Expiry comparison** -- SQLite `datetime('now')` is UTC. `expires_at` is set using `datetime('now', '+7 days')` which is also UTC. Comparison is consistent.

## Success Criteria Mapping

- POST returns 201 with correct shape -- handled in route POST handler
- Re-invite revokes old -- handled in `createOrgInvite` DELETE before INSERT
- Member session gets 403 -- handled by role check
- GET returns only pending -- handled by WHERE clause in `listOrgInvites`
- DELETE + subsequent GET returns not_found -- handled by DELETE + public GET
- Public GET no auth -- separate route file with no auth guard
- Expired/accepted tokens return correct reason -- handled by conditional checks in public GET
