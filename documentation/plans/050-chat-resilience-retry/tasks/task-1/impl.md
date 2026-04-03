# Task 1 Implementation — `getEmbedding()` retry + timeout

## Changes

- Modified: `lib/embeddings.js` (lines 6-8 new constants, lines 27-107 rewritten `getEmbedding` function)

## What changed

### New constants (line 6-8)

```js
const EMBEDDING_MAX_RETRIES = 3;
const EMBEDDING_RETRY_DELAYS = [200, 400]; // ms between attempt 1->2, 2->3
const EMBEDDING_TIMEOUT_MS = 10000; // 10s per attempt
```

### `getEmbedding()` retry loop (lines 35-106)

The single `fetch` call was replaced with a `for` loop (up to 3 attempts):

1. **Each attempt** creates a fresh `AbortController` with a 10-second timeout via `setTimeout(() => controller.abort(), 10000)`. The timeout is always cleared in both the success path (`clearTimeout` after fetch) and the catch block.

2. **Permanent 4xx errors** (400, 401, 403, 404) — thrown immediately without retry. Detected by checking `response.status >= 400 && status < 500 && status !== 429` in the response handler, and confirmed via regex in the catch block.

3. **Transient errors** (429, 5xx, network errors, timeouts) — retried with exponential backoff (200ms after attempt 1, 400ms after attempt 2). On final attempt failure, the last error is thrown.

4. **Invalid response format** ("Invalid embedding response from Voyage AI") — thrown immediately, not retried. This indicates a structural API change, not a transient issue.

5. **Function signature unchanged** — `getEmbedding(text)` returns `Promise<number[]>` as before.

## Error message format

The error message format `Voyage AI embedding failed: {status} - {text}` is preserved exactly, so any callers parsing error messages (e.g., for logging) are unaffected.

## INTEGRATION notes

- Task 2 (backend auto-retry) is independent and works on a different file
- All existing callers (`lib/search.js:82`, `lib/case-retrieval.js:211`, `src/lib/ingest-case-document.ts:82,104`, `src/app/api/documents/[id]/process/route.ts:410,437`) continue to work without modification — no signature or return type change
