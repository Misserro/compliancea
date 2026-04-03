# Task 3 — Session Priming Context Cache: Implementation Plan

## Overview

Introduce a process-local session context cache so that turn 1 retrieves 30 broad chunks, caches the assembled context, and injects it as a stable priming block at messages[0] on every subsequent API call. Follow-up turns skip the full BM25+vector+Voyage rerank pipeline and run only a lightweight delta vector search (top 5, deduped against priming set). Token logging is extended to record cache read/write tokens.

## Files to Create/Modify

### 1. `src/lib/chat-context-cache.ts` (NEW)

Session context cache module. Exports:
- `getSessionContext(userId, caseId)` — returns `SessionContext | null` (null if missing or expired)
- `setSessionContext(userId, caseId, primedContext, chunkIds)` — stores entry with 5-min TTL
- `clearSessionContext(userId, caseId)` — removes entry

Interface:
```typescript
interface SessionContext {
  primedContext: string;
  chunkIds: Set<number>;
  expiresAt: number;
}
```

Key: `${userId}:${caseId}`. TTL: 5 minutes. Process-local `Map<string, SessionContext>`.

### 2. `src/app/api/legal-hub/cases/[id]/chat/route.ts` (MODIFY)

Major restructuring of the retrieval + message construction flow:

**Body parsing:** Add `forceRefresh` to destructured body params.

**Turn logic:**
1. Import `getSessionContext`, `setSessionContext`, `clearSessionContext` from `@/lib/chat-context-cache`.
2. If `forceRefresh === true`, call `clearSessionContext(userId, caseId)`.
3. Attempt `getSessionContext(userId, caseId)`.

**If cache miss (turn 1 or expired or forceRefresh):**
1. Run existing retrieval pipeline with `rerankTopK: 30` (up from default 20).
2. Assemble `primedContext = [DANE SPRAWY]\n${structuredContext}\n\n[DOKUMENTY SPRAWY]\n${evidenceSection}`.
3. Collect chunk IDs from `retrieval.results` into a `Set<number>`.
4. Call `setSessionContext(userId, caseId, primedContext, chunkIds)`.
5. Build messages: `[{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: message }] }]`.

**If cache hit (turn 2+):**
1. Get cached `primedContext` and `chunkIds`.
2. Run delta vector search: `retrievalService._getVectorCandidates(message, caseId, 5)` — this calls Voyage embedding API for the query vector and does cosine similarity against case chunks. No BM25, no Voyage rerank.
3. Filter out chunks whose `chunkId` is in the priming set.
4. Build delta evidence with `buildEvidencePrompt(deltaChunks)`.
5. Build messages:
   - Position 0: `{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: firstHistoryMessage || message }] }`.
   - History pairs (if any).
   - Final user message with delta evidence appended: `${message}\n\n[DODATKOWY KONTEKST]\n${deltaEvidence}`.

**Wait — re-reading the lead notes more carefully:**

The priming pair structure from lead notes: position 0 is `{ role: "user", content: [contextBlock(cache_control), questionText] }`. The first history question becomes the text content of the priming pair. On turn 1, the user message IS the question text. On turn 2+, the FIRST history message is the question text in the priming pair (since that's what was sent on turn 1), and the priming pair must be IDENTICAL across all turns for cache hits.

**Revised turn 2+ message structure:**
- `messages[0]`: `{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: firstUserMessage }] }` where `firstUserMessage` is `history[0].content` (the original turn-1 question).
- `messages[1]`: `{ role: "assistant", content: history[1].content }` (assistant reply to turn 1).
- `messages[2..N-1]`: remaining history pairs.
- `messages[N]`: `{ role: "user", content: deltaEvidence ? `${message}\n\n[DODATKOWY KONTEKST]\n${deltaEvidence}` : message }`.

This ensures `messages[0]` is IDENTICAL across all turns (same primedContext + same first question) so Anthropic's cache hits.

**Revised turn 1 message structure:**
- `messages[0]`: `{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: message }] }`.
- No history on turn 1 (history array is empty).

**Token logging update:**
- Extract `cache_read_input_tokens` and `cache_creation_input_tokens` from `genResponse.usage` (already done by Task 1).
- Pass `cacheReadTokens` and `cacheWriteTokens` to `logTokenUsage`.

### 3. `lib/db.js` (MODIFY)

Extend `logTokenUsage` to accept optional `cacheReadTokens` and `cacheWriteTokens` params:
```javascript
export function logTokenUsage({ userId, orgId, route, model, inputTokens, outputTokens, voyageTokens = 0, costUsd = 0, cacheReadTokens = 0, cacheWriteTokens = 0 }) {
```

Add ALTER TABLE to add columns (or use the safe pattern already in the codebase — add columns in initDb with try/catch):
```sql
ALTER TABLE token_usage ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE token_usage ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
```

Update INSERT to include the new columns.

### 4. `lib/db.d.ts` (MODIFY)

No change needed — `logTokenUsage` already uses `(...args: any[]): any` signature.

### 5. `src/lib/db-imports.ts` (NO CHANGE)

Already re-exports `logTokenUsage`. No signature change needed.

## Key Decisions

1. **Delta vector search via `_getVectorCandidates`**: Rather than modifying `case-retrieval.js` to add a public method, I'll call the existing `_getVectorCandidates` method directly. It's JavaScript — no access restriction. This avoids modifying a file outside the task scope.

2. **Priming pair identity for cache hits**: The priming pair at position 0 must be byte-identical across all turns in a session. On turn 2+, `history[0]` contains the original turn-1 user message — this becomes the text block in the priming pair content array. The `primedContext` text block (with `cache_control`) is always the same cached string.

3. **Schema migration**: Use ALTER TABLE with try/catch (safe pattern for SQLite) in `initDb` to add `cache_read_tokens` and `cache_write_tokens` columns.

4. **Retrieval results for citation parsing on turn 2+**: On cache hit turns, the `parseCitationResponse` still needs `retrievedChunks` for citation validation. The priming set chunks are not stored in the cache (only IDs and assembled text). For turn 2+, we pass the delta chunks to `parseCitationResponse`. The model will mostly cite from the priming context (which was already validated on turn 1). For delta chunks, they're passed directly. This is acceptable — the model cites chunk IDs, and as long as those IDs are in the retrieved set, citations work.

   Actually, re-reading the route: `parseCitationResponse(rawText, retrieval.results)` validates that cited chunk IDs exist in the retrieval results. On turn 2+, if the model cites a priming chunk ID, it won't be in the delta results and will be filtered as "fabrication". This is a problem.

   **Fix**: On turn 2+, we need to pass ALL chunks (priming + delta) to `parseCitationResponse`. But we don't store the full chunk objects in the cache — only IDs and the assembled text. We need to store the chunk objects too, or at minimum their essential citation data.

   **Revised cache structure**: Store `primingChunks` (the full retrieval results array) in the session cache alongside `primedContext` and `chunkIds`. This adds ~30 chunk objects to memory per session — acceptable for a process-local cache.

## Risks

- **Memory**: Storing 30 chunk objects per session. Each chunk is ~1-2KB of text. With typical concurrent sessions (~10-50), total memory is ~1.5MB max. Negligible.
- **`_getVectorCandidates` is a pseudo-private method**: If `case-retrieval.js` renames it, this breaks. Acceptable risk — it's the same codebase, same team.
- **Delta vector search still calls Voyage embedding API**: One `getEmbedding()` call per turn 2+ request (~$0.00002). This is expected and documented in the plan.

## Success Criteria Mapping

1. `src/lib/chat-context-cache.ts` exports `getSessionContext`, `setSessionContext`, `clearSessionContext` -- new file
2. Turn 1: primedContext assembled and stored; messages[0] has cache_control structure -- route.ts restructure
3. Turn 2+: Voyage search() NOT called; delta vector top 5; deduped; same priming pair -- route.ts cache-hit branch
4. forceRefresh clears cache -- body param + clearSessionContext call
5. Token logging records cache_read/write tokens -- db.js extension + route.ts logUsage update
6. tsc --noEmit passes -- type-safe implementation
