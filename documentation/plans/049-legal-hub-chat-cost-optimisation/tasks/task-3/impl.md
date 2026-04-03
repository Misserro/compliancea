## Task 3 Complete — Session Priming Context Cache

- Created: `src/lib/chat-context-cache.ts` (new file)
  - Exports: `getSessionContext`, `setSessionContext`, `clearSessionContext`, `RetrievalChunk` (type), `SessionContext` (interface)
  - Process-local `Map<string, SessionContext>` with 5-min TTL
  - Key format: `${userId}:${caseId}`
  - Cache stores: `primedContext` string, `chunkIds` Set, `primingChunks` array (full chunk objects for citation validation), `firstUserMessage` (for stable priming pair), `expiresAt` timestamp

- Modified: `src/app/api/legal-hub/cases/[id]/chat/route.ts`
  - Added imports for session cache module
  - Added `forceRefresh` body parameter parsing (line 210-214)
  - New cache-hit branch (lines 241-325): skips full BM25+vector+Voyage pipeline; runs delta vector search via `_getVectorCandidates` with dedup; builds messages with stable priming pair at position 0
  - New cache-miss branch (lines 326-394): runs full pipeline with `rerankTopK: 30` (up from 20); assembles `primedContext` with `[DANE SPRAWY]` and `[DOKUMENTY SPRAWY]` sections; stores in session cache; builds priming pair message
  - Messages[0] structure: `{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: firstUserMessage }] }`
  - Token logging now passes `cacheReadTokens` and `cacheWriteTokens` to `logTokenUsage`
  - `parseCitationResponse` receives combined priming+delta chunks for full citation validation

- Modified: `lib/db.js`
  - Added ALTER TABLE migrations for `cache_read_tokens` and `cache_write_tokens` columns on `token_usage` table (with try/catch for idempotency)
  - Extended `logTokenUsage` function signature with optional `cacheReadTokens` (default 0) and `cacheWriteTokens` (default 0) params
  - Updated INSERT statement to include `cache_read_tokens` and `cache_write_tokens`

- NOT modified: `lib/db.d.ts` — uses `(...args: any[]): any` signature, no change needed
- NOT modified: `src/lib/db-imports.ts` — already re-exports `logTokenUsage`
- NOT modified: `lib/case-retrieval.js` — delta search uses existing `_getVectorCandidates` via `(retrievalService as any)` cast

- INTEGRATION: The priming pair's `cache_control: { type: "ephemeral" }` is the THIRD cache breakpoint (after system prompt and last tool from Task 1). On turn 2+ the primedContext text block is identical, enabling Anthropic cache hits.
- GOTCHA: The `var genResponse` pattern is used intentionally to hoist the response variable out of the if/else block scope. TypeScript handles this correctly.
- GOTCHA: Delta vector search fetches `5 + primingChunkIds.size` candidates before dedup filtering, then slices to 5, to ensure we get 5 unique non-priming chunks even when there's overlap.
- GOTCHA: `firstUserMessage` is stored in the cache and used in the priming pair on turns 2+ to ensure byte-identical messages[0] across all turns (required for Anthropic cache hits).
