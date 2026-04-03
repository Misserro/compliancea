# Lead Notes — Plan 050: Chat Resilience & Auto-Retry

## Plan Overview

Fix "I wasn't able to process the response" error on ~1 in 3-5 Legal Hub chat first messages.

Root cause: `getEmbedding()` in `lib/embeddings.js` calls Voyage AI to embed the user's query at
retrieval time with no retry/timeout/fallback. Transient 429/5xx → throws → outer catch → parseError.

Three fixes:
1. `getEmbedding` retry (3 attempts, 200/400ms backoff, 10s timeout) — source fix
2. Backend route auto-retry (1 retry, 500ms delay, clearSessionContext before retry) — safety net
3. Turn 2+ delta try/catch fallback + `var genResponse` fix

## Concurrency Decision

2 tasks, fully parallel (different files, no interdependency).
- Task 1: lib/embeddings.js (plain JS, no tsc)
- Task 2: src/app/api/legal-hub/cases/[id]/chat/route.ts (TypeScript)

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies

## Key Architectural Constraints

1. **`getEmbedding` is shared** — used by both indexing pipeline and chat retrieval. Must not change
   signature or return type. Retry/timeout must be fully internal. Do NOT add a `noRetry` flag.

2. **Retry only transient HTTP errors** — 429 and 5xx are retryable. 4xx (except 429) are permanent
   (bad key, malformed request) — throw immediately without retry to avoid masking config errors.

3. **Route retry wrapper scope** — wrap ONLY the processing block (session cache check → response),
   NOT auth/body parsing/case lookup. These run once and short-circuit; retrying them is wasteful
   and wrong (e.g., would re-read the request body which is already consumed).

4. **clearSessionContext before retry** — on the retry attempt, clear the session cache entry for
   this userId:caseId. This ensures the retry runs as a clean Turn 1, avoiding any partial state
   from the failed first attempt.

5. **No frontend changes** — the auto-retry is fully backend. Frontend continues to show the error
   only when both attempts fail.

6. **var genResponse fix** — declare `let genResponse` before the if/else branches, assign inside
   each. Use `Awaited<ReturnType<typeof anthropic.messages.create>>` as the type annotation to
   satisfy TypeScript without `as any`.

## Critical Files

- `lib/embeddings.js` — `getEmbedding` (Task 1)
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — POST handler (Task 2)
- `src/lib/chat-context-cache.ts` — `clearSessionContext` (read-only for Task 2)
