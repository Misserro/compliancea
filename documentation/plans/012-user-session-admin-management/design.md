# User Session Visibility & Admin User Management

**Date:** 2026-03-13
**Status:** Approved

## Overview

Two connected features:
1. Every logged-in user sees their account info and a sign-out button in the sidebar footer.
2. Admins can view all registered users, their real-time session status, and terminate any user's session.

## Constants

```ts
const SESSION_ACTIVE_WINDOW_MINUTES = 15;
```

Used in both the SQL query that computes `is_active` and any display logic. Define as a named constant in one place (e.g., `lib/db.js`) and reference it everywhere.

## Data Layer

### New table: `user_sessions`

Added to `lib/db.js` alongside the existing `users` table.

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

**Active session** = non-revoked row with `last_seen_at` within the last `SESSION_ACTIVE_WINDOW_MINUTES` minutes.

### New DB helper functions (in `lib/db.js`)

- `createSession(id, userId)` — inserts a new session row
- `touchSession(id)` — updates `last_seen_at` to now; does **not** call `saveDb()` (see Performance note below); begins with `if (!db) return` as a safety guard since it bypasses the `run()` null-check
- `revokeUserSessions(userId)` — sets `revoked = 1` for all sessions where `user_id = ?` (userId passed as integer)
- `getSessionById(id)` — returns a session row or null
- `getUsersWithSessionInfo()` — see SQL below

Export all five via `src/lib/db-imports.ts`.

#### `getUsersWithSessionInfo()` SQL

`SESSION_ACTIVE_WINDOW_MINUTES` is a JavaScript constant, not a SQL identifier — it must be passed as a bound parameter. Call as:

```js
query(sql, [SESSION_ACTIVE_WINDOW_MINUTES * 60])
```

where `sql` is:

```sql
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u.created_at,
  s.last_seen_at,
  CASE
    WHEN s.last_seen_at IS NOT NULL
     AND s.revoked = 0
     AND (strftime('%s','now') - strftime('%s', s.last_seen_at)) < ?
    THEN 1 ELSE 0
  END AS is_active
FROM users u
LEFT JOIN user_sessions s
  ON s.user_id = u.id
  AND s.revoked = 0
  AND s.id = (
    SELECT id FROM user_sessions
    WHERE user_id = u.id AND revoked = 0
    ORDER BY last_seen_at DESC
    LIMIT 1
  )
ORDER BY u.created_at DESC
```

Returns columns: `id` (integer), `name`, `email`, `role`, `created_at`, `last_seen_at` (null if never logged in), `is_active` (0 or 1).

The `LEFT JOIN` ensures users who have never logged in appear with `last_seen_at = null`.

#### Performance note: `touchSession` and `saveDb()`

`lib/db.js`'s `run()` helper calls `saveDb()` after every write. `touchSession` is called on every page navigation within the `(app)` group, which would write the entire DB to disk on every click. To avoid this:

- `touchSession` should call `db.run(sql, params)` directly **without** going through the `run()` helper, and skip `saveDb()`.
- A periodic flush (e.g., in the maintenance job) or a write on sign-out/sign-in is sufficient to persist `last_seen_at` to disk.
- Consequence: on a crash or restart, `last_seen_at` values may be slightly stale — this is acceptable.

### Cold-start session loss

sql.js loads the DB from disk on startup. All `user_sessions` rows written in a previous process are preserved on disk **but** a Railway redeploy resets the in-memory `db`. After `initDb()` runs, the rows are restored from disk, so sessions survive a normal restart.

However: if the disk volume is ephemeral (Railway's default for non-persistent volumes) the DB file is lost on redeploy and all session rows vanish. The consequence is that every user with a valid JWT is redirected to `/login` after a redeploy.

**Resolution — lazy re-hydration in the JWT callback:**

In `src/auth.ts` JWT callback, on every token refresh (i.e., when `trigger !== "signIn"` but `token.sessionId` is set):
- Call `getSessionById(token.sessionId)`
- If the row is missing (lost on cold start), call `createSession(token.sessionId, token.id)` to re-insert it
- This means users are not kicked on redeploy; they seamlessly continue their session

This lazy re-hydration pattern must be implemented in addition to the initial insert on sign-in.

## Auth Flow Changes

### `src/auth.ts` — type augmentation

Add to the **existing** `declare module "@auth/core/jwt"` block:
```ts
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    sessionId?: string;   // ← add this
  }
}
```

Add to the **existing** `declare module "next-auth"` Session block:
```ts
interface Session {
  user: {
    id: string;
    role: string;
    sessionId?: string;   // ← add this
  } & DefaultSession["user"];
}
```

### `src/auth.ts` — JWT callback

```ts
async jwt({ token, user, trigger }) {
  if (user) {
    // First sign-in: create session
    token.id = user.id;
    token.role = (user as any).role ?? "admin";
    const sessionId = crypto.randomUUID();
    await ensureDb();
    createSession(sessionId, Number(user.id));
    token.sessionId = sessionId;
  } else if (token.sessionId) {
    // Subsequent requests: lazy re-hydration after cold start
    await ensureDb();
    const existing = getSessionById(token.sessionId);
    if (!existing) {
      createSession(token.sessionId, Number(token.id));
    }
  }
  return token;
}
```

### `src/auth.ts` — session callback

Add the `sessionId` pass-through:
```ts
async session({ session, token }) {
  if (token.id)        session.user.id        = token.id;
  if (token.role)      session.user.role      = token.role;
  if (token.sessionId) session.user.sessionId = token.sessionId;  // ← add
  return session;
}
```

### `src/app/(app)/layout.tsx` — session guard

After the existing `auth()` call and before rendering children:

```ts
// 1. Auth check already done (redirect if no session)
// 2. Validate session is not revoked
await ensureDb();
const dbSession = session.user.sessionId
  ? getSessionById(session.user.sessionId)
  : null;
if (!dbSession || dbSession.revoked) {
  redirect("/login");
}
// 3. Update last_seen_at (no saveDb, see performance note)
touchSession(session.user.sessionId);
```

Middleware remains unchanged — Edge runtime, JWT signature check only.

## Sidebar Footer: User Info + Sign-out

**File:** `src/components/layout/app-sidebar.tsx`

The `SidebarFooter` gains a user info block **above** the existing theme toggle:

```
┌─────────────────────────────┐
│ 👤 Krzysztof                │
│    krzysztof@example.com    │
│ [Sign out]                  │
├─────────────────────────────┤
│ 🌙 Theme toggle             │
└─────────────────────────────┘
```

- Uses `useSession()` from `next-auth/react` (sidebar is already a client component)
- Sign-out: `signOut({ redirectTo: "/login" })` from `next-auth/react`
- If `session.data.user.name` is null, fall back to displaying the email

### Users nav item

Add to the navigation array, rendered only when `session?.data?.user?.role === 'admin'`:

```ts
{ title: "Users", url: "/users", icon: Users }
```

## Admin Users Page

### Route: `/users`

**File:** `src/app/(app)/users/page.tsx` — server component.

Role gate at the top: if `session.user.role !== 'admin'` → `redirect("/dashboard")`.

Call `getUsersWithSessionInfo()` **directly** (no HTTP round-trip — server components call DB helpers directly).

Renders a table with columns: Name, Email, Role, Status, Last seen, Action.

**Status logic:**
- `last_seen_at === null` → "—" / Never
- `is_active === 1` → 🟢 Active
- otherwise → ⚪ Offline

**Action:** "Terminate" button — `POST /api/admin/users/[id]/revoke-session`. Disabled (and not shown as actionable) when `user.id === session.user.id` (can't terminate yourself).

### API: `POST /api/admin/users/[id]/revoke-session`

**File:** `src/app/api/admin/users/[id]/revoke-session/route.ts`

Call order:
1. `const session = await auth()` — verify authenticated
2. If `session.user.role !== 'admin'` → return 403
3. If `Number(params.id) === Number(session.user.id)` → return 400 (self-termination)
4. `await ensureDb()`
5. `revokeUserSessions(Number(params.id))`
6. Return `{ success: true }`

Note: `params.id` arrives as a string; parse with `Number()` before passing to `revokeUserSessions`.

The terminated user is redirected to `/login` on their next page navigation when the layout guard detects the revoked session.

### API: `GET /api/admin/users` — NOT USED

The `/users` server component calls `getUsersWithSessionInfo()` directly. No separate API route is needed.

## Error Handling

- `revokeUserSessions` on a non-existent user → no-op, returns success
- `touchSession` failure → log and continue (non-fatal)
- Admin self-termination → 400 response + UI button disabled
- Non-admin at `/users` → redirect to `/dashboard`
- Non-admin calling revoke API → 403 JSON response
- `getSessionById` returns null after cold start → handled by lazy re-hydration in JWT callback
- All `lib/db.js` helpers (`createSession`, `revokeUserSessions`, etc.) are **synchronous** — no `await` needed when calling them from async contexts

## Migration Note

Users who have a valid JWT issued **before** this feature is deployed will have no `sessionId` in their token. On first navigation after deploy, the layout guard finds `session.user.sessionId === undefined`, treats it as a missing/revoked session, and redirects to `/login`. This is intentional — it forces a clean re-login. Users will need to sign in once after the feature is deployed.

## Session Cleanup (out of scope for v1)

`user_sessions` rows accumulate over time (revoked rows are never deleted). A future maintenance task should prune rows with `revoked = 1` or `last_seen_at` older than 30 days.

## Files Changed / Created

| File | Change |
|---|---|
| `lib/db.js` | Add `user_sessions` table + 5 helper functions + `SESSION_ACTIVE_WINDOW_MINUTES` constant |
| `src/lib/db-imports.ts` | Export new helpers |
| `src/auth.ts` | Augment JWT/Session types; add sessionId handling in jwt + session callbacks |
| `src/app/(app)/layout.tsx` | Validate session not revoked + call touchSession |
| `src/components/layout/app-sidebar.tsx` | Add user info block + sign-out + conditional Users nav item |
| `src/app/(app)/users/page.tsx` | New admin users page (server component) |
| `src/app/api/admin/users/[id]/revoke-session/route.ts` | New POST endpoint |
