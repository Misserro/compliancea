# Security Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / Next.js 15 App Router, TypeScript, sql.js (WASM), file uploads (PDF/DOCX)
> Related: [authentication-authorization.md](./authentication-authorization.md), [rest-api.md](./rest-api.md), [database.md](./database.md), [error-handling.md](./error-handling.md), [logging.md](./logging.md)

## Principle

Vaulta manages sensitive legal and compliance documents -- contracts, obligations, audit evidence -- for regulated organizations. In this domain, data protection is a legal obligation, not a convenience or a best practice. Every security control exists to ensure that uploaded documents cannot be exfiltrated, user input cannot corrupt the database, and error responses cannot leak internal state. The default posture is deny: files are rejected unless they match an explicit allowlist, paths are blocked unless they resolve inside the designated directory, and user-supplied values never reach SQL or HTML without transformation.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| Dynamic SQL via string concatenation or template literals (`db.exec(\`SELECT * FROM users WHERE id = ${id}\`)`) -- SQL injection | Parameterized queries: `db.prepare("SELECT * FROM users WHERE id = ?")` then `stmt.bind([id])` -- all user values go through `?` placeholders |
| File type validation by extension only (`/\.(pdf|docx)$/i.test(name)`) without MIME type check -- attacker renames `.exe` to `.pdf` | Validate extension AND check MIME type via `file.type` against the allowlist: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (see File Upload Security) |
| `Date.now()` for temp file naming (`upload_${Date.now()}_${name}`) -- second-level collision risk under concurrent requests | `crypto.randomUUID()` for unique temp file names: `` `upload_${crypto.randomUUID()}_${safeName}` `` |
| Raw `err.message` from SQL or system errors returned to the client (`{ error: err.message }`) -- leaks table names, column names, query structure | Classify errors before responding: return a generic message for 500s (`"Internal server error"`); include `err.message` only for validation errors (400) where the message was constructed by application code (see error-handling.md) |
| `escapeHtml()` omitted when rendering user-supplied text in HTML context -- XSS | Always call `escapeHtml()` from `src/lib/utils.ts` on any user-supplied string before embedding in HTML |
| Hardcoded API keys or secrets in source code (`const key = "sk-ant-..."`) | Read from `process.env` at the point of use; validate presence before constructing API clients (see API Key Handling) |

## File Upload Security

All file uploads pass through a three-gate validation sequence before any file is written to disk. The existing implementation at `src/app/api/documents/upload/route.ts` and `src/lib/server-utils.ts` establishes the pattern.

### Gate 1: Extension allowlist

```typescript
if (!/\.(pdf|docx)$/i.test(file.name)) {
  return NextResponse.json({ error: "Only PDF and DOCX files are allowed" }, { status: 400 });
}
```

### Gate 2: MIME type allowlist

Validate `file.type` against the canonical MIME types. This catches renamed files that pass the extension check.

```typescript
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
}
```

### Gate 3: Size limit

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
}
```

### Filename sanitization

All uploaded filenames are sanitized before touching the filesystem. The project pattern lives in `src/lib/server-utils.ts:62`:

```typescript
const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
```

Rules:

1. Only alphanumeric characters, dots, hyphens, and underscores survive. Everything else becomes `_`.
2. Never use the original `file.name` for filesystem operations -- always use the sanitized name.
3. Never trust `file.name` for display without `escapeHtml()`.

### Temp file naming

Temp files must use `crypto.randomUUID()` to avoid collisions under concurrent uploads:

```typescript
import crypto from "crypto";

const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
const tmpPath = path.join("/tmp", `upload_${crypto.randomUUID()}_${safeName}`);
```

### Temp file cleanup

Always clean up temp files in a `finally` block. Log cleanup failures instead of swallowing them:

```typescript
try {
  // process uploaded file
} finally {
  try {
    await fs.unlink(tmpPath);
  } catch (cleanupErr) {
    console.warn(`Failed to clean up temp file ${tmpPath}:`, cleanupErr);
  }
}
```

## Input Validation

### Parameterized queries

All database queries use sql.js parameterized statements. User values never appear in the SQL string.

```typescript
// Correct: parameterized
const stmt = db.prepare("SELECT * FROM documents WHERE id = ? AND category = ?");
stmt.bind([documentId, category]);

// FORBIDDEN: string interpolation
db.exec(`SELECT * FROM documents WHERE id = ${documentId}`);
```

This is enforced at the application level because sql.js has no ORM layer. See database.md for the full query pattern.

### Allowlist-based field filtering

PATCH endpoints define an explicit array of mutable fields. No field outside the allowlist reaches the database. This pattern is defined in rest-api.md and repeated here because it is a security control:

```typescript
const allowed = ["owner", "status", "due_date", "description"];
const updates: Record<string, unknown> = {};
for (const key of allowed) {
  if (body[key] !== undefined) {
    updates[key] = body[key];
  }
}
```

### Enum validation

Enumerated values are validated against constant arrays before any mutation:

```typescript
const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

if (category && !DEPARTMENTS.includes(category)) {
  return NextResponse.json(
    { error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` },
    { status: 400 }
  );
}
```

### Nested JSON validation

When a request body contains nested objects or arrays (e.g., evidence arrays, key points), validate structure before persisting. Never `JSON.stringify()` unchecked user input into a database column.

```typescript
// Validate that evidence is an array of objects with expected shape
if (evidence !== undefined) {
  if (!Array.isArray(evidence)) {
    return NextResponse.json({ error: "Evidence must be an array" }, { status: 400 });
  }
  for (const item of evidence) {
    if (typeof item !== "object" || item === null || typeof item.description !== "string") {
      return NextResponse.json({ error: "Each evidence item must have a description string" }, { status: 400 });
    }
  }
}
```

## Path Traversal Prevention

Every file-serving endpoint must verify that the resolved path stays within the allowed base directory. The canonical pattern is at `src/app/api/documents/[id]/download/route.ts:24-29`:

```typescript
const resolvedPath = path.resolve(document.path);
const resolvedDocsDir = path.resolve(DOCUMENTS_DIR);
if (!resolvedPath.startsWith(resolvedDocsDir)) {
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
```

Rules:

1. Always use `path.resolve()` on both the candidate path and the base directory -- this normalizes `..` segments.
2. Always compare with `.startsWith()` after resolving.
3. Return 403 (not 400) when path traversal is detected -- the request is unauthorized, not malformed.
4. Never construct file paths from raw user input. Paths come from the database; user input selects a resource by ID, and the database provides the path.

## escapeHtml Usage

The `escapeHtml()` function at `src/lib/utils.ts:28-35` escapes the five dangerous HTML characters:

```typescript
export function escapeHtml(str: string): string {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

Rules:

1. Call `escapeHtml()` on any user-supplied string before embedding it in an HTML response (e.g., email templates, exported HTML documents, server-rendered content).
2. React components handle escaping automatically via JSX. Do NOT double-escape by calling `escapeHtml()` on values passed to JSX props.
3. `escapeHtml()` is for HTML context only. For SQL, use parameterized queries. For URLs, use `encodeURIComponent()`. For filenames, use the sanitization regex.

## API Key Handling

All third-party API keys (ANTHROPIC_API_KEY, VOYAGE_API_KEY) follow these rules:

1. **Source:** Read exclusively from `process.env` at the point of use -- never hardcoded, never imported from a config file that could be bundled client-side.
2. **Validation:** Check for presence before constructing API clients. Return 500 with a descriptive message naming the missing variable (but never its value).
3. **Logging:** API keys must never appear in log output, error messages, or API responses. If a key is used in a URL, redact it before logging.
4. **Client boundary:** API keys live only in server-side code (`src/app/api/`, `src/lib/`). Never pass them to client components. Next.js 15 App Router API routes are server-only by default, but verify that no `"use client"` directive exists in files that reference `process.env` keys.

```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  return NextResponse.json(
    { error: "ANTHROPIC_API_KEY is not set." },
    { status: 500 }
  );
}
// Use apiKey -- never log it, never return it in the response
```

## Error Message Safety

Error responses must not leak internal implementation details. The classification:

| Error source | What to return | Example |
|---|---|---|
| Validation (application-constructed message) | The application message as-is | `{ error: "Invalid category. Must be one of: Finance, Compliance, ..." }` |
| Resource not found | Specific not-found message | `{ error: "Document not found" }` |
| SQL error or system error | Generic message only | `{ error: "Internal server error" }` |
| External service failure | Service-specific generic message | `{ error: "AI service temporarily unavailable" }` |

For 500-level errors caught in route handlers, prefer a generic message. Log the full error server-side for debugging:

```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("Route error:", message);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

See error-handling.md for the full error classification and extraction patterns.

## Security Headers

The following headers should be configured at the infrastructure or middleware level. They are documented here as the project security requirements:

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` | Prevents XSS via injected scripts |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS for one year |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information leakage |

These can be set via `next.config.ts` headers configuration or a custom middleware. The CSP value above is a starting point -- adjust `script-src` and `style-src` based on actual runtime requirements (e.g., if inline styles from a component library are needed).

## Known Gaps

The following are known gaps in the current implementation. They are documented here so that future work addresses them intentionally:

| Gap | Risk | Mitigation path |
|---|---|---|
| No rate limiting on auth endpoints | Brute-force password guessing | Implement at infrastructure level (WAF/reverse proxy) or via Next.js middleware with in-memory counter |
| No CORS headers configured | `ALLOWED_ORIGIN` env var exists but no implementation | Add CORS middleware that reads `ALLOWED_ORIGIN` and sets `Access-Control-Allow-Origin` accordingly |
| MIME type validation not implemented | Renamed malicious files pass extension check | Add Gate 2 (file.type check) to all upload routes per the pattern above |
| No magic byte validation | Sophisticated file type spoofing | Consider `file-type` npm package for production deployments handling untrusted uploads |
| Temp file naming uses `Date.now()` | Collision under concurrent requests | Replace with `crypto.randomUUID()` in `writeTempFile()` at `src/lib/server-utils.ts:71` |
| Temp file cleanup errors silently swallowed | Disk space leak over time | Add `console.warn` to cleanup catch block at `src/lib/server-utils.ts:76-82` |
| No Content-Security-Policy headers | XSS via injected scripts | Configure in `next.config.ts` or middleware |
| No HSTS headers | Downgrade attacks on HTTPS | Configure `Strict-Transport-Security` header |
| Password requirements enforce only length | Weak passwords with common patterns | Consider minimum entropy check or banned-password list for future iteration |
| `SESSION_ACTIVE_WINDOW_MINUTES` defined but usage unclear | Session timeout may not be enforced | Verify session expiry logic uses this value; document in authentication-authorization.md |

## Checklist for Security Review

- [ ] All database queries use parameterized `?` placeholders -- no string interpolation
- [ ] File uploads validate extension (regex), MIME type (`file.type`), and size (10 MB)
- [ ] Uploaded filenames sanitized with `/[^a-zA-Z0-9._-]/g` regex before filesystem use
- [ ] Temp files named with `crypto.randomUUID()`, not `Date.now()`
- [ ] Temp files cleaned up in `finally` block with logged errors
- [ ] File download paths verified with `path.resolve()` + `.startsWith()` against base directory
- [ ] User-supplied strings escaped with `escapeHtml()` before HTML embedding
- [ ] API keys read from `process.env` only, validated before use, never logged or returned
- [ ] PATCH endpoints use allowlist arrays for field filtering
- [ ] Enum values validated against constant arrays before mutation
- [ ] Nested JSON structures validated before `JSON.stringify()` and storage
- [ ] Error responses for 500-level errors use generic messages, not raw `err.message`
- [ ] No `"use client"` directive in files that access `process.env` secret keys
- [ ] `auth()` called and checked before any data access (see authentication-authorization.md)

## Related

- [authentication-authorization.md](./authentication-authorization.md) -- session management, bcrypt conventions, auth gates, role-based access
- [rest-api.md](./rest-api.md) -- route structure, input validation patterns, response shapes, file path security
- [database.md](./database.md) -- parameterized query patterns, `ensureDb()` / `saveDb()` lifecycle, transaction safety
- [error-handling.md](./error-handling.md) -- error classification, message extraction, pipeline error handling
- [logging.md](./logging.md) -- audit trail for mutations, what must never appear in logs
