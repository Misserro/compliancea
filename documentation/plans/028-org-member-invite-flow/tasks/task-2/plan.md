# Task 2 Plan -- Invite Acceptance Flow

## Files to Create/Modify

### 1. `src/app/invite/[token]/page.tsx` (NEW)
Public invite landing page, placed outside `(app)` route group.

- **Server component** (`InvitePageServer`) that reads token from params and calls `getOrgInviteByToken(token)` directly from DB (not via API fetch -- same process, more efficient). Uses `ensureDb()`.
- Renders 4 states:
  - **Valid invite (not logged in):** Card with org name, role Badge, expiry date. Two buttons: "Log in to accept" -> `/login?invite={token}`, "Create account" -> `/register?invite={token}`.
  - **Already accepted:** "This invite has already been used."
  - **Expired:** "This invite has expired. Ask your admin to resend the invite."
  - **Not found/revoked:** "This invite link is invalid or has been revoked."
- **Client component** (`InviteAcceptClient`) embedded inside the page for logged-in user auto-acceptance:
  - Uses `useSession()` to detect logged-in state.
  - If `session.user` exists and invite is valid: auto-calls `POST /api/invites/[token]/accept`.
  - On success: calls `await update({ switchToOrgId: result.orgId })`, clears `sessionStorage.pendingInviteToken`, then `router.push("/dashboard")`.
  - Shows loading state during acceptance.
  - On error (409 already member, etc.): shows error message.
- Layout: uses same centered layout pattern as `src/app/no-org/page.tsx` (`flex min-h-screen items-center justify-center bg-background`).

### 2. `src/app/api/invites/[token]/route.ts` (MODIFY -- add POST handler)
File already exists with GET handler from Task 1. Add POST handler for acceptance.

- Auth required: `auth()` + 401 check.
- `ensureDb()`.
- `getOrgInviteByToken(token)` -- validate not null (404), not accepted (409 "already_accepted"), not expired (410 "expired").
- Check user not already member: `getOrgMemberRecord(invite.orgId, Number(session.user.id))` -- if exists, return 409 "Already a member of this organization".
- `addOrgMember(invite.orgId, Number(session.user.id), invite.role, Number(session.user.id))`.
- `acceptOrgInvite(token)`.
- `saveDb()` -- BEFORE logAction (critical pattern from lead notes).
- `logAction("org_invite", null, "accepted", { email: invite.email, role: invite.role, token }, { userId: Number(session.user.id), orgId: invite.orgId })`.
- Return `{ orgId: invite.orgId, orgName: invite.orgName, role: invite.role }`.

### 3. `src/app/(auth)/login/page.tsx` (MODIFY)
Add invite token awareness.

- Add `useSearchParams()` import (from `next/navigation`). Wrap the component that uses it in a Suspense boundary.
- Split into inner `LoginForm` component (uses `useSearchParams`) + outer `LoginPage` that wraps it in `<Suspense>`.
- Read `?invite=TOKEN` from search params.
- If present: store in `sessionStorage` as `pendingInviteToken` (in a `useEffect`).
- Show banner above form: "You've been invited to join an organization. Log in to accept."
- After successful login: check `sessionStorage.getItem("pendingInviteToken")`; if present, `router.push(\`/invite/${token}\`)` instead of `/dashboard`.

### 4. `src/app/(auth)/register/page.tsx` (MODIFY)
Add invite token awareness.

- Same Suspense boundary pattern as login page.
- Split into inner `RegisterForm` + outer `RegisterPage` with `<Suspense>`.
- Read `?invite=TOKEN` from search params.
- If present: fetch `GET /api/invites/[token]` to get email, pre-fill email field.
- Store token in `sessionStorage` as `pendingInviteToken` (in `useEffect`).
- Show banner: "You've been invited to join {orgName}. Create an account to accept."
- After successful registration + auto-login: check `sessionStorage.getItem("pendingInviteToken")`; if present, `router.push(\`/invite/${token}\`)` instead of `/dashboard`.

### 5. `middleware.ts` (MODIFY)
Add `/invite` to matcher exclusions.

Current matcher: `"/((?!api/auth|api/invites|login|register|_next/static|_next/image|favicon\\.ico).*)"`
New matcher: `"/((?!api/auth|api/invites|login|register|invite|_next/static|_next/image|favicon\\.ico).*)"` (add `invite|` before `_next`)

### 6. `auth.config.ts` (MODIFY -- potentially)
Check if the `authorized` callback needs to explicitly allow `/invite/*`. Since the middleware matcher already excludes `/invite` paths, the `authorized` callback will never run for those paths, so no change needed. Verify and document this conclusion.

## Success Criteria Coverage

- `/invite/{validToken}` publicly accessible -> middleware exclusion + public page (no auth gate)
- `/invite/{expiredToken}` shows expired message -> server component checks expiresAt
- `/invite/{acceptedToken}` shows already-used message -> server component checks acceptedAt
- Logged-in user auto-enrolled -> client component with useSession + POST accept + update session
- Logged-out user redirected -> "Log in to accept" button + login page banner + sessionStorage redirect
- POST accept second time 409 -> already-member check in accept endpoint
- Middleware does not block -> `/invite` added to matcher exclusions

## Risks / Trade-offs

- **Suspense boundary requirement:** `useSearchParams()` in production requires a Suspense boundary. Splitting login/register into inner/outer components handles this cleanly.
- **Direct DB call vs API fetch in server component:** The invite landing page calls `getOrgInviteByToken` directly rather than fetching its own API. This is more efficient (same process) and follows the pattern used by other server components in this codebase.
- **saveDb BEFORE logAction:** Explicitly noted in plan -- will follow the corrected pattern from lead notes.
- **Session type safety:** `session.user.orgId` is typed as `number | undefined` in the JWT augmentation. Will use `Number()` wrapper for all DB calls.
