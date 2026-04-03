# Task 1 Plan — `getEmbedding()` retry + timeout

## Files to modify

- `lib/embeddings.js` — modify `getEmbedding()` function only (lines 23-54)

## Changes

### 1. Add retry constants at module level (after line 4)

```js
const EMBEDDING_MAX_RETRIES = 3;
const EMBEDDING_RETRY_DELAYS = [200, 400]; // ms between attempt 1->2, 2->3
const EMBEDDING_TIMEOUT_MS = 10000; // 10s per attempt
```

### 2. Replace the fetch + error-check block inside `getEmbedding()` with a retry loop

The current implementation (lines 30-53) does a single fetch, checks `response.ok`, parses JSON, returns embedding. Replace with:

```
for (let attempt = 1; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: { ... },
        body: JSON.stringify({ model, input }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        // Permanent 4xx errors (except 429) — throw immediately, do not retry
        if (status >= 400 && status < 500 && status !== 429) {
          throw new Error(`Voyage AI embedding failed: ${status} - ${errorText}`);
        }

        // 429 or 5xx — throw to trigger retry
        throw new Error(`Voyage AI embedding failed: ${status} - ${errorText}`);
      }

      // Success path — parse and return
      const data = await response.json();
      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error("Invalid embedding response from Voyage AI");
      }
      return data.data[0].embedding;

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (err) {
    // Permanent errors: do not retry
    const isPermanent4xx = err.message && /Voyage AI embedding failed: (400|401|403|404)/.test(err.message);
    if (isPermanent4xx) {
      throw err;
    }

    // Last attempt exhausted: throw
    if (attempt === EMBEDDING_MAX_RETRIES) {
      throw err;
    }

    // Wait before next attempt (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, EMBEDDING_RETRY_DELAYS[attempt - 1]));
  }
}
```

### Key design decisions

1. **Permanent error detection** — Check the HTTP status code to decide retry vs throw. 400, 401, 403, 404 are permanent. 429 and 5xx (500, 502, 503, etc.) are transient and retried.

2. **AbortController per attempt** — Each attempt gets its own `AbortController` with a 10s timeout. The timeout fires `abort()` on the signal, which causes `fetch` to reject with an `AbortError`. This is a network-level timeout (not response parsing).

3. **clearTimeout in finally** — Ensures the timer is always cleaned up, even on success or error.

4. **Error message preserved** — The error message format `Voyage AI embedding failed: {status} - {text}` is unchanged so any log parsing or caller error handling continues to work.

5. **No signature change** — `getEmbedding(text)` still takes a single string and returns `Promise<number[]>`.

6. **Invalid response format not retried** — If the response is 200 but the body structure is wrong (`!data.data[0].embedding`), this is a permanent error and is thrown immediately (it won't match the permanent 4xx pattern, but it also won't have a retry delay pattern — actually, this would retry. Let me reconsider.)

   Correction: An "Invalid embedding response" error will NOT match the `isPermanent4xx` check, so it WOULD be retried. This is actually fine — a malformed response could be transient (partial response from an overloaded server). But to be safe, I will add a check for this specific error message to throw immediately, since it indicates a structural API change, not a transient issue.

## Risks

- **AbortController compatibility** — `AbortController` is available in Node 16+ and all modern runtimes. This project uses Next.js which runs on Node 18+, so no issue.
- **Retry adds latency on failure** — Max added latency: 200ms + 400ms + 10s timeout on 3rd attempt = ~10.6s worst case. This is acceptable per the plan's risk assessment.

## Success criteria verification

- [x] Retries up to 3 times on 429/5xx
- [x] Each attempt uses AbortController with 10s timeout
- [x] 400/401/403/404 NOT retried
- [x] Signature unchanged: `getEmbedding(text)` -> `Promise<number[]>`
- [x] No new imports at call sites
- [x] Callers unaffected
