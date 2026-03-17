# Authentication and Authorization Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / NextAuth v5 (beta.30), bcryptjs, Next.js 15 App Router
> Related: [security.md](./security.md), [rest-api.md](./rest-api.md), [logging.md](./logging.md)

## Principle

Vaulta manages sensitive legal and compliance documents for regulated organizations. In this domain, authentication and authorization are not conveniences layered on top of features -- they are compliance requirements that must be provably correct. Every route, every session, and every privileged operation must be explicitly gated. If a handler does not call `auth()` and check the result, it is an open door in a building that stores regulated records. The default posture is deny; access is granted only by code that explicitly verifies identity and role.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| API route handler with no `auth()` call -- unauthenticated access to compliance data (see `src/app/api/tasks/route.ts`, `contracts/route.ts` as existing violations) | Every non-auth API handler must call `const session = await auth()` and return 401 if `!session?.user` before any business logic |
| `bcrypt.hash(password, N)` with rounds below 12 -- insufficient work factor for a compliance platform | Always use `bcrypt.hash(password, 12)` -- this is the project standard established at `src/app/api/auth/register/route.ts:46` |
| Accepting raw `email` without normalization -- allows duplicate accounts and authentication bypass via case or whitespace | Always normalize: `const normalizedEmail = email.trim().toLowerCase()` before any lookup or storage |
| `session.user.role` check missing on admin operations -- privilege escalation | Admin routes must check `session.user.role !== "admin"` and return 403 after the 401 check |
| Importing `bcrypt` or `sql.js` in `auth.config.ts` or any edge-runtime file -- crashes middleware at the edge | Keep `auth.config.ts` free of Node.js-only dependencies; use it only in `middleware.ts` |
| `password.length` accepted outside 8-72 range -- weak passwords or bcrypt truncation | Validate `password.length >= 8 && password.length <= 72` before hashing; return 400 with specific message on violation |
| Accessing `session.user.id` or `session.user.role` without null check -- JWT type augmentation marks these as optional (`id?`, `role?`) | Always guard with `if (token.id)` / `if (session?.user?.id)` before use |

## auth() Usage Pattern

Every API route handler that accesses or mutates data must follow this guard sequence at the top of the function body, before `ensureDb()` or any business logic:

```typescript
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  // 1. Authentication gate -- always first
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Authorization gate -- only when the operation requires a specific role
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Now safe to proceed with ensureDb() and business logic
  await ensureDb();
  // ...
}
```

**Rules:**

1. `auth()` is imported from `@/auth` (the full NextAuth config with providers and callbacks), never from `auth.config`.
2. The 401 check uses `!session?.user` -- not `!session` alone, because NextAuth can return a session object with a null user.
3. The 403 check compares `session.user.role` against the required role string. Do not invent role hierarchies; check for the exact role.
4. Self-action prevention: when an admin operation targets another user by ID, compare `Number(id) === Number(session.user.id)` and return 400 if they match (see revoke-session route pattern).

**Exempt routes** (do NOT add auth gates to these):

| Route | Reason |
|---|---|
| `api/auth/[...nextauth]/*` | NextAuth's own sign-in/sign-out/callback handlers |
| `api/auth/register` | Registration endpoint -- user has no session yet |
| `api/health` | Infrastructure health check -- must respond without credentials |

## Middleware Configuration

The Next.js middleware at `middleware.ts` (project root) provides page-level auth gating using the edge-safe config:

```typescript
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|login|register|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
```

**Rules:**

1. `auth.config.ts` lives at the project root alongside `middleware.ts`. It contains zero Node.js-only imports -- no `bcryptjs`, no `sql.js`, no `@/lib/db-imports`.
2. The `authorized` callback returns `!!auth?.user`. When false, NextAuth redirects to `pages.signIn` (`/login`).
3. The matcher regex excludes `api/auth`, `login`, `register`, static assets, and `favicon.ico`. If you add a new public route, add it to the matcher exclusion.
4. Middleware protects pages only. It does NOT protect API routes -- API routes must call `auth()` themselves (see section above). The middleware matcher deliberately does not exclude `api/*` paths, but the `authorized` callback only redirects (302), which is meaningless for API consumers. API routes must return proper 401 JSON.

## Edge-Safe Config Split

NextAuth v5 requires splitting config to support the edge runtime used by Next.js middleware:

| File | Runtime | Contains | Used by |
|---|---|---|---|
| `auth.config.ts` (root) | Edge | `pages`, `callbacks.authorized`, `trustHost`, empty `providers` | `middleware.ts` |
| `src/auth.ts` | Node.js | Credentials provider, bcrypt, sql.js DB calls, JWT/session callbacks, type augmentation | API routes, server components |

Never merge these files. The split exists because `bcryptjs` and `sql.js` (WASM) cannot run in the edge runtime. If a future provider (e.g., Google OAuth) needs no Node.js deps, it may be added to `auth.config.ts` providers, but Credentials must remain in `src/auth.ts`.

## bcrypt Conventions

| Parameter | Value | Rationale |
|---|---|---|
| Library | `bcryptjs` | Pure JS -- no native compilation; works in all environments |
| Salt rounds | `12` | Project standard; higher than the typical default of 10 |
| Max input length | `72` bytes | bcrypt spec truncates silently beyond 72; enforce at validation |
| Min input length | `8` characters | Minimum complexity floor for compliance context |

**Password validation sequence** (must happen before hashing):

```typescript
if (password.length < 8) {
  return NextResponse.json(
    { error: "Password must be at least 8 characters" },
    { status: 400 }
  );
}
if (password.length > 72) {
  return NextResponse.json(
    { error: "Password must be 72 characters or fewer" },
    { status: 400 }
  );
}

const passwordHash = await bcrypt.hash(password, 12);
```

**Comparison:** Always use `bcrypt.compare(candidatePassword, storedHash)`. Never compare hashes with `===` -- `bcrypt.compare` is constant-time and prevents timing attacks.

## Session Lifecycle

Vaulta uses JWT-based sessions (NextAuth default) with a supplementary session table in SQLite for revocation tracking:

1. **Sign-in:** The `jwt` callback generates `crypto.randomUUID()` as `sessionId`, stores it via `createSession(sessionId, userId)`.
2. **Subsequent requests:** The `jwt` callback checks if the session row exists; if the DB was wiped (redeploy), it re-creates the row. This is a lazy re-hydration pattern, not a security bypass.
3. **Layout validation:** `src/app/(app)/layout.tsx` calls `getSessionById(sessionId)` and redirects to `/login` if the row is missing or `revoked === true`.
4. **Revocation:** Admin calls `revokeUserSessions(userId)` which marks all session rows for that user as revoked. The user is forced to re-login on next page load.
5. **Activity tracking:** `touchSession(sessionId)` updates `last_seen_at` on every authenticated layout render.

**Rules:**

1. `session.user.sessionId` is the link between JWT and DB row. It is set in the `jwt` callback and propagated via the `session` callback.
2. Session validation in the layout is a UI-level gate. It does NOT protect API routes -- API routes must call `auth()` independently.
3. Self-revocation is prevented: the revoke-session endpoint checks `Number(id) === Number(session.user.id)` and returns 400.

## Session Type Augmentation

The NextAuth session and JWT types are augmented in `src/auth.ts`:

```typescript
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      sessionId?: string;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    sessionId?: string;
  }
}
```

**Rules:**

1. All type augmentations live in `src/auth.ts` -- not in a separate `.d.ts` file.
2. JWT fields are optional (`?`) because they are only populated after first sign-in. Code consuming JWT fields must handle `undefined`.
3. Session `id` and `role` are non-optional on the Session type but are conditionally set in the `session` callback using `if (token.id)` guards. Downstream code should still null-check defensively.

## Admin Route Protection Pattern

Routes under `api/admin/*` require both authentication and admin role. Follow this exact pattern from `src/app/api/admin/users/[id]/revoke-session/route.ts`:

```typescript
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth gate
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // 2. Role gate
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Self-action prevention (when operating on a user resource)
  const { id } = await params;
  if (Number(id) === Number(session.user.id)) {
    return NextResponse.json(
      { error: "Cannot terminate your own session" },
      { status: 400 }
    );
  }

  // 4. Business logic
  await ensureDb();
  // ...
}
```

## Email Normalization

All email handling must normalize before comparison or storage:

```typescript
const normalizedEmail = email.trim().toLowerCase();
```

This prevents:
- Duplicate accounts via `"User@Example.com"` vs `"user@example.com"`
- Authentication bypass via leading/trailing whitespace
- Case-sensitivity issues in lookups

Apply normalization at both ingress points: the `authorize` callback in `src/auth.ts` and the registration endpoint.

## Known Gaps

The following are known gaps in the current implementation. They are documented here so that future work addresses them intentionally rather than accidentally:

| Gap | Risk | Notes |
|---|---|---|
| No rate limiting on `/api/auth` endpoints | Brute-force password guessing | Should be addressed at infrastructure level (WAF/reverse proxy) or via middleware |
| No account lockout after failed attempts | Credential stuffing | Track failed attempts in the sessions table or a dedicated table |
| No password reset flow | Users locked out permanently if password forgotten | Requires email infrastructure |
| No MFA | Single-factor auth for sensitive compliance data | Consider TOTP or WebAuthn for admin accounts |
| Auth events not logged to audit trail | Compliance audit gap -- cannot prove who logged in when | See logging.md when established |
| Session TTL not explicitly configured | JWT expiration relies on NextAuth defaults | Set `session.maxAge` in `auth.config.ts` |

## Related

- [security.md](./security.md) -- broader security controls, HTTPS, CSP, secrets management
- [rest-api.md](./rest-api.md) -- route file structure, response shapes, error handling (auth gates are the first step in every route)
- [logging.md](./logging.md) -- audit trail requirements for authentication events
