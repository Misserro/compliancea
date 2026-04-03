# Plan 050 — Legal Hub Chat Resilience & Auto-Retry

## Overview

Legal Hub case chat shows "I wasn't able to process the response. Please try again." on approximately 1 in 3–5 first messages. Root cause: `getEmbedding()` in `lib/embeddings.js` calls the Voyage AI API to embed the user's query at retrieval time with no retry, no timeout, and no fallback. Any transient Voyage error (rate limit, network blip, 5xx) propagates up through `CaseRetrievalService._getVectorCandidates()` → `search()` → chat route outer catch → `{ parseError: true }` response → user-visible error.

This plan adds three defences:

1. **Voyage query embedding retry** — `getEmbedding()` retries up to 3 times with exponential backoff (200ms, 400ms) and a 10-second per-attempt timeout. Eliminates the primary failure at source.
2. **Backend auto-retry** — the chat route retries the full processing pipeline once on any unhandled exception before returning `parseError`. User never sees a transient failure; no frontend change needed.
3. **Turn 2+ delta fallback + `var` scoping fix** — `_getVectorCandidates` on the Turn 2+ delta path is wrapped in try/catch; on failure it falls back to an empty delta (priming context alone is returned). Also fixes `var genResponse` → proper `let` declaration before the if/else branches.

### Expected outcome

- First-message failure rate drops from ~1 in 3–5 to near-zero for transient Voyage errors.
- Any remaining unhandled error is retried once transparently; user only sees an error if both attempts fail.
- Turn 2+ delta failures no longer surface as errors — they gracefully degrade to priming-only answers.

---

## Architecture Decisions

### Task 1 — `getEmbedding()` retry + timeout

Voyage AI returns HTTP 429 (rate limit) or 5xx (transient) on roughly 20–33% of chat requests. The current implementation has no retry and no timeout: a single failed fetch call throws immediately.

**Fix:**
- Wrap the fetch in a retry loop: attempt 1, then 200ms delay + attempt 2, then 400ms delay + attempt 3.
- Each attempt uses `AbortController` with a 10-second signal.
- Retry only on 429 and 5xx (transient). Do not retry on 400/401/403 (permanent errors).
- On all retries exhausted: throw the last error (let callers handle it).

**Why not catch here and return null?** `getEmbedding` is used during indexing too. Silently returning null would corrupt stored embeddings. The function must throw; the chat route handles the fallback.

### Task 2 — Backend auto-retry in chat route

**Retry wrapper pattern:**
```
async function runWithRetry(fn, maxAttempts = 2, delayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
```

The `fn` is an inline async function containing all processing logic from the session cache check through to `return NextResponse.json(structured)`. Auth, body parsing, and case lookup remain outside — they are not retryable (no point retrying a 404 or 401).

**Session cache handling on retry:** Before the second attempt, call `clearSessionContext(userId, caseIdStr)`. This ensures a clean Turn 1 on retry — avoids the situation where attempt 1 partially populated the cache before throwing.

**Retry scope:** The retry wrapper replaces the outer `try/catch` block (lines 182–493). The outer `try/catch` becomes: run `runWithRetry(processingFn)`, and if that also throws, return `{ parseError: true }`.

### Turn 2+ delta fallback

`_getVectorCandidates` is a private method accessed via `as any`. If it throws (e.g., Voyage is down for multiple seconds), the current code propagates to the outer catch. With the retry wrapper this would trigger a second attempt — which is good. But as belt-and-suspenders, wrap the delta call in try/catch and fall back to `deltaChunks = []`. This means the answer uses only priming chunks — still a high-quality response, just without the fresh delta top-5.

### `var genResponse` fix

`var genResponse` is declared twice (once inside the `if` branch, once inside the `else` branch) due to `var`'s function-scoped hoisting. Replace with:
```typescript
let genResponse: Awaited<ReturnType<typeof anthropic.messages.create>>;
if (cachedSession) {
  // ...
  genResponse = await anthropic.messages.create(...);
} else {
  // ...
  genResponse = await anthropic.messages.create(...);
}
```

---

## Task List

### Task 1 — `getEmbedding()` retry + timeout

**Description:**
Add retry logic (3 attempts, 200ms/400ms backoff) and per-attempt `AbortController` timeout (10s) to `getEmbedding()` in `lib/embeddings.js`. Retry only on 429 and 5xx status codes; throw immediately on 4xx permanent errors.

**Files:**
- `lib/embeddings.js`

**Patterns:**
- Read `lib/embeddings.js` — current `getEmbedding` implementation

**Success Criteria:**
- `getEmbedding()` retries up to 3 times on 429/5xx before throwing
- Each attempt has a 10-second `AbortController` timeout
- 400/401/403 errors are NOT retried — thrown immediately
- The function signature and return type are unchanged
- Existing callers (indexing pipeline) continue to work — no change to call sites
- `tsc --noEmit` passes (note: `lib/embeddings.js` is `.js`, not `.ts` — no TypeScript check, but verify no import breakage)

**Dependencies:** none

---

### Task 2 — Chat route: backend auto-retry + delta fallback + `var` fix

**Description:**
Three changes to `src/app/api/legal-hub/cases/[id]/chat/route.ts`:

1. Extract the processing logic (session cache check through response) into an inline async function and wrap with a 2-attempt retry helper (500ms delay, `clearSessionContext` before retry attempt).
2. Wrap the `_getVectorCandidates` delta call (Turn 2+ path) in try/catch; on failure fall back to `deltaChunks = []`.
3. Replace `var genResponse` declarations with a single `let genResponse` declared before the if/else block.

**Files:**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts`

**Patterns:**
- Read `src/app/api/legal-hub/cases/[id]/chat/route.ts` lines 163–494 — full POST handler structure
- Read `src/lib/chat-context-cache.ts` — `clearSessionContext` signature

**Success Criteria:**
- On unhandled exception in processing, route retries once (after 500ms) before returning `parseError: true`
- Before retry: `clearSessionContext(userId, caseIdStr)` is called to reset session state
- `_getVectorCandidates` failure on Turn 2+ path does NOT throw — falls back to empty delta, chat proceeds with priming context only
- `var genResponse` is replaced with a single `let genResponse` declaration before the if/else
- Auth, body parsing, and case validation (lines before the processing block) are NOT inside the retry wrapper — they remain outside and short-circuit directly
- `tsc --noEmit` passes

**Dependencies:** none (can run in parallel with Task 1)

---

## Concurrency

2 tasks, no interdependency — run in parallel.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Retry doubles latency on failure | Low | 500ms delay × 1 retry = max +500ms extra wait, only on failure path. Success path is unaffected. |
| Retry hides persistent errors | Low | Only 1 retry; `parseError` still shown on double failure. Server logs both attempts. |
| `clearSessionContext` on retry wastes Turn 1 | Low | Cache miss on retry means full retrieval re-runs — correct behaviour, same as a fresh request. |
| `getEmbedding` retry adds latency during indexing | Low | Retry only fires on 429/5xx; normal indexing is unaffected. Max added latency 600ms per chunk on failure. |
| `AbortController` timeout too short | Low | 10s is generous for a single embedding call (typical <200ms). Only fires on genuine stalls. |

---

## Tech Stack

- `lib/embeddings.js` — `getEmbedding` (plain JS)
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — Next.js App Router POST handler (TypeScript)
- `src/lib/chat-context-cache.ts` — `clearSessionContext`
