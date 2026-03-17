# User Session Visibility & Admin User Management — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users see their account and sign out from the sidebar, and let admins view all users with live session status and terminate any user's session.

**Architecture:** A `user_sessions` table in SQLite tracks every login via a UUID stored in the JWT. The `(app)` layout validates + touches the session on every navigation. Session termination sets `revoked = 1`; the user is kicked on their next page load.

**Tech Stack:** Next.js 15 App Router, NextAuth v5 (JWT strategy), sql.js (in-memory SQLite), shadcn/ui, Tailwind CSS, lucide-react

---

## Chunk 1: Data Layer — `user_sessions` table and DB helpers

### Task 1: Add `user_sessions` table and helpers to `lib/db.js`

**Files:**
- Modify: `lib/db.js`

**Context:** `lib/db.js` has a module-level `let db = null`. All table creation happens inside `initDb()`. All helpers call the module-level `db` via the exported `run()` / `query()` / `get()` helpers. The `run()` helper calls `saveDb()` after every write — `touchSession` must bypass this.

- [ ] **Step 1: Add `SESSION_ACTIVE_WINDOW_MINUTES` constant at the top of `lib/db.js`, after the imports**

Open `lib/db.js`. After line 5 (`let db = null;`), add:

```js
export const SESSION_ACTIVE_WINDOW_MINUTES = 15;
```

- [ ] **Step 2: Add the `user_sessions` table creation inside `initDb()`**

In `lib/db.js`, find the block that creates the `users` table (around line 203). Directly after the `idx_users_google_id` index line, add:

```js
  // User sessions table (for real-time session tracking and admin termination)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked      INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);
```

- [ ] **Step 3: Add the five helper functions at the bottom of `lib/db.js`, after `createOrUpdateGoogleUser`**

```js
// ─── Session helpers ──────────────────────────────────────────────────────────

export function createSession(id, userId) {
  run(
    `INSERT OR IGNORE INTO user_sessions (id, user_id) VALUES (?, ?)`,
    [id, userId]
  );
}

// Does NOT call saveDb() — bypasses run() helper intentionally to avoid
// writing the full DB to disk on every page navigation.
// Safety guard: returns early if db is not initialised.
export function touchSession(id) {
  if (!db) return;
  db.run(
    `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked = 0`,
    [id]
  );
}

export function revokeUserSessions(userId) {
  run(
    `UPDATE user_sessions SET revoked = 1 WHERE user_id = ?`,
    [userId]
  );
}

export function getSessionById(id) {
  return get(`SELECT * FROM user_sessions WHERE id = ?`, [id]);
}

export function getUsersWithSessionInfo() {
  const sql = `
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
  `;
  return query(sql, [SESSION_ACTIVE_WINDOW_MINUTES * 60]);
}
```

- [ ] **Step 4: Verify the file is valid by checking for syntax errors**

```bash
node --input-type=module < lib/db.js 2>&1 | head -5
```

Expected: no output (no syntax errors). If you see an error, fix it before continuing.

- [ ] **Step 5: Commit**

```bash
git add lib/db.js
git commit -m "feat: add user_sessions table and session helper functions"
```

---

### Task 2: Export new helpers from `src/lib/db-imports.ts`

**Files:**
- Modify: `src/lib/db-imports.ts`

- [ ] **Step 1: Add the five new exports to `src/lib/db-imports.ts`**

Open `src/lib/db-imports.ts`. The last two lines currently are:

```ts
  createOrUpdateGoogleUser,
} from "../../lib/db.js";
```

Replace those two lines with:

```ts
  createOrUpdateGoogleUser,
  SESSION_ACTIVE_WINDOW_MINUTES,
  createSession,
  touchSession,
  revokeUserSessions,
  getSessionById,
  getUsersWithSessionInfo,
} from "../../lib/db.js";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to these files).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db-imports.ts
git commit -m "feat: export user_sessions helpers from db-imports"
```

---

## Chunk 2: Auth Flow — JWT, session callbacks, layout guard

### Task 3: Update `src/auth.ts` — type augmentation and callbacks

**Files:**
- Modify: `src/auth.ts`

**Context:** The current JWT callback only runs on sign-in (`if (user)`). We need to add a second branch for subsequent token refreshes to handle lazy re-hydration after cold starts.

- [ ] **Step 1: Add `sessionId` to the type augmentations**

In `src/auth.ts`, find the `declare module "next-auth"` block (lines 9–18). Change:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
```

to:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      sessionId?: string;
    } & DefaultSession["user"];
  }
```

Then find the `declare module "@auth/core/jwt"` block (lines 21–25). Change:

```ts
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}
```

to:

```ts
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    sessionId?: string;
  }
}
```

- [ ] **Step 2: Add session helper imports**

At the top of `src/auth.ts`, the imports currently include `getUserByEmail` from `@/lib/db-imports`. Add the new helpers to that same import:

```ts
import { getUserByEmail, createSession, getSessionById } from "@/lib/db-imports";
```

- [ ] **Step 3: Replace the JWT callback**

Find the `callbacks` block and replace the `jwt` callback:

Current:
```ts
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role ?? "admin";
      }
      return token;
    },
```

Replace with:
```ts
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: persist id/role and create a new session row
        token.id = user.id;
        token.role = (user as any).role ?? "admin";
        const sessionId = crypto.randomUUID();
        await ensureDb();
        createSession(sessionId, Number(user.id));
        token.sessionId = sessionId;
      } else if (token.sessionId && token.id) {
        // Subsequent requests: lazy re-hydration in case DB was wiped on redeploy.
        // NOTE: this branch runs on every request (every auth() call), not only after cold starts.
        // getSessionById is a synchronous in-memory sql.js query so the cost is negligible.
        await ensureDb();
        const existing = getSessionById(token.sessionId);
        if (!existing) {
          createSession(token.sessionId, Number(token.id));
        }
      }
      return token;
    },
```

- [ ] **Step 4: Update the session callback to forward `sessionId`**

Find the `session` callback:

Current:
```ts
    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },
```

Replace with:
```ts
    async session({ session, token }) {
      if (token.id)        session.user.id        = token.id;
      if (token.role)      session.user.role      = token.role;
      if (token.sessionId) session.user.sessionId = token.sessionId;
      return session;
    },
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts
git commit -m "feat: track sessionId in JWT — create session on sign-in, lazy re-hydrate on refresh"
```

---

### Task 4: Update `src/app/(app)/layout.tsx` — session revocation guard

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Context:** This is an async server component. It already calls `auth()` and redirects if no session. We need to add a DB session validation after that.

- [ ] **Step 1: Replace the layout file contents**

The full new file:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ensureDb } from "@/lib/server-utils";
import { getSessionById, touchSession } from "@/lib/db-imports";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Validate the session has not been revoked by an admin.
  // Users whose JWT has no sessionId (issued before this feature deployed) also
  // hit this redirect — this is intentional, forcing a one-time re-login.
  await ensureDb();
  const dbSession = session.user.sessionId
    ? getSessionById(session.user.sessionId)
    : null;
  if (!dbSession || dbSession.revoked) {
    redirect("/login");
  }

  // Update last_seen_at (no saveDb call — see performance note in spec)
  touchSession(session.user.sessionId!);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Manual smoke test — sign in works**

Start the dev server locally (`npm run dev`) and sign in. Confirm you reach `/dashboard` without being redirected back to `/login`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: validate and touch session in app layout — revoked sessions redirect to login"
```

---

## Chunk 3: Sidebar — User Info, Sign-out, Users Nav Item

### Task 5: Update `src/components/layout/app-sidebar.tsx`

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**Context:** The sidebar is already a `"use client"` component. It currently imports from `next/navigation`, `lucide-react`, and `next-themes`. We need to add `useSession` from `next-auth/react` and `signOut` for the sign-out button, plus a `Users` icon from lucide-react. The `navItems` array is static; we'll keep it static and add the Users item conditionally inside the component.

- [ ] **Step 1: Update imports**

Replace the current import line:
```ts
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor } from "lucide-react";
```

With:
```ts
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut } from "lucide-react";
```

Add two new imports after the existing imports:
```ts
import { useSession, signOut } from "next-auth/react";
```

- [ ] **Step 2: Add `useSession` inside `AppSidebar` and derive the user display values**

Inside the `AppSidebar` function, after `const { theme, setTheme } = useTheme();`, add:

```ts
  const { data: sessionData } = useSession();
  const userEmail = sessionData?.user?.email ?? "";
  const userName = sessionData?.user?.name || userEmail;
  const isAdmin = sessionData?.user?.role === "admin";
```

- [ ] **Step 3: Add the conditional Users item to the nav list**

After the `overdueCount` state and before the `return`, build the full nav list:

```ts
  const allNavItems = [
    ...navItems,
    ...(isAdmin ? [{ title: "Users", href: "/users", icon: Users }] : []),
  ];
```

Then in the JSX, replace `navItems.map(...)` with `allNavItems.map(...)`.

- [ ] **Step 4: Add the user info block to `SidebarFooter`**

Replace the current `SidebarFooter` block:

```tsx
      <SidebarFooter className="border-t px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          title="Toggle theme"
        >
          <ThemeIcon theme={theme} />
          <span className="text-xs">{themeLabel()}</span>
        </Button>
      </SidebarFooter>
```

With:

```tsx
      <SidebarFooter className="border-t px-4 py-3 space-y-1">
        {userEmail && (
          <div className="px-2 py-2 border-b mb-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            {userName !== userEmail && (
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="mt-1 w-full justify-start gap-2 text-muted-foreground hover:text-foreground px-0"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs">Sign out</span>
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          title="Toggle theme"
        >
          <ThemeIcon theme={theme} />
          <span className="text-xs">{themeLabel()}</span>
        </Button>
      </SidebarFooter>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Manual smoke test**

Open the app in a browser. Confirm the sidebar footer shows:
- Your name / email
- A "Sign out" button
- Theme toggle below it
- "Users" nav item visible (if your account role is `admin`)

Click "Sign out" — confirm you land on `/login`.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add user info, sign-out button, and admin Users nav item to sidebar"
```

---

## Chunk 4: Admin Users Page and Revoke Session API

### Task 6: Create the revoke-session API route

**Files:**
- Create: `src/app/api/admin/users/[id]/revoke-session/route.ts`

**Context:** Route params arrive as strings. Auth check must come before `ensureDb()`. Self-termination returns 400. All helpers are synchronous.

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/api/admin/users/[id]/revoke-session"
```

Create `src/app/api/admin/users/[id]/revoke-session/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { revokeUserSessions } from "@/lib/db-imports";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (Number(id) === Number(session.user.id)) {
    return NextResponse.json({ error: "Cannot terminate your own session" }, { status: 400 });
  }

  await ensureDb();
  revokeUserSessions(Number(id));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/admin/users/[id]/revoke-session/route.ts"
git commit -m "feat: add POST /api/admin/users/[id]/revoke-session endpoint"
```

---

### Task 7: Create the admin Users page

**Files:**
- Create: `src/app/(app)/users/page.tsx`

**Context:** Server component. Calls DB helpers directly (no HTTP round-trip). Uses `auth()` for the role gate. The `getUsersWithSessionInfo()` return type has: `id` (number), `name` (string|null), `email` (string), `role` (string), `created_at` (string), `last_seen_at` (string|null), `is_active` (0|1).

The "Terminate" action is a small client component to handle the `fetch` + router refresh without making the whole page a client component.

- [ ] **Step 1: Create a `TerminateButton` client component**

Create `src/app/(app)/users/_terminate-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TerminateButton({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleTerminate() {
    if (!confirm("Terminate all sessions for this user?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/revoke-session`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to terminate session");
      } else {
        router.refresh();
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleTerminate}
      disabled={loading}
    >
      {loading ? "Terminating…" : "Terminate"}
    </Button>
  );
}
```

- [ ] **Step 2: Create the Users page server component**

Create `src/app/(app)/users/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getUsersWithSessionInfo } from "@/lib/db-imports";
import { TerminateButton } from "./_terminate-button";

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ isActive, lastSeen }: { isActive: number; lastSeen: string | null }) {
  if (!lastSeen) return <span className="text-muted-foreground text-sm">—</span>;
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-gray-400" />
      Offline
    </span>
  );
}

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  await ensureDb();
  const users = getUsersWithSessionInfo() as Array<{
    id: number;
    name: string | null;
    email: string;
    role: string;
    created_at: string;
    last_seen_at: string | null;
    is_active: number;
  }>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registered accounts and their session status.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {user.name ?? <span className="text-muted-foreground italic">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="capitalize">{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge isActive={user.is_active} lastSeen={user.last_seen_at} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatRelative(user.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.id !== Number(session.user.id) && user.last_seen_at !== null && (
                    <TerminateButton userId={user.id} />
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Manual smoke test**

1. Sign in as an admin. Confirm the "Users" item appears in the sidebar.
2. Navigate to `/users`. Confirm the table shows all registered users.
3. If you have a second test account, sign in on another browser/incognito. Confirm the first account shows as "Active" and the second shows after a few seconds.
4. As admin, click "Terminate" on the second account. Confirm the table refreshes.
5. Switch to the second browser — navigate to any app page. Confirm you are redirected to `/login`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/users/page.tsx" "src/app/(app)/users/_terminate-button.tsx"
git commit -m "feat: add admin Users page with session status and terminate action"
```

---

## Final Step: Push to GitHub

- [ ] **Push all commits**

```bash
git push
```

Railway will pick up the new commits and redeploy automatically.

> **Migration note:** All existing logged-in users will be redirected to `/login` on first navigation after this deploy (their JWTs have no `sessionId`). This is intentional — they sign in once and get a tracked session.
