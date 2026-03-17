# Auth Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email/password + Google OAuth authentication to ComplianceA, protecting all routes, storing users in SQLite, using NextAuth.js v5 with stateless JWT sessions.

**Architecture:** NextAuth.js v5 with Credentials + Google providers. JWT sessions stored in an httpOnly cookie (no session table). Route protection via a single `middleware.ts`. App pages move to an `(app)` route group (gets sidebar layout); auth pages live in `(auth)` route group (clean centered layout).

**Tech Stack:** `next-auth@beta`, `bcryptjs`, Next.js 15 App Router, sql.js (existing SQLite wrapper in `lib/db.js`).

---

## Reference: Existing DB helpers

All DB access uses three functions from `lib/db.js`:
- `get(sql, params[])` → single row object or null
- `query(sql, params[])` → array of row objects
- `run(sql, params[])` → `{ changes, lastInsertRowId }`

These are imported via `src/lib/db-imports.ts` (the barrel file for all DB exports used in Next.js API routes).

---

### Task 1: Restructure into route groups

This separates the sidebar layout (main app) from the auth layout (no sidebar). Without this, the login page inherits the root layout's sidebar.

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx`
- Move (git mv): all page directories into `src/app/(app)/`

**Step 1: Create the app group layout**

Create `src/app/(app)/layout.tsx` — copy sidebar content from current root layout:

```tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

**Step 2: Simplify root layout**

Replace `src/app/layout.tsx` with a minimal version (fonts + theme only — no sidebar):

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ComplianceA",
  description: "AI-powered document analysis and contract management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 3: Move app page directories into (app) group**

Run these git mv commands (each moves a route directory into the new group):

```bash
cd src/app
mkdir -p "(app)"
git mv analyze "(app)/analyze"
git mv ask "(app)/ask"
git mv contracts "(app)/contracts"
git mv dashboard "(app)/dashboard"
git mv documents "(app)/documents"
git mv obligations "(app)/obligations"
git mv policies "(app)/policies"
git mv process "(app)/process"
git mv product-hub "(app)/product-hub"
git mv settings "(app)/settings"
```

Note: `src/app/api/` and `src/app/page.tsx` stay at root level — do NOT move them.

**Step 4: Verify the dev server still works**

```bash
npm run dev
```

Expected: App loads at `http://localhost:3000`, sidebar present on all main pages, no TypeScript errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: restructure into (app) and (auth) route groups"
```

---

### Task 2: Install dependencies

**Step 1: Install packages**

```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

**Step 2: Verify install**

```bash
node -e "require('bcryptjs'); console.log('bcryptjs ok')"
```

Expected: `bcryptjs ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add next-auth and bcryptjs dependencies"
```

---

### Task 3: Add users table to the database schema

**Files:**
- Modify: `lib/db.js` — add `CREATE TABLE IF NOT EXISTS users` inside `initDb()`

**Step 1: Add the users table DDL**

Open `lib/db.js`. Find the block with other `CREATE TABLE IF NOT EXISTS` statements (around line 27). Add the following immediately before the `app_settings` table creation (around line 205):

```js
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT,
      password_hash TEXT,
      google_id     TEXT UNIQUE,
      avatar_url    TEXT,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`);
```

**Step 2: Verify the table is created**

```bash
npm run dev
```

Open `http://localhost:3000` — app should start without errors. The table is created on first `initDb()` call. No data loss on existing DB (IF NOT EXISTS guard).

**Step 3: Commit**

```bash
git add lib/db.js
git commit -m "feat: add users table to SQLite schema"
```

---

### Task 4: Add user helper functions to lib/db.js

**Files:**
- Modify: `lib/db.js` — append four exported functions at the bottom

**Step 1: Add the four functions**

Append to the end of `lib/db.js`:

```js
// ─── User auth helpers ────────────────────────────────────────────────────────

export function getUserByEmail(email) {
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}

export function getUserByGoogleId(googleId) {
  return get(`SELECT * FROM users WHERE google_id = ?`, [googleId]);
}

export function createUser(email, name, passwordHash) {
  run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    [email, name, passwordHash]
  );
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}

/**
 * Called on Google OAuth sign-in.
 * - If google_id already exists: return that user.
 * - If email exists (prior password registration): link google_id to it.
 * - Otherwise: create a new user row.
 */
export function createOrUpdateGoogleUser(googleId, email, name, avatarUrl) {
  const byGoogleId = get(`SELECT * FROM users WHERE google_id = ?`, [googleId]);
  if (byGoogleId) return byGoogleId;

  const byEmail = get(`SELECT * FROM users WHERE email = ?`, [email]);
  if (byEmail) {
    run(
      `UPDATE users SET google_id = ?, avatar_url = ? WHERE email = ?`,
      [googleId, avatarUrl, email]
    );
    return get(`SELECT * FROM users WHERE email = ?`, [email]);
  }

  run(
    `INSERT INTO users (email, name, google_id, avatar_url) VALUES (?, ?, ?, ?)`,
    [email, name, googleId, avatarUrl]
  );
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}
```

**Step 2: Commit**

```bash
git add lib/db.js
git commit -m "feat: add user auth helper functions to db.js"
```

---

### Task 5: Export new functions from db-imports barrel

**Files:**
- Modify: `src/lib/db-imports.ts` — add four new exports

**Step 1: Open `src/lib/db-imports.ts`**

Add to the existing export list (inside the braces of the existing export block):

```ts
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  createOrUpdateGoogleUser,
```

The full added line at the bottom of the `export { ... } from "../../lib/db.js"` block — just before the closing `}`.

**Step 2: Commit**

```bash
git add src/lib/db-imports.ts
git commit -m "feat: export user auth helpers from db-imports"
```

---

### Task 6: Create NextAuth v5 configuration

**Files:**
- Create: `src/auth.ts`

**Step 1: Create the file**

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  createOrUpdateGoogleUser,
} from "@/lib/db-imports";

// ─── Type augmentation ─────────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

// ─── NextAuth config ──────────────────────────────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = getUserByEmail(email);
        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(password, user.password_hash as string);
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email as string,
          name: user.name as string | null,
          role: (user.role as string) ?? "admin",
        };
      },
    }),
    Google,
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const dbUser = createOrUpdateGoogleUser(
          account.providerAccountId,
          user.email!,
          user.name ?? null,
          user.image ?? null
        );
        user.id = String(dbUser.id);
        (user as any).role = dbUser.role ?? "admin";
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
```

**Step 2: Commit**

```bash
git add src/auth.ts
git commit -m "feat: add NextAuth v5 config with Credentials and Google providers"
```

---

### Task 7: Create NextAuth API catch-all route

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Step 1: Create directories and file**

```bash
mkdir -p src/app/api/auth/\[...nextauth\]
```

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

That's it. NextAuth v5 handles all `/api/auth/*` routes through this.

**Step 2: Verify**

```bash
npm run dev
```

Visit `http://localhost:3000/api/auth/providers` — should return JSON with `credentials` and `google` providers listed.

**Step 3: Commit**

```bash
git add "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "feat: add NextAuth catch-all API route"
```

---

### Task 8: Create registration API route

**Files:**
- Create: `src/app/api/auth/register/route.ts`

**Step 1: Create the file**

```ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser } from "@/lib/db-imports";

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  createUser(email, name ?? null, passwordHash);

  return NextResponse.json({ success: true }, { status: 201 });
}
```

**Step 2: Test with curl**

```bash
# Should return 201
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}' | jq .

# Should return 409
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}' | jq .

# Should return 400
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' | jq .
```

Expected outputs: `{"success":true}`, `{"error":"Email already in use"}`, `{"error":"Email and password are required"}`

**Step 3: Commit**

```bash
git add src/app/api/auth/register/route.ts
git commit -m "feat: add registration API route"
```

---

### Task 9: Create route protection middleware

**Files:**
- Create: `middleware.ts` (project root, next to `package.json`)

**Step 1: Create the file**

```ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  /*
   * Match all routes EXCEPT:
   * - /api/auth/* (NextAuth endpoints)
   * - /login and /register (auth pages)
   * - /_next/* (Next.js internals)
   * - /favicon.ico, static files
   */
  matcher: [
    "/((?!api/auth|login|register|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
```

**Step 2: Verify redirect works**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` in a fresh browser (no cookies). Expected: redirected to `/login`.

**Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware to protect all routes from unauthenticated access"
```

---

### Task 10: Create SessionProvider wrapper

Client components that call `useSession()` need `SessionProvider` in the component tree. Since the root layout is a Server Component, we wrap via a thin client component.

**Files:**
- Create: `src/components/providers/session-provider.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create the client wrapper**

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Step 2: Add it to the root layout**

In `src/app/layout.tsx`, import and wrap `{children}`:

```tsx
import { AuthSessionProvider } from "@/components/providers/session-provider";

// Inside RootLayout, wrap children:
<ThemeProvider ...>
  <AuthSessionProvider>
    {children}
  </AuthSessionProvider>
  <Toaster />
</ThemeProvider>
```

**Step 3: Commit**

```bash
git add src/components/providers/session-provider.tsx src/app/layout.tsx
git commit -m "feat: add SessionProvider for client-side useSession() support"
```

---

### Task 11: Create auth route group layout

**Files:**
- Create: `src/app/(auth)/layout.tsx`

**Step 1: Create directories and file**

```bash
mkdir -p src/app/\(auth\)
```

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {children}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "src/app/(auth)/layout.tsx"
git commit -m "feat: add (auth) route group layout"
```

---

### Task 12: Create login page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

**Step 1: Create directories and file**

```bash
mkdir -p "src/app/(auth)/login"
```

Create `src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to continue
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Continue with Google
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/register" className="text-primary hover:underline">
          Register
        </a>
      </p>
    </div>
  );
}
```

**Step 2: Verify**

Visit `http://localhost:3000/login` — should show a centered card with the form. Sidebar should NOT be visible.

**Step 3: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat: add login page with credentials and Google sign-in"
```

---

### Task 13: Create register page

**Files:**
- Create: `src/app/(auth)/register/page.tsx`

**Step 1: Create directory and file**

```bash
mkdir -p "src/app/(auth)/register"
```

Create `src/app/(auth)/register/page.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    // Auto sign-in after successful registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      router.push("/login");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-muted-foreground">
          Sign up to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Continue with Google
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/login" className="text-primary hover:underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
```

**Step 2: Verify**

Visit `http://localhost:3000/register` — clean centered card, no sidebar.

**Step 3: Commit**

```bash
git add "src/app/(auth)/register/page.tsx"
git commit -m "feat: add register page with email/password and Google sign-up"
```

---

### Task 14: Set environment variables

**Step 1: Add AUTH_SECRET to .env.local**

Generate a secret (run this once):

```bash
openssl rand -base64 32
```

Create or update `.env.local` (this file is gitignored — never commit it):

```bash
AUTH_SECRET=<paste the generated value here>
AUTH_GOOGLE_ID=<your Google OAuth client ID>
AUTH_GOOGLE_SECRET=<your Google OAuth client secret>
```

**How to get Google credentials:**
1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. For production, add: `https://your-railway-domain.up.railway.app/api/auth/callback/google`

**Step 2: Add vars to Railway**

In Railway dashboard → your project → Variables, add:
- `AUTH_SECRET` (same value as local)
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

**Step 3: Restart dev server to pick up new env vars**

```bash
# Ctrl+C then:
npm run dev
```

---

### Task 15: End-to-end manual test

**Step 1: Test unauthenticated redirect**

Visit `http://localhost:3000/dashboard` — should redirect to `/login`.

**Step 2: Test registration**

1. Go to `/register`
2. Fill in name, email, password (8+ chars)
3. Submit → should redirect to `/dashboard`

**Step 3: Test logout and re-login**

Open browser console, run:
```js
// Or use the sign-out route:
fetch('/api/auth/signout', { method: 'POST' })
```

Or add a temporary sign-out button anywhere:
```tsx
import { signOut } from "next-auth/react"
<button onClick={() => signOut()}>Sign out</button>
```

Then log back in via `/login`.

**Step 4: Test duplicate registration**

Try registering with the same email again — should see "Email already in use" error.

**Step 5: Test Google sign-in (if credentials are configured)**

Click "Continue with Google" on login page — should complete OAuth flow and land on `/dashboard`.

**Step 6: Final commit (if any tweaks were made)**

```bash
git add -A
git commit -m "feat: auth module complete — NextAuth v5 with Credentials and Google OAuth"
```

---

## Out of scope (future tasks)

- Password reset / forgot password flow
- Email verification on registration
- Role-based access control (permissions system)
- Linking existing `user_profile` rows to `users.id`
- Account management UI (change password, unlink Google account)
- Sign-out button in the app sidebar
