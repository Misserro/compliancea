# REST API Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / Next.js 15 App Router API routes
> Related: [authentication-authorization.md](./authentication-authorization.md), [security.md](./security.md), [error-handling.md](./error-handling.md), [logging.md](./logging.md), [database.md](./database.md)

## Principle

Every API route in Vaulta guards the integrity of compliance data. A compliance platform that accepts malformed input, returns ambiguous errors, or silently drops mutations cannot be trusted by regulated organizations. Routes must validate eagerly, fail explicitly, and return predictable response shapes so that both the UI and audit trail can rely on the API as a single source of truth.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| `request.json().catch(() => ({}))` -- silent parse failure that treats malformed JSON as empty body | Parse with `await request.json()` inside try-catch; return `{ error: "Invalid JSON body" }` with status 400 on parse failure |
| `parseInt(id)` without `isNaN()` guard -- NaN propagates silently into database queries | Always check `if (isNaN(id))` immediately after `parseInt(id, 10)` and return 400 |
| Bare `Request` type on handlers -- loses Next.js typed helpers | Always use `NextRequest` from `next/server` as the request parameter type |
| Cascading deletes without database transaction -- partial deletion leaves orphaned records | Wrap multi-table deletes in a transaction (see database.md) |
| PATCH handler that executes on empty update set -- writes a no-op mutation and misleading audit log | Check `Object.keys(updates).length === 0` and return `{ error: "No valid fields to update" }` with status 400 |
| Unvalidated nested JSON fields stringified into SQL -- injection and corruption risk | Validate structure of nested objects before persisting; never stringify unchecked user input |

## Route File Structure

Every API route file follows this layout, in order:

```typescript
// 1. Imports
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getResourceById, updateResource } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

// 2. Runtime declaration
export const runtime = "nodejs";

// 3. Constants (enums, allowlists, limits)
const ALLOWED_STATUSES = ["active", "finalized", "archived"];

// 4. Handler exports (GET, POST, PATCH, DELETE)
export async function GET(request: NextRequest) {
  await ensureDb();
  // ...
}
```

Rules:

1. Every route file exports `runtime = "nodejs"` at module level, before handler functions.
2. `await ensureDb()` is the first statement inside every handler, before any business logic.
3. Import `NextRequest` and `NextResponse` from `next/server` -- never use the bare `Request`/`Response` globals.
4. Group imports: next/server first, then `@/lib/*` utilities, then `@/lib/*` database functions, then audit.

## URL Parameters and Validation

Next.js 15 App Router passes params as a Promise. Always await before destructuring.

```typescript
// Destructured params signature (preferred for single-resource routes)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  // ...
}

// Props-based signature (alternative, equivalent)
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  // ...
}
```

Rules:

1. Always `parseInt(value, 10)` with radix 10 -- never rely on implicit radix.
2. Always check `isNaN()` immediately after parsing and return 400 before any database call.
3. Pick one params signature style per file and be consistent.

## Query Parameters

Use the URL constructor on `request.url` to extract search params. Always provide defaults for optional filters.

```typescript
const { searchParams } = new URL(request.url);
const filter = searchParams.get("filter") || "active";
const page = parseInt(searchParams.get("page") || "1", 10);
```

## Request Body Handling

### JSON bodies

Parse inside the try-catch. Reject malformed JSON explicitly.

```typescript
let body: Record<string, unknown>;
try {
  body = await request.json();
} catch {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}
```

### Multipart form-data (file uploads)

```typescript
const formData = await request.formData();
const file = formData.get("file") as File | null;
if (!file) {
  return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
}

// Validate type
if (!/\.(pdf|docx)$/i.test(file.name)) {
  return NextResponse.json({ error: "Only PDF and DOCX files are allowed" }, { status: 400 });
}

// Validate size (10 MB)
if (file.size > 10 * 1024 * 1024) {
  return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
}
```

Rules:

1. File type validation uses regex against the filename extension.
2. File size limit is 10 MB. Define the limit as a constant if reused.
3. Always cast `formData.get()` results with `as File | null` or `as string | null`.

## PATCH: Allowlist-Based Field Filtering

PATCH endpoints define an explicit allowlist of mutable fields. No field outside the allowlist reaches the database.

```typescript
const body = await request.json();
const allowed = ["owner", "status", "due_date", "description"];
const updates: Record<string, unknown> = {};
for (const key of allowed) {
  if (body[key] !== undefined) {
    updates[key] = body[key];
  }
}

if (Object.keys(updates).length === 0) {
  return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
}
```

Rules:

1. Use `body[key] !== undefined` (not `!= null`) so that explicit `null` values pass through for field clearing.
2. Always reject empty update sets with 400 before calling the database layer.
3. If a status value requires a dedicated endpoint (e.g., "finalized"), block it in the PATCH handler and return 400 with guidance.

## Enum and Value Validation

Validate enumerated values via array membership before any mutation.

```typescript
const ALLOWED_STATUSES = ["open", "resolved", "dismissed"];

if (!ALLOWED_STATUSES.includes(status)) {
  return NextResponse.json(
    { error: `Invalid status. Must be: ${ALLOWED_STATUSES.join(", ")}` },
    { status: 400 }
  );
}
```

Rules:

1. Define the valid set as a module-level `const` array.
2. Include the allowed values in the error message so the caller can self-correct.

## Conflict Detection

Before creating a resource, check for duplicates and return 409 if a conflict exists.

```typescript
const existing = getDocumentByPath(filePath);
if (existing) {
  return NextResponse.json({ error: "Document already exists in library" }, { status: 409 });
}
```

## Response Shape

All responses follow a predictable envelope. The resource key matches the resource name (singular for single, plural for collections).

### Success responses

```typescript
// Single resource
return NextResponse.json({ document: updatedDocument });

// Collection
return NextResponse.json({ obligations, stats: { total, active, overdue } });

// Mutation with message
return NextResponse.json({ message: "Obligation updated", obligation: updated });

// Resource creation (status 201)
return NextResponse.json({ document }, { status: 201 });
```

### Error responses

Every error response uses the `{ error: string }` shape. No exceptions.

```typescript
return NextResponse.json({ error: "Contract not found" }, { status: 404 });
```

## HTTP Status Codes

| Status | When to use | Example |
|---|---|---|
| 200 | Successful GET, PATCH, DELETE | Resource fetched or updated |
| 201 | Successful POST that creates a resource | Document uploaded, obligation created |
| 400 | Validation failure: bad ID, missing field, invalid enum, empty PATCH, malformed JSON | `{ error: "Invalid ID" }` |
| 404 | Resource lookup returned null | `{ error: "Obligation not found" }` |
| 409 | Duplicate resource on creation | `{ error: "Document already exists in library" }` |
| 500 | Unhandled server error, missing env vars | `{ error: "..." }` |
| 503 | External service (AI provider, drive API) unavailable | `{ error: "Service temporarily unavailable" }` |

Rules:

1. POST endpoints that create resources return 201, not 200.
2. Always set status explicitly via `NextResponse.json(data, { status })` -- do not rely on implicit 200 for mutations.
3. On mutation success, re-fetch the resource from the database and return the fresh copy.

## Mutation Lifecycle

Every mutation (POST, PATCH, DELETE) follows this sequence:

```
ensureDb() -> validate input -> check existence -> mutate -> saveDb() -> logAction() -> re-fetch -> respond
```

1. **ensureDb()** -- initialize database connection.
2. **Validate input** -- parse body, check required fields, validate enums, check allowlist.
3. **Check existence** -- for PATCH/DELETE, verify the resource exists (404 if not). For POST, check for conflicts (409 if duplicate).
4. **Mutate** -- call the database function.
5. **saveDb()** -- persist SQLite changes to disk after every mutation.
6. **logAction()** -- record the mutation in the audit log: `logAction(resource, id, verb, details)`.
7. **Re-fetch** -- query the resource again to get the canonical post-mutation state.
8. **Respond** -- return the fresh resource in the standard envelope.

## Error Handling

Every handler wraps its body in try-catch. The catch block extracts the error message safely.

```typescript
try {
  // handler logic
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
```

Rules:

1. Always type the catch variable as `unknown`.
2. Use `err instanceof Error ? err.message : "Unknown error"` -- never cast directly.
3. For non-critical operations within a handler (e.g., sending a notification after a successful mutation), wrap the non-critical part in its own try-catch, log the warning, and continue the response pipeline.

```typescript
// Non-critical: embedding generation after document upload
try {
  await generateEmbeddings(documentId);
} catch (embeddingErr) {
  console.warn("Embedding generation failed, will retry later:", embeddingErr);
}

return NextResponse.json({ document }, { status: 201 });
```

## Environment Variables

Validate required environment variables before use. Return 500 with a descriptive error if missing.

```typescript
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  return NextResponse.json(
    { error: "OpenAI API key not configured" },
    { status: 500 }
  );
}
```

## File Path Security

When constructing file paths from user input, always resolve and validate against the allowed base directory.

```typescript
const resolvedPath = path.resolve(baseDir, userInput);
if (!resolvedPath.startsWith(path.resolve(baseDir))) {
  return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
}
```

See [security.md](./security.md) for the full path traversal prevention checklist.

## Token Usage Tracking

Routes that call AI providers track token consumption per-request and return it in the response.

```typescript
return NextResponse.json({
  result,
  tokenUsage: {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
  },
});
```

Token tracking is per-route, not middleware-based. Each handler accumulates its own totals.

## Checklist for New Routes

- [ ] File exports `runtime = "nodejs"`
- [ ] Handler uses `NextRequest` (not bare `Request`)
- [ ] `await ensureDb()` is the first line
- [ ] URL params are awaited before destructuring (`await params`)
- [ ] Numeric IDs parsed with `parseInt(x, 10)` and guarded with `isNaN()`
- [ ] JSON body parsed inside try-catch with 400 on failure
- [ ] PATCH uses allowlist array for field filtering
- [ ] Empty PATCH body rejected with 400
- [ ] Enum values validated via `array.includes()`
- [ ] POST checks for duplicates and returns 409 on conflict
- [ ] POST returns 201, not 200
- [ ] `saveDb()` called after every mutation
- [ ] `logAction()` called after every mutation
- [ ] Resource re-fetched after mutation and returned fresh
- [ ] Error response shape is `{ error: string }`
- [ ] Catch block types error as `unknown`, extracts message safely
- [ ] File uploads validate type (regex) and size (10 MB limit)
- [ ] Environment variables validated before use

## Related

- [authentication-authorization.md](./authentication-authorization.md) -- session checks, role guards on routes
- [security.md](./security.md) -- path traversal, input sanitization, CORS
- [error-handling.md](./error-handling.md) -- error classification, structured logging on failure
- [logging.md](./logging.md) -- `logAction()` contract, audit trail schema
- [database.md](./database.md) -- `ensureDb()`, `saveDb()`, transaction patterns, query layer conventions
