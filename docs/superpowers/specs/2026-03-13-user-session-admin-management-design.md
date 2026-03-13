# User Session Visibility & Admin User Management

**Date:** 2026-03-13
**Status:** Approved

## Overview

Two connected features:
1. Every logged-in user sees their account info and a sign-out button in the sidebar footer.
2. Admins can view all registered users, their real-time session status, and terminate any user's session.

## Data Layer

### New table: `user_sessions`

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id           TEXT PRIMARY KEY,       -- UUID stored in the JWT
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
```

Added to `lib/db.js` alongside the existing `users` table.

**Active session** = non-revoked row with `last_seen_at` within the last 15 minutes.

### New DB helper functions (in `lib/db.js`)

- `createSession(id, userId)` — inserts a new session row
- `touchSession(id)` — updates `last_seen_at` to now
- `revokeUserSessions(userId)` — sets `revoked = 1` for all sessions of a user
- `getSessionById(id)` — returns a session row or null
- `getUsersWithSessionInfo()` — returns all users joined with their latest session data

Export all via `src/lib/db-imports.ts`.

## Auth Flow Changes

### `src/auth.ts` — JWT callback

On `trigger === "signIn"`:
- Generate a UUID (`crypto.randomUUID()`)
- Call `createSession(uuid, user.id)`
- Store `sessionId: uuid` in the JWT token

### `src/app/(app)/layout.tsx` — session guard

After `auth()` returns the session:
1. Call `ensureDb()`
2. Look up `getSessionById(session.user.sessionId)`
3. If not found or `revoked === 1` → `redirect("/login")`
4. Otherwise → call `touchSession(sessionId)` to update `last_seen_at`

Middleware is unchanged — it only validates JWT signature (Edge runtime, no DB).

### Type augmentation

Add `sessionId?: string` to the `JWT` interface in `src/auth.ts`.
Pass `sessionId` through the `session` callback so it's available on `session.user`.

## Sidebar Footer: User Info + Sign-out

**File:** `src/components/layout/app-sidebar.tsx`

The `SidebarFooter` gains a user info block above the theme toggle:
- User name (bold) + email (muted, smaller)
- Sign out button — calls `signOut({ redirectTo: "/login" })` from `next-auth/react`
- Uses `useSession()` to read current user data (sidebar is already a client component)

```
┌─────────────────────────────┐
│ 👤 Krzysztof                │
│    krzysztof@example.com    │
│ [Sign out]                  │
├─────────────────────────────┤
│ 🌙 Theme toggle             │
└─────────────────────────────┘
```

## Admin Users Page

### Route: `/users`

**File:** `src/app/(app)/users/page.tsx` — server component.

Role gate: if `session.user.role !== 'admin'` → redirect to `/dashboard`.

Calls `GET /api/admin/users` and renders a table:

| Column | Source |
|---|---|
| Name | `users.name` |
| Email | `users.email` |
| Role | `users.role` |
| Status | 🟢 Active / ⚪ Offline / — Never logged in |
| Last seen | `last_seen_at` formatted as relative time, or "Never" |
| Action | "Terminate" button (disabled for own account) |

**Active** = has a non-revoked session with `last_seen_at` within last 15 min.
**Offline** = has sessions but none active.
**Never** = no session rows at all.

### API: `GET /api/admin/users`

**File:** `src/app/api/admin/users/route.ts`

- Calls `ensureDb()` then `getUsersWithSessionInfo()`
- Returns 403 if caller role is not `admin`
- Returns array of `{ id, name, email, role, created_at, last_seen_at, is_active }`

### API: `POST /api/admin/users/[id]/revoke-session`

**File:** `src/app/api/admin/users/[id]/revoke-session/route.ts`

- Calls `ensureDb()` then `revokeUserSessions(id)`
- Returns 403 if caller role is not `admin`
- Returns 400 if caller tries to revoke their own session
- Returns `{ success: true }` on success

The terminated user is redirected to `/login` on their next page navigation (when the layout guard detects the revoked session).

## Sidebar Navigation

**File:** `src/components/layout/app-sidebar.tsx`

Add a "Users" nav item to the existing nav array, conditionally rendered when `session?.user?.role === 'admin'`. Uses `useSession()` already available in the component.

## Error Handling

- `revokeUserSessions` on a non-existent user → no-op, returns success
- `touchSession` failure → log and continue (non-fatal, don't block the user)
- Admin self-termination attempt → 400 response, UI button disabled
- Non-admin accessing `/users` → redirect to `/dashboard`
- Non-admin calling admin APIs → 403 JSON response

## Files Changed / Created

| File | Change |
|---|---|
| `lib/db.js` | Add `user_sessions` table + 5 helper functions |
| `src/lib/db-imports.ts` | Export new helpers |
| `src/auth.ts` | Generate + store sessionId in JWT on sign-in |
| `src/app/(app)/layout.tsx` | Validate + touch session on every navigation |
| `src/components/layout/app-sidebar.tsx` | Add user info block + sign-out + Users nav item |
| `src/app/(app)/users/page.tsx` | New admin users page |
| `src/app/api/admin/users/route.ts` | New GET endpoint |
| `src/app/api/admin/users/[id]/revoke-session/route.ts` | New POST endpoint |
