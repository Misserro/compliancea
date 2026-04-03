# Task 2 Implementation Plan — Chat Route: Auto-Retry + Delta Fallback + var Fix

## File Modified

`src/app/api/legal-hub/cases/[id]/chat/route.ts`

## Change 1: `var genResponse` -> `let genResponse`

- Remove both `var genResponse = await anthropic.messages.create(...)` declarations (lines 318 and 378).
- Declare a single `let genResponse: Awaited<ReturnType<typeof anthropic.messages.create>>;` before the `if (cachedSession)` block (around line 241, after `firstUserMessage` declaration).
- Change both assignment sites to `genResponse = await anthropic.messages.create(...)` (no `var`/`let` keyword).

## Change 2: `_getVectorCandidates` delta fallback

- Wrap lines 247-254 (the `_getVectorCandidates` call and the deltaChunks filtering/slicing) in a try/catch.
- On catch: set `deltaChunks = []` as an empty `RetrievalChunk[]` array.
- This ensures that if the vector delta lookup fails, the chat proceeds with priming context only.

The structure becomes:
```typescript
let deltaChunks: RetrievalChunk[] = [];
try {
  const deltaRaw = await (retrievalService as any)._getVectorCandidates(...);
  deltaChunks = (deltaRaw as RetrievalChunk[]).filter(...).slice(0, 5);
} catch (deltaErr) {
  console.error("[chat/route] Delta vector search failed, falling back to priming only:", deltaErr);
  deltaChunks = [];
}
```

## Change 3: Backend auto-retry wrapper

- The processing block that goes inside the retry starts at line 232 (`const cachedSession = getSessionContext(...)`) and ends at line 481 (`return NextResponse.json(structured);`).
- Auth, body parsing, case lookup, forceRefresh handling (lines 167-230) remain OUTSIDE the retry wrapper.
- Define a simple inline `runWithRetry` helper function inside `POST`, just before the processing block:

```typescript
async function runWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2, delayMs = 500): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      clearSessionContext(userId, caseIdStr);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}
```

Note: `clearSessionContext(userId, caseIdStr)` is called BEFORE the retry attempt (inside the catch, before the delay or after the delay -- per the README it should be before the second attempt, so inside the catch block after the delay is fine too, but since it's before the `return await fn()` of attempt 2, placing it in the catch before the delay is clearest. Actually, per the spec: "call clearSessionContext before the retry attempt". I'll call it in the catch block before the delay, so the session is cleared, then we wait, then retry.)

- Extract the processing logic (lines 232-481) into an inline async function `processingFn`.
- Call `runWithRetry(processingFn)` inside the existing try/catch.
- The outer catch (line 482) remains and handles the case where both attempts fail, returning `parseError: true`.

## Scope boundaries

- Lines 167-230 (auth, body parsing, case lookup, forceRefresh): UNCHANGED, remain outside retry.
- Lines 232-481 (session cache check through response): wrapped in retry via `processingFn`.
- Lines 482-493 (outer catch): UNCHANGED (catches retry exhaustion).

## Risks

- The `runWithRetry` helper captures `userId` and `caseIdStr` from the outer POST scope via closure -- this is safe since they are `const`-like values declared before the retry block.
- The `legalCase`, `modelName`, `message`, `history`, `session` variables are also captured by closure -- all are immutable within the request lifecycle.

## Success Criteria Verification

1. On unhandled exception: retries once after 500ms, then returns `parseError: true` -- YES, via `runWithRetry` wrapping `processingFn`.
2. Before retry: `clearSessionContext` called -- YES, in the catch block of `runWithRetry`.
3. `_getVectorCandidates` failure falls back to empty delta -- YES, via try/catch around the delta block.
4. `var genResponse` replaced with `let genResponse` -- YES, single declaration before if/else.
5. Auth/body/case NOT inside retry -- YES, remain outside.
6. `tsc --noEmit` passes -- will verify after implementation.
