# Plan 028: Org Member Invite Flow

> Execute: /uc:plan-execution 028

## Objective

Enable org owners and admins to invite users by sharing a generated link (copy-link flow — no email infrastructure required). New and existing users follow the link, log in or register, and are automatically enrolled in the inviting org with the specified role. Users who belong to multiple orgs can switch between them via a sidebar dropdown without re-logging in.

## Context

- [Architecture Overview](../../technology/architecture/overview.md) — multi-tenancy model, JWT org context
- [Database Schema](../../technology/architecture/database-schema.md) — org_invites table definition (Plan 027)
- [Auth Standard](../../technology/standards/authentication-authorization.md) — JWT/session patterns
- [REST API Standard](../../technology/standards/rest-api.md) — route conventions
- [Design System](../../technology/standards/design-system.md) — component conventions
- [Plan 027 — Org Foundation](../027-org-foundation/) — org tables, auth context, member management (prerequisite)
- Followed by: Plan 029 (Storage Layer)

## Tech Stack

- **sql.js** — SQLite in-process; new invite functions follow existing query/run/get wrapper pattern
- **NextAuth v5** — `useSession().update()` for session mutation (org switch); JWT `trigger: "update"` callback
- **Next.js App Router** — new public route `/invite/[token]` outside `(app)` group; middleware exclusion
- **React / Shadcn UI** — DropdownMenu for org switcher, copy-to-clipboard for invite links, pending invites table

## Scope

### In Scope
- `createOrgInvite`, `getOrgInviteByToken`, `listOrgInvites`, `acceptOrgInvite`, `revokeOrgInvite` DB functions
- `getAllOrgMembershipsForUser`, `getOrgMemberForOrg` DB functions (for multi-org support)
- `POST /api/org/invites` — create invite (owner/admin); `GET /api/org/invites` — list pending; `DELETE /api/org/invites/[token]` — revoke
- `GET /api/invites/[token]` — public token validation (org name, role, expiry status)
- `POST /api/invites/[token]/accept` — authenticated acceptance endpoint
- `/invite/[token]` public landing page (outside `(app)` route group)
- Login and register pages: invite token awareness (preserve token across auth redirect)
- Invite UI on `/org/members`: invite form, copy-link display, pending invites table with revoke
- `POST /api/org/switch` — switch active org in JWT session
- Sidebar org switcher dropdown (shown only when user has 2+ org memberships)
- `src/auth.ts` JWT callback fix: persist `token.orgId` across requests; handle `trigger: "update"` for org switch
- Middleware: add `/invite/` to public route exclusions

### Out of Scope
- Email delivery (copy-link only)
- Invite acceptance without authentication (anonymous acceptance)
- Org creation UI (default org is sufficient; new orgs via DB)
- Bulk invite (one email at a time)
- Invite analytics / tracking

## Success Criteria

- [ ] Owner/admin can generate an invite link for a specific email + role from the members page
- [ ] Invite link is displayed with a copy-to-clipboard button; copying works
- [ ] Pending invites are listed on the members page with email, role, expiry, and revoke button
- [ ] Revoking a pending invite makes the token invalid immediately
- [ ] Re-inviting the same email revokes the old token and generates a new one
- [ ] `/invite/[token]` page is publicly accessible (no login required) and shows org name, role, and expiry status
- [ ] An expired or already-accepted token shows a clear error on the landing page
- [ ] Logged-in user clicking the invite link is enrolled in the org with the correct role and session switches to the new org
- [ ] Logged-out user clicking the invite link is redirected to `/login?invite=TOKEN`; after login the invite is consumed and the user is enrolled
- [ ] New user clicking the invite link can register; after registration the invite is consumed and the user is enrolled with the invited role (not the default `member` in default org)
- [ ] Sidebar shows org switcher dropdown when user belongs to 2+ orgs
- [ ] Switching org updates session `orgId`/`orgRole`/`orgName` without re-login; page reflects new org immediately
- [ ] Single-org users see a static org name (no dropdown) — no regression

---

## Tasks

### Task 1: Invite DB Layer and API Routes

**Description:**

**DB layer (`lib/db.js`):**

Add the following functions:

```javascript
// Create invite — generate token, set expires_at = now + 7 days
// If a pending (non-accepted, non-expired) invite for the same email+org exists, revoke it first
createOrgInvite(orgId, email, role)
  → { token, orgId, email, role, expiresAt }

// Look up invite by token — JOIN to organizations to return orgName
getOrgInviteByToken(token)
  → { token, orgId, orgName, email, role, expiresAt, acceptedAt } | null

// List all pending (accepted_at IS NULL AND expires_at > NOW) invites for an org
listOrgInvites(orgId)
  → [{ token, email, role, expiresAt, createdAt }]

// Mark accepted_at = CURRENT_TIMESTAMP
acceptOrgInvite(token)

// Delete invite row (revoke)
revokeOrgInvite(token)

// Return all org memberships for a user — JOIN organizations to include org name
getAllOrgMembershipsForUser(userId)
  → [{ orgId, orgName, orgSlug, role, joinedAt }]

// Return membership for a specific user+org pair (used in JWT callback for org switch)
getOrgMemberForOrg(userId, orgId)
  → { orgId, orgName, role } | null
```

Update `lib/db.d.ts` and `src/lib/db-imports.ts` with all 7 new function signatures.

**API routes:**

`POST /api/org/invites` — create invite (owner/admin only):
- Validate `email` (non-empty, valid format) and `role` (must be `member` or `admin`)
- Call `createOrgInvite(orgId, email, role)` — auto-revokes pending invite for same email+org
- Return `{ token, inviteUrl: \`${process.env.NEXTAUTH_URL}/invite/${token}\`, email, role, expiresAt }`
- Status: 201

`GET /api/org/invites` — list pending invites (owner/admin only):
- Call `listOrgInvites(orgId)`
- Return `{ invites: [...] }`

`DELETE /api/org/invites/[token]` — revoke invite (owner/admin only):
- Verify invite belongs to caller's org (`getOrgInviteByToken` — check orgId matches)
- Call `revokeOrgInvite(token)`
- Return 204

`GET /api/invites/[token]` — **PUBLIC** (no auth required):
- Call `getOrgInviteByToken(token)`
- If token not found: return `{ valid: false, reason: "not_found" }`
- If `acceptedAt` is set: return `{ valid: false, reason: "already_accepted" }`
- If `expiresAt < now`: return `{ valid: false, reason: "expired" }`
- Return `{ valid: true, orgName, role, email, expiresAt }`
- This route must be excluded from the NextAuth middleware (public access)

**Files:**
- `lib/db.js` — 7 new functions
- `lib/db.d.ts` — type declarations
- `src/lib/db-imports.ts` — re-exports
- `src/app/api/org/invites/route.ts` — new
- `src/app/api/org/invites/[token]/route.ts` — new (DELETE)
- `src/app/api/invites/[token]/route.ts` — new (public GET)

**Patterns:**
- `documentation/technology/standards/database.md` (query wrappers, parameterized queries, three-step bridge)
- `documentation/technology/standards/authentication-authorization.md` (auth guard, role checks)
- `documentation/technology/standards/rest-api.md` (201 on create, saveDb after mutation, logAction)

**Success Criteria:**
- `POST /api/org/invites` with owner session returns `{ token, inviteUrl, email, role, expiresAt }` with status 201
- `POST /api/org/invites` with the same email a second time revokes the old token first (only one pending invite per email per org)
- `POST /api/org/invites` with a `member` session returns 403
- `GET /api/org/invites` returns only pending (non-accepted, non-expired) invites for the caller's org
- `DELETE /api/org/invites/[token]` removes the invite; subsequent `GET /api/invites/[token]` returns `valid: false, reason: "not_found"`
- `GET /api/invites/[token]` requires no authentication and returns org name, role, expiry for valid tokens
- Expired or accepted tokens return `valid: false` with the correct `reason`

**Dependencies:** None

---

### Task 2: Invite Acceptance Flow

**Description:**

**Public invite landing page (`src/app/invite/[token]/page.tsx`):**

Server component (no auth required). Calls `GET /api/invites/[token]` internally or reads DB directly.

States to render:
- **Valid invite**: org name, role badge, expiry countdown. Two CTA buttons: "Log in to accept" → `/login?invite={token}` and "Create account" → `/register?invite={token}`
- **Already accepted**: "This invite has already been used."
- **Expired**: "This invite has expired. Ask your admin to resend the invite."
- **Not found / revoked**: "This invite link is invalid or has been revoked."

This page must be **outside the `(app)` route group** (place at `src/app/invite/[token]/page.tsx`).

**Middleware update (`middleware.ts`):**

Add `/invite/` to the public route exclusions in the matcher pattern:
```
/((?!api/auth|api/invites|login|register|invite|_next/static|_next/image|favicon\.ico).*)
```

**Invite acceptance API (`POST /api/invites/[token]/accept`):**

Auth required (any logged-in user). Logic:
1. `getOrgInviteByToken(token)` — validate: not null, not accepted, not expired
2. Check user is NOT already a member of the invited org
3. `addOrgMember(invite.orgId, session.user.id, invite.role, session.user.id)` (invitedBy = acceptor)
4. `acceptOrgInvite(token)` — mark accepted_at
5. `logAction("org_invite", invite.orgId, "accepted", { email: invite.email, role: invite.role }, session.user.id, invite.orgId)`
6. `saveDb()`
7. Return `{ orgId: invite.orgId, orgName, role: invite.role }` — client will call `updateSession` to switch

If user is already a member: return 409 with `{ error: "Already a member of this organization" }`

**Login page invite awareness (`src/app/(auth)/login/page.tsx`):**
- Read `?invite=TOKEN` from `useSearchParams()`
- If present: store token in `sessionStorage` as `pendingInviteToken`
- Show a subtle banner: "You've been invited to join an organization. Log in to accept."
- After successful login: if `sessionStorage.pendingInviteToken` exists, redirect to `/invite/${token}` instead of `/dashboard`

**Register page invite awareness (`src/app/(auth)/register/page.tsx` or equivalent):**
- Read `?invite=TOKEN` from `useSearchParams()`
- If present: pre-fill email field (from `GET /api/invites/[token]`), show invite context banner
- Store token in `sessionStorage` as `pendingInviteToken`
- After successful registration: redirect to `/invite/${token}` for acceptance

**Invite landing page client-side acceptance (`src/app/invite/[token]/page.tsx` — client part):**

After the user is authenticated (use `useSession()`), auto-trigger acceptance:
- If `session.user` exists and invite is valid: automatically call `POST /api/invites/[token]/accept`
- On success: call `await update({ switchToOrgId: result.orgId })` to switch session to new org
- Then `router.push("/dashboard")`
- Clear `pendingInviteToken` from sessionStorage

**Files:**
- `src/app/invite/[token]/page.tsx` — new public landing page
- `src/app/api/invites/[token]/route.ts` — add `POST` handler (GET exists from Task 1)
- `src/app/(auth)/login/page.tsx` — invite token awareness
- `src/app/(auth)/register/page.tsx` — invite token awareness (if register page exists at this path; executor must verify)
- `middleware.ts` — add `/invite/` to public matcher exclusions
- `auth.config.ts` — add `/invite/` to authorized callback exclusions

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (auth guard on accept endpoint)
- `documentation/technology/standards/rest-api.md` (409 for conflict, 201 on enrollment)
- `documentation/technology/standards/design-system.md` (Shadcn Badge, Button, Card components)

**Success Criteria:**
- `/invite/{validToken}` is publicly accessible without auth and shows org name + role
- `/invite/{expiredToken}` shows "This invite has expired" message
- `/invite/{acceptedToken}` shows "This invite has already been used" message
- A logged-in user visiting `/invite/{validToken}` is automatically enrolled without clicking anything; session switches to the new org and user lands on `/dashboard`
- A logged-out user visiting `/invite/{validToken}` clicking "Log in to accept" lands on the login page with an invite context banner; after login they are redirected back to `/invite/{token}` and enrolled
- `POST /api/invites/[token]/accept` called a second time returns 409 "Already a member"
- The middleware does not block unauthenticated access to `/invite/*`

**Dependencies:** Task 1

---

### Task 3: Invite UI on Members Page

**Description:**

Update `src/app/(app)/org/members/page.tsx` to add invite management UI. This task is purely frontend (all API endpoints exist from Task 1).

**Invite creation section** (above or below the members table):
- Visible to owners and admins only (check `session.user.orgRole`)
- Form: email text input + role select (`member` / `admin`, defaulting to `member`) + "Generate invite link" button
- On submit: `POST /api/org/invites` with `{ email, role }`
- On success: show an inline result block with:
  - The invite URL in a read-only input
  - A copy-to-clipboard button (use `navigator.clipboard.writeText`)
  - "Link copied!" toast on success
  - The result block dismisses on next invite or on close button
- On error (e.g. 403, 400): show `toast.error(data.error)`

**Pending invites section** (separate table below active members):
- Heading: "Pending Invites" — only shown when there are pending invites
- Fetched via `GET /api/org/invites` on page load alongside active members
- Table columns: Email, Role (badge), Expires, Actions
- Expires column: show relative time ("Expires in 3 days" / "Expires tomorrow")
- Actions: "Revoke" button with `AlertDialog` confirmation ("Are you sure you want to revoke this invite?")
- On revoke: `DELETE /api/org/invites/{token}`, refresh list, show `toast.success("Invite revoked")`
- If invite list is empty: no section rendered (no empty state needed)

**Files:**
- `src/app/(app)/org/members/page.tsx` — add invite form + copy link + pending invites table

**Patterns:**
- `documentation/technology/standards/design-system.md` (AlertDialog for destructive, cn(), Shadcn Table, Input, Select, Button)
- `documentation/technology/standards/rest-api.md` (error handling, toast feedback)

**Success Criteria:**
- Invite form is visible to owners and admins, hidden from members
- Submitting a valid email + role generates a link displayed inline with a copy button
- Clicking "Copy" copies the URL and shows "Link copied!" toast
- Re-submitting with the same email (re-invite) succeeds and shows a new link
- Pending invites table lists all pending invites for the org
- Revoking an invite removes it from the list and shows a confirmation toast
- `POST /api/org/invites` with a member session returns 403 (no form shown, but test API directly)

**Dependencies:** Task 1

---

### Task 4: Org Switcher

**Description:**

**JWT callback fix (`src/auth.ts`):**

The current subsequent-requests branch always calls `getOrgMemberByUserId(userId)` which returns the **first** org membership. This overwrites any previous switch on the next request.

Fix: change the branch to use `token.orgId` when it is already set (re-fetch that specific org's membership), and fall back to the first org only if `token.orgId` is not set. Also handle `trigger === "update"` for explicit org switching:

```typescript
} else if (token.id) {
  let membership;
  if (trigger === "update" && session?.switchToOrgId) {
    // Explicit org switch request
    membership = getOrgMemberForOrg(Number(token.id), Number(session.switchToOrgId));
  } else if (token.orgId) {
    // Re-fetch current active org (preserves chosen org across requests)
    membership = getOrgMemberForOrg(Number(token.id), Number(token.orgId));
    // If removed from org, fall back to first org
    if (!membership) membership = getOrgMemberByUserId(Number(token.id));
  } else {
    // No org set yet — pick first
    membership = getOrgMemberByUserId(Number(token.id));
  }
  if (membership) {
    token.orgId   = String(membership.org_id);
    token.orgRole = membership.role;
    token.orgName = membership.org_name;
  }
}
```

**Org switch API (`POST /api/org/switch`):**

Auth required. Body: `{ targetOrgId: number }`.
1. Validate `targetOrgId` is a number
2. `getOrgMemberForOrg(session.user.id, targetOrgId)` — verify user is a member
3. If not member: 403 `{ error: "Not a member of this organization" }`
4. Return `{ success: true }` — the actual session update is triggered client-side via `useSession().update()`

Note: The client calls `useSession().update({ switchToOrgId: targetOrgId })` which triggers the JWT callback with `trigger: "update"`, no server-side session write needed.

**Sidebar org switcher (`src/components/layout/app-sidebar.tsx`):**

Replace the static `<h1>{orgName}</h1>` in `SidebarHeader` with a conditional component:
- Fetch user's org memberships from `GET /api/org/memberships` (new endpoint below) on mount
- If user has only 1 org: render static `<h1>{orgName}</h1>` (existing behaviour, no regression)
- If user has 2+ orgs: render a `DropdownMenu`:
  - Trigger: current `orgName` + chevron-down icon
  - Menu items: all orgs the user belongs to; current org shown with a checkmark
  - Clicking a different org: call `await update({ switchToOrgId: targetOrgId })` (from `useSession`)
  - After update resolves: `router.refresh()` to reload page data with new org context
  - Loading state: disable the trigger during the switch (prevent double-click)

**New API endpoint (`GET /api/org/memberships`):**

Returns all orgs the current user belongs to.
- Call `getAllOrgMembershipsForUser(session.user.id)`
- Return `{ memberships: [{ orgId, orgName, orgSlug, role }] }`

**Files:**
- `lib/db.js` — `getAllOrgMembershipsForUser(userId)` and `getOrgMemberForOrg(userId, orgId)` (may overlap with Task 1 — executor must check)
- `lib/db.d.ts` + `src/lib/db-imports.ts` — declarations and re-exports
- `src/auth.ts` — JWT callback fix (subsequent-requests branch + trigger === "update" handling)
- `src/app/api/org/switch/route.ts` — new POST endpoint
- `src/app/api/org/memberships/route.ts` — new GET endpoint
- `src/components/layout/app-sidebar.tsx` — conditional static vs switcher dropdown

**Patterns:**
- `documentation/technology/standards/authentication-authorization.md` (JWT callback patterns, updateSession)
- `documentation/technology/standards/design-system.md` (DropdownMenu, loading states)
- `documentation/technology/standards/rest-api.md` (auth guard, ensureDb)

**Success Criteria:**
- Single-org user: sidebar shows static org name, no dropdown — behaviour unchanged from Plan 027
- Multi-org user: sidebar shows org name with a dropdown listing all their orgs; current org has a checkmark
- Clicking a different org in the dropdown switches the session; subsequent page loads show data from the new org
- After switching, `session.user.orgId`, `session.user.orgRole`, and `session.user.orgName` all reflect the new org
- If a user is removed from their active org (session has stale orgId), the next request falls back to their first remaining org (not a 500)
- `POST /api/org/switch` with a `targetOrgId` the user is not a member of returns 403
- `GET /api/org/memberships` returns all orgs for the authenticated user

**Dependencies:** None (independent of invite flow; can parallel with Task 1)

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Updated | Added organizations, org_members, org_invites table definitions (Plan 027 tables now canonical) |
| `documentation/product/requirements/features.md` | Updated | Added Organization Management section: multi-tenancy, member management, invite flow, org switcher |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| JWT callback change breaks existing single-org sessions | Medium | High | The `token.orgId` guard (`if (token.orgId) use it, else first org`) is backward-compatible; existing tokens have `orgId` set, so they re-fetch the same org as before |
| Invite token guessability | Low | High | Use `crypto.randomUUID()` — 122 bits of entropy, unguessable |
| Accept endpoint called by wrong user | Low | Medium | Token is the sole auth factor; token is unguessable and single-use — acceptable security model for copy-link flow |
| Register page path unknown | Low | Medium | Executor must verify path at exploration time; Task 2 success criteria cover the behavior regardless of path |
| Sidebar switcher causes infinite re-renders | Low | Medium | `useEffect` dependency array must include only stable refs; `update()` is async, use `isPending` state to prevent double-clicks |
| `getAllOrgMembershipsForUser` overlap between Task 1 and Task 4 | Medium | Low | Both tasks specify this function; executor of whichever runs first creates it; the second executor must check and skip if already present |
