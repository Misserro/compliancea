# Task 2 Implementation Notes -- Invite Acceptance Flow

## Changes Made

### middleware.ts (MODIFIED)
- Added `invite` to the middleware matcher negative lookahead exclusion pattern.
- Before: `/((?!api/auth|api/invites|login|register|_next/static|_next/image|favicon\\.ico).*)`
- After: `/((?!api/auth|api/invites|login|register|invite|_next/static|_next/image|favicon\\.ico).*)`
- This ensures `/invite/*` pages are not blocked by middleware auth.

### auth.config.ts (MODIFIED)
- Updated `authorized` callback to explicitly allow `/invite` paths without auth.
- Changed from `authorized({ auth }) { return !!auth?.user; }` to path-aware callback that returns `true` for `pathname.startsWith("/invite")`.
- Defense-in-depth: even though the middleware matcher excludes `/invite`, this ensures the authorized callback also allows it.

### src/app/api/invites/[token]/route.ts (MODIFIED -- added POST handler)
- Added imports: `auth`, `getOrgMemberRecord`, `addOrgMember`, `acceptOrgInvite`, `saveDb`, `logAction`.
- **POST handler** (auth required):
  1. Auth gate: `auth()` + 401 check
  2. `ensureDb()`
  3. `getOrgInviteByToken(token)` -- validates not null (404), not accepted (409), not expired (410)
  4. `getOrgMemberRecord(invite.orgId, userId)` -- checks already-member (409)
  5. `addOrgMember(invite.orgId, userId, invite.role, null)` -- enroll (invitedBy is null since org_invites does not track who created the invite)
  6. `acceptOrgInvite(token)` -- mark accepted
  7. `saveDb()` -- BEFORE logAction (critical pattern)
  8. `logAction(...)` -- audit trail
  9. Returns `{ orgId, orgName, role }`
- Existing GET handler unchanged.

### src/app/invite/[token]/page.tsx (NEW)
- Server component outside `(app)` route group (public access).
- Reads token from params, calls `ensureDb()` + `getOrgInviteByToken(token)` directly.
- Renders 4 states: not found, already accepted, expired, valid.
- For valid invite: delegates to `InviteAcceptClient` client component.

### src/app/invite/[token]/invite-accept-client.tsx (NEW)
- Client component (`"use client"`).
- Uses `useSession()` to detect authenticated state.
- **Logged-in user**: auto-triggers `POST /api/invites/[token]/accept` via `useEffect` (with ref guard to prevent double-fire). On success: `update({ switchToOrgId })` to switch session, then `router.push("/dashboard")`. Handles 409 "already member" by redirecting to dashboard gracefully.
- **Logged-out user**: renders invite details card (org name, role badge, expiry) with two CTA buttons: "Log in to accept" and "Create account" (both pass `?invite={token}`).
- Shows loading, accepting, and error states.

### src/app/(auth)/login/page.tsx (MODIFIED)
- Split into `LoginForm` (inner, uses `useSearchParams()`) + `LoginPage` (outer, wraps in `<Suspense>`).
- `LoginForm` reads `?invite=TOKEN` from search params.
- If invite present: stores in `sessionStorage.pendingInviteToken` via `useEffect`; shows banner "You've been invited to join an organization. Log in to accept."
- After successful login: checks `sessionStorage.pendingInviteToken`; if present, redirects to `/invite/${token}` instead of `/dashboard`.
- Register link preserves invite token: `/register?invite=${token}`.

### src/app/(auth)/register/page.tsx (MODIFIED)
- Same Suspense boundary pattern as login page.
- Split into `RegisterForm` + `RegisterPage`.
- If invite present: fetches `GET /api/invites/[token]` to pre-fill email and show org name in banner.
- Stores token in `sessionStorage.pendingInviteToken`.
- Shows banner: "You've been invited to join {orgName}. Create an account to accept."
- After successful registration + auto-login: redirects to `/invite/${token}` if pending token exists.
- Login link preserves invite token.

## INTEGRATION Notes for Tasks 3 and 4

- **Task 3:** No interaction -- Task 3 modifies the org/members page UI, does not touch any files modified here.
- **Task 4:** The JWT callback in `src/auth.ts` already supports `trigger: "update"` with `session.switchToOrgId` (from Task 4). The invite acceptance client component calls `update({ switchToOrgId: result.orgId })` which relies on this mechanism. Task 4 must be complete for the session switch to work correctly after acceptance.

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors.
