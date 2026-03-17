# Error Handling Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / Next.js 15 App Router API routes, server utilities, AI pipelines
> Related: [rest-api.md](./rest-api.md), [authentication-authorization.md](./authentication-authorization.md), [security.md](./security.md), [logging.md](./logging.md), [database.md](./database.md)

## Principle

A compliance platform that loses error context, swallows failures silently, or returns inconsistent error shapes cannot be audited and cannot be trusted. Every error in Vaulta must be classifiable (validation, not-found, conflict, external service, internal), traceable (the original cause is always preserved), and recoverable (pipelines degrade gracefully so that partial success is never discarded). Error handling exists to protect data integrity and operator confidence -- not merely to prevent crashes.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| Empty catch blocks that swallow errors silently (`catch { }` or `catch { /* ignore */ }`) | Log with `console.warn()` or `console.error()` before continuing -- every suppressed error must leave a trace |
| `(err as { statusCode?: number })?.statusCode` type casting for status extraction -- unsafe, no compiler guarantee | Use `err instanceof Error` type guard first; extract attached properties via a helper function (see Custom Error Properties below) |
| Discarding the original error message in catch blocks (`{ error: "Failed to fetch contracts" }` with no cause) | Include the extracted message: `{ error: \`Failed to fetch contracts: \${message}\` }` so operators can diagnose without reproducing |
| `throw "string literal"` or `throw { message: "..." }` -- non-Error throwables break `instanceof` checks | Always `throw new Error(message)` or `throw Object.assign(new Error(message), { statusCode })` |
| Catch block typed as `catch (err: any)` -- disables type safety on the error path | Always `catch (err: unknown)` and narrow with `instanceof` |

## Error Response Shape

Every error response from an API route uses the `{ error: string }` envelope. Extended context is optional via `details`.

```typescript
// Standard error
return NextResponse.json({ error: "Obligation not found" }, { status: 404 });

// Extended error with details (e.g., AI parse failures)
return NextResponse.json(
  { error: "Claude returned non-JSON output unexpectedly.", details: responseText || null },
  { status: 502 }
);
```

Rules:

1. The `error` field is always a human-readable string -- never a stack trace, never an object.
2. The `details` field is optional and used only when additional context aids debugging (malformed AI output, validation detail arrays).
3. Never return a bare string body. Always wrap in `{ error }`.

## Error Message Extraction

Every catch block extracts the error message using the same type guard. No exceptions.

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
2. Always use `err instanceof Error ? err.message : "Unknown error"` -- this is the project-wide convention used in 20+ routes.
3. Never cast `err` directly to access `.message` without the `instanceof` guard.

## Custom Error Properties

When a lower-level function needs to signal a specific HTTP status, attach `statusCode` to the Error object. The route-level catch block extracts it.

### Throwing with statusCode

```typescript
// In a utility or service function
throw Object.assign(new Error("Unsupported file type. Please upload a PDF or DOCX."), {
  statusCode: 400,
});
```

### Extracting statusCode in routes

```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusCode = isErrorWithStatus(err) ? err.statusCode : 500;
  return NextResponse.json({ error: message }, { status: statusCode });
}

// Type guard helper -- define once in @/lib/server-utils or a shared errors module
function isErrorWithStatus(err: unknown): err is Error & { statusCode: number } {
  return err instanceof Error && typeof (err as Record<string, unknown>).statusCode === "number";
}
```

Rules:

1. Only attach `statusCode` -- do not invent other custom properties without updating this standard.
2. Default to 500 when `statusCode` is absent.
3. Valid statusCode values: 400 (validation), 404 (not found), 409 (conflict), 502 (bad upstream response), 503 (external service unavailable).

## HTTP Status Code Selection

| Status | Error class | When to use |
|---|---|---|
| 400 | Validation | Bad ID, missing field, invalid enum, empty PATCH, malformed JSON, unsupported file type |
| 404 | Not found | Database lookup returned null for a specific resource |
| 409 | Conflict | Duplicate resource on creation |
| 500 | Internal | Unhandled server error, missing environment variable, unexpected state |
| 502 | Bad gateway | External service returned unparseable or invalid response (e.g., Claude returns non-JSON) |
| 503 | Service unavailable | External service (AI provider, Google Drive API) is down or unreachable |

Rules:

1. Never return 200 with an error body. If the operation failed, use the appropriate 4xx/5xx status.
2. Choose 502 when the external call succeeded but the response is unusable. Choose 503 when the call itself failed (timeout, connection refused).

## Pipeline Error Handling

Complex routes (analyze, desk, questionnaire) execute multi-step pipelines. Use a two-tier try/catch strategy.

### Outer catch: route-level

Wraps the entire handler. Returns the error response to the client.

```typescript
export async function POST(request: NextRequest) {
  await ensureDb();

  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // full pipeline logic
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    const statusCode = isErrorWithStatus(err) ? err.statusCode : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
```

### Inner catch: step-level (non-critical operations)

Non-critical steps (auto-tagging, embedding generation, version detection, near-duplicate check) get their own try/catch. They log a warning and allow the pipeline to continue.

```typescript
// Non-critical: embedding generation after document upload
try {
  await generateEmbeddings(documentId);
} catch (embeddingErr) {
  console.warn("Embedding generation failed, will retry later:", embeddingErr);
}

// Pipeline continues -- the document was still created successfully
return NextResponse.json({ document }, { status: 201 });
```

Rules:

1. Critical steps (parsing input, calling the primary AI model, writing to the database) propagate to the outer catch -- do not wrap them in inner try/catch.
2. Non-critical steps (enrichment, tagging, notifications) get inner try/catch with `console.warn`.
3. When a pipeline calls an AI provider, always preserve token usage even if later steps fail. Declare token accumulators (`inputTokens`, `outputTokens`) outside the try block so they survive into the catch block.

```typescript
let inputTokens = 0;
let outputTokens = 0;

try {
  const response = await anthropic.messages.create({ /* ... */ });
  inputTokens = response.usage?.input_tokens || 0;
  outputTokens = response.usage?.output_tokens || 0;
  // ... further processing that might fail
} catch (err: unknown) {
  // Token usage is preserved for cost tracking even on failure
  const message = err instanceof Error ? err.message : "Server error";
  return NextResponse.json({
    error: message,
    tokenUsage: { claude: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } },
  }, { status: 500 });
}
```

## Environment Variable Validation

Validate required environment variables at the point of use. Return 500 with a descriptive message.

```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  return NextResponse.json(
    { error: "ANTHROPIC_API_KEY is not set." },
    { status: 500 }
  );
}
```

Rules:

1. Check environment variables before constructing API clients, not at module scope.
2. Name the missing variable in the error message so operators know exactly what to configure.
3. Never expose the variable value in the error response.

## JSON Parsing Errors

When parsing JSON from external sources (AI responses, user input, stored JSON fields), always wrap in try/catch with a specific error message.

```typescript
// Parsing AI response
let parsed;
try {
  parsed = JSON.parse(jsonText);
} catch {
  return NextResponse.json(
    { error: "Claude returned non-JSON output unexpectedly.", details: responseText || null },
    { status: 502 }
  );
}

// Parsing stored JSON field in a component
let details: Record<string, string> = {};
try {
  details = JSON.parse(obligation.details_json || "{}");
} catch {
  console.warn(`Failed to parse details_json for obligation ${obligation.id}`);
}
```

Rules:

1. AI response parse failures return 502 (bad gateway) with the raw response in `details`.
2. Stored JSON parse failures in UI components log a warning and fall back to a safe default (`{}` or `[]`).
3. User-submitted JSON parse failures return 400 with `{ error: "Invalid JSON body" }`.

## Checklist for New Error Handling

- [ ] Catch variable typed as `unknown`
- [ ] Error message extracted via `err instanceof Error ? err.message : "Unknown error"`
- [ ] Custom statusCode attached with `Object.assign(new Error(msg), { statusCode })` -- not by throwing plain objects
- [ ] statusCode extracted via `isErrorWithStatus()` type guard -- not via unsafe casting
- [ ] Non-critical pipeline steps wrapped in inner try/catch with `console.warn`
- [ ] Token usage accumulators declared outside try block for AI-calling routes
- [ ] Environment variables checked before use with descriptive 500 error
- [ ] No empty catch blocks -- every suppressed error logs a trace
- [ ] Error response uses `{ error: string }` shape -- no bare strings, no stack traces

## Related

- [rest-api.md](./rest-api.md) -- response shape, HTTP status codes, route structure
- [authentication-authorization.md](./authentication-authorization.md) -- 401/403 error handling for auth failures
- [security.md](./security.md) -- error messages that must not leak sensitive information
- [logging.md](./logging.md) -- `logAction()` for audit trail, `console.warn` for non-critical failures
- [database.md](./database.md) -- transaction rollback on error, `ensureDb()` initialization failures
