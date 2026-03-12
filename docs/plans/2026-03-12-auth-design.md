# Authentication Module Design

**Date:** 2026-03-12
**Status:** Approved

## Overview

Introduce a full authentication module to ComplianceA. All routes are protected. Users can register and log in with email/password or Google OAuth. All authenticated users are admins for now; a role/permission system will be added in a future iteration.

## Approach

NextAuth.js v5 (Auth.js) with:
- **Credentials provider** — email + bcrypt password, stored in SQLite
- **Google OAuth provider** — Google Sign-In via OAuth2
- **JWT sessions** — stateless, no session table required
- **Next.js middleware** — single file protects all routes

## Data Model

### New `users` table

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT,        -- NULL for Google-only accounts
  google_id     TEXT UNIQUE, -- NULL for email/password accounts
  avatar_url    TEXT,
  role          TEXT DEFAULT 'admin',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

The existing `user_profile` table is untouched. Linking it to `users.id` is deferred to a future migration.

### Session (JWT payload)

```ts
{ id: number, email: string, name: string, role: string }
```

Stored in a signed, encrypted httpOnly cookie (`next-auth.session-token`). No session row in the database.

## New Dependencies

| Package | Purpose |
|---|---|
| `next-auth@beta` | Auth.js v5 — providers, JWT sessions |
| `bcryptjs` | Password hashing (pure JS) |
| `@types/bcryptjs` | TypeScript types |

## File Structure

```
src/
├── auth.ts                              # NextAuth config
├── middleware.ts                        # Route protection
└── app/
    ├── (auth)/                          # Auth route group (no sidebar)
    │   ├── layout.tsx                   # Centered card layout
    │   ├── login/page.tsx               # Login page
    │   └── register/page.tsx            # Register page
    └── api/
        ├── auth/
        │   ├── [...nextauth]/route.ts   # NextAuth catch-all
        │   └── register/route.ts        # Custom registration endpoint
```

## Data Flows

### Registration (email/password)

1. User submits name + email + password on `/register`
2. POST `/api/auth/register` — check for duplicate email (409 if exists)
3. `bcrypt.hash(password, 12)` → insert new `users` row
4. Redirect to `/login` with success toast

### Login (email/password)

1. `signIn("credentials", { email, password })`
2. NextAuth `authorize()` looks up user by email, runs `bcrypt.compare`
3. On success: JWT cookie set → redirect to `/dashboard`
4. On failure: "Invalid email or password" (no hint which field is wrong)

### Login / Register (Google)

1. `signIn("google")` → Google OAuth redirect
2. Callback at `/api/auth/callback/google`
3. NextAuth `signIn` callback:
   - `google_id` exists → return existing user
   - `google_id` not found → insert new `users` row (name + avatar from Google profile, no `password_hash`)
4. JWT cookie set → redirect to `/dashboard`

### Route Protection

Middleware runs on every request. `auth()` returning null → `redirect("/login")`.
Whitelisted paths: `/login`, `/register`, `/api/auth/*`.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Wrong password | "Invalid email or password" |
| Email already registered | 409 → "Email already in use" |
| Google account collision | Blocked by `UNIQUE` constraint on `google_id` |
| Unauthenticated API call | Middleware redirects to `/login` |

## Environment Variables

```
AUTH_SECRET=<random 32+ char string>
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
```

Add these to Railway project settings before deploying.

## Out of Scope

- Role-based permissions (future)
- Linking existing `user_profile` rows to `users.id` (future migration)
- Email verification
- Password reset / forgot password flow
- Account management UI (change password, unlink Google)
