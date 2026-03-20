# Task 3 Plan -- Invite UI on Members Page

## Overview

Add invite creation form and pending invites table to the existing members page. This is purely frontend -- all API endpoints exist from Task 1.

## File to Modify

- `src/app/(app)/org/members/page.tsx` -- single file, add invite form + pending invites table

## Changes

### 1. New State Variables

Add to `MembersPage`:
- `inviteEmail: string` -- email input value
- `inviteRole: string` -- role select value (default "member")
- `inviteLoading: boolean` -- form submission loading state
- `inviteResult: { inviteUrl: string } | null` -- last generated invite link (shown inline)
- `pendingInvites: PendingInvite[]` -- fetched from GET /api/org/invites
- `revokingToken: string | null` -- tracks which invite is being revoked

### 2. New Interface

```typescript
interface PendingInvite {
  token: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}
```

### 3. Data Loading

Extend existing `loadMembers` callback (or create a parallel `loadInvites`) to also call `GET /api/org/invites` when `canManage` is true. Both fetches happen on mount. The invite fetch is gated on `canManage` so members never see 403 errors in console.

Actually, since `canManage` depends on `sessionData` which may not be available on first render, I will create a separate `loadInvites` function that is called in a useEffect that depends on `canManage`.

### 4. Invite Creation Section (above pending invites, below members table)

- Only rendered when `canManage` is true
- Form row: email Input + role Select (member/admin) + "Generate invite link" Button
- On submit: POST /api/org/invites with { email, role }
- On success: set `inviteResult` with the invite URL, clear email input
- On error: toast.error(data.error)
- Result block: read-only Input with invite URL + Copy button + X close button
- Copy button: `navigator.clipboard.writeText(url)` then toast.success("Link copied!")
- Result block dismisses on close button click or next invite generation

### 5. Pending Invites Section (below invite form)

- Only rendered when `canManage` is true AND `pendingInvites.length > 0`
- Heading: "Pending Invites"
- Table with columns: Email, Role (Badge with ORG_ROLE_COLORS), Expires, Actions
- Expires column: relative time helper function (e.g., "Expires in 3 days", "Expires tomorrow", "Expires in 5 hours")
- Actions: "Revoke" button wrapped in AlertDialog for confirmation
- On revoke confirm: DELETE /api/org/invites/{token}, refresh invite list, toast.success("Invite revoked")

### 6. New Imports

- `Input` from `@/components/ui/input`
- `Mail`, `Link`, `Copy`, `X`, `Clock` from `lucide-react` (individual imports)

### 7. Helper Function

`formatRelativeExpiry(dateStr: string): string` -- calculates days/hours until expiry and returns human-readable string.

## Success Criteria Mapping

- Invite form visible to owners/admins: gated on `canManage` (orgRole === "owner" || "admin")
- Hidden from members: `canManage` is false for members, form not rendered
- Submitting valid email+role generates link: POST /api/org/invites, show inline result
- Copy button copies URL: navigator.clipboard.writeText + toast
- Re-submitting same email: API handles re-invite (revokes old), UI shows new link
- Pending invites table: fetched on load, rendered as table
- Revoking invite: AlertDialog confirmation, DELETE call, refresh list, toast
- 403 for member session: API enforces, UI hides form (no direct test needed in UI code)

## Risks

- `sessionData` may be null on initial render -- `canManage` must be derived safely with optional chaining (already done in existing code)
- `navigator.clipboard.writeText` may fail in non-secure contexts -- wrap in try/catch, fall back to toast.error
