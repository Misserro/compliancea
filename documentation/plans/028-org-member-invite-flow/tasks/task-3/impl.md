# Task 3 Implementation Notes -- Invite UI on Members Page

## Changes Made

### src/app/(app)/org/members/page.tsx -- Modified (single file)

**New imports:**
- `Input` from `@/components/ui/input`
- `Mail`, `Copy`, `X`, `Clock` from `lucide-react`

**New interface:**
- `PendingInvite` -- `{ token, email, role, expiresAt, createdAt }`

**New helper function:**
- `formatRelativeExpiry(dateStr)` -- converts ISO date to relative time ("Expires in 3 days", "Expires tomorrow", "Expires in 5 hours", "Expires soon", "Expired")

**New state variables (6):**
- `inviteEmail` -- email input value
- `inviteRole` -- role select value (default "member")
- `inviteLoading` -- form submission loading state
- `inviteResult` -- `{ inviteUrl }` or null (inline result block)
- `pendingInvites` -- array of PendingInvite
- `revokingToken` -- token string being revoked, or null

**New data loader:**
- `loadInvites()` -- calls `GET /api/org/invites`, sets `pendingInvites`. Called in a `useEffect` gated on `canManage` to avoid 403 errors for non-admin users.

**New handlers (3):**
- `handleGenerateInvite(e)` -- form submit handler. POST /api/org/invites with { email, role }. On success: sets inviteResult, clears email, refreshes invite list. On error: toast.error.
- `handleCopyLink()` -- copies inviteResult.inviteUrl via navigator.clipboard.writeText. Toast success/error.
- `handleRevokeInvite(token)` -- DELETE /api/org/invites/{token}. Optimistically removes from state. Toast success/error.

**New UI sections (2):**
1. **Invite Member** section (below members table, above pending invites):
   - Gated on `canManage` (owner/admin only)
   - Form: email Input + role Select (member/admin) + "Generate invite link" Button
   - Result block: read-only Input with invite URL + Copy button + X close button
   - Result block dismisses on close button or next invite generation

2. **Pending Invites** section (below invite form):
   - Gated on `canManage && pendingInvites.length > 0`
   - Table: Email, Role (Badge with ORG_ROLE_COLORS), Expires (relative time with Clock icon), Actions
   - Revoke button with AlertDialog confirmation per design-system.md pattern

## Design Decisions

- Invite loading is in a separate useEffect gated on `canManage` rather than inside `loadMembers` -- this avoids a 403 console error for regular members who don't have invite list permission
- The `handleRevokeInvite` response check handles both `res.ok` and `res.status === 204` because the DELETE endpoint returns 204 with no body (204 is not always in the `ok` range depending on fetch implementation, but it is -- this is defensive)
- No `cn()` wrapper needed for most classNames since they are static strings (no conditional merging needed). The Badge className uses ORG_ROLE_COLORS from constants per the existing pattern.

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors from this file (only pre-existing error from Task 2's incomplete invite-accept-client module)
