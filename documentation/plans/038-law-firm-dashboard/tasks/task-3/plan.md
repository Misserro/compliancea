# Task 3 Plan -- Firm stats API + lawyer profile update API

## Overview
Create two new API endpoints and two new db.js helper functions:
1. `GET /api/legal-hub/firm-stats` -- admin/owner only, returns case stats + member roster
2. `PATCH /api/org/members/profile` -- members update own profile, admins update any member's

## Files to Create/Modify

### 1. `lib/db.js` -- add two new functions (append at end of file, after `deleteWizardBlueprint`)

**`getFirmStats(orgId)`**
Returns an object with three properties:
- `statsByStatus`: `query()` on `legal_cases` with `GROUP BY status` and `WHERE org_id = ?`
- `finalizedLast30Days`: `get()` counting cases with `status IN ('closed', 'archived') AND updated_at >= datetime('now', '-30 days') AND org_id = ?`
- `members`: `query()` joining `org_members` + `users` + LEFT JOIN subquery counting `legal_cases.assigned_to` per user. Returns `user_id, name, email, role, first_name, last_name, phone, specialization, bar_registration_number, assigned_case_count`.

**`updateMemberProfile(orgId, userId, fields)`**
- Allowlist: `first_name`, `last_name`, `phone`, `specialization`, `bar_registration_number`
- Validates target user belongs to org: `get()` check on `org_members WHERE org_id = ? AND user_id = ?`
- If not found, return `null` (caller handles 404/403)
- Builds dynamic SET clause (same pattern as `updateLegalCase`) and runs `UPDATE org_members SET ... WHERE org_id = ? AND user_id = ?`

### 2. `lib/db.d.ts` -- add TypeScript declarations for both new functions

Append at end of file with a section comment:
```ts
// Law Firm Dashboard (Plan 038 Task 3)
export function getFirmStats(...args: any[]): any;
export function updateMemberProfile(...args: any[]): any;
```
Follows existing pattern: `(...args: any[]): any;` with plan/task section comment.

### 3. `src/lib/db-imports.ts` -- add exports for `getFirmStats` and `updateMemberProfile`

Append to the export list.

### 4. `src/app/api/legal-hub/firm-stats/route.ts` (new file)

Pattern: follows `src/app/api/legal-hub/cases/route.ts` structure exactly.

```
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getFirmStats } from "@/lib/db-imports";
```

**GET handler:**
1. `auth()` -- 401 if no session
2. Admin/owner check: `session.user.orgRole === 'member' && !session.user.isSuperAdmin` -> 403
3. `await ensureDb()`
4. `const orgId = Number(session.user.orgId)` -- 404 if falsy
5. `try/catch`: call `getFirmStats(orgId)`, return JSON
6. Error: 500 with message

### 5. `src/app/api/org/members/profile/route.ts` (new file)

Pattern: follows `src/app/api/org/members/route.ts` structure.

```
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { updateMemberProfile } from "@/lib/db-imports";
```

**PATCH handler:**
1. `auth()` -- 401 if no session
2. `await ensureDb()`
3. Parse body: extract `target_user_id` and profile fields
4. Determine target: if `target_user_id` provided and differs from session user -> must be admin/owner (403 for members)
5. If no `target_user_id`, target is `session.user.id`
6. Validate profile fields are strings or null (400 if invalid)
7. Call `updateMemberProfile(orgId, targetUserId, fields)` -- if returns null, 404
8. Return 200 with updated result

## Success Criteria Mapping

| Criterion | How satisfied |
|-----------|---------------|
| firm-stats returns statsByStatus, finalizedLast30Days, members | getFirmStats builds all three queries |
| 403 for members on firm-stats | Admin check before ensureDb |
| PATCH updates own profile for member | Default target is session.user.id |
| PATCH updates any member for admin | Admin can provide target_user_id |
| 403 when member targets another user | Check target_user_id != session.user.id when orgRole is member |

## Risks

- Task 1 migration must be complete (profile columns on org_members, assigned_to on legal_cases). Confirmed from Task 1 impl.md.
- No collision with Task 2: we add only NEW functions (`getFirmStats`, `updateMemberProfile`) and do NOT touch `getLegalCases`, `createLegalCase`, or `updateLegalCase`.
