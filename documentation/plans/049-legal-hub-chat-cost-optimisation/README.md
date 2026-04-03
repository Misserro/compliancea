# Plan 049 — Legal Hub Chat Cost Optimisation

## Overview

The Legal Hub case chat costs ~$0.04 per user message turn — primarily driven by 6,000–10,000 input tokens of retrieved document chunks re-sent to Anthropic on every single request. This plan reduces that cost by ~40–50% across typical multi-turn sessions with **zero quality drop** using three sequential levers:

1. **Prompt Caching — System + Tools** — mark the static system prompt and tool schemas with Anthropic's `cache_control: { type: "ephemeral" }`. Tokens in the cached prefix cost $0.30/1M instead of $3/1M. Savings ~15%.
2. **History Payload Slimming** — the frontend currently echoes full `StructuredAnswer` JSON (including `citations[]` and `annotations[]`) back as history. Only `answerText` is needed. Pruning prior assistant messages in history saves 200–800 tokens per historical turn × 6 turns. Savings ~10–20%.
3. **Session Priming Context Cache** — on the first turn of a case chat session, retrieve a broad chunk set (30 chunks), cache the assembled context server-side, and inject it as a static "priming" user+assistant pair at position 0 of every subsequent request. This pair never changes within a session, so Anthropic's prompt cache hits reliably on it. Follow-up turns also run a small delta retrieval (top 5 fresh chunks for the specific question, deduplicated against priming set) to preserve quality on topic shifts. Savings on turns 2+ ~40–55%.

### Cost Impact (5-turn session)

| | Turn 1 | Turns 2–5 avg | 5-turn total | vs today |
|---|---|---|---|---|
| Today | $0.040 | $0.040 | $0.200 | — |
| After this plan | $0.040 | ~$0.018–$0.022 | ~$0.112–$0.128 | **~37–44% cheaper** |

### Problem Statement

- Every chat turn re-sends ~1,500-token system prompt and ~700-token tool schemas from scratch.
- Prior assistant messages in conversation history carry full citation arrays (`annotations[]`, `citations[]`, `usedDocuments[]`) — paying for document references the model doesn't need to generate new answers.
- Retrieved document chunks (20–30 chunks × ~300 tokens each ≈ 6,000–9,000 tokens) are re-fetched via Voyage and re-sent to Anthropic on every turn, even when the user is asking follow-up questions about the same documents.

### Scope

- **In scope:** `src/app/api/legal-hub/cases/[id]/chat/route.ts`, `src/lib/` session cache module, `src/components/legal-hub/case-chat-panel.tsx` (history slimming), update to `logTokenUsage` to record cache hit tokens.
- **Out of scope:** Other chat routes (`contracts/chat`, `/api/ask`), streaming optimisation, model downgrade, chunk size re-indexing.

---

## Architecture Decisions

### Task 1 — Prompt Caching: System + Tools

Anthropic's SDK supports `cache_control: { type: "ephemeral" }` on:
- System content array blocks (`system: [{ type: "text", text: ..., cache_control: { type: "ephemeral" } }]`)
- The last tool definition in the `tools` array

The cache is scoped to the prefix: everything Anthropic processes up to and including the `cache_control` marker is cached for 5 minutes. On a warm cache, those tokens cost **$0.30/1M** (input) instead of $3/1M — a 90% reduction on the cached portion.

The system prompt (`prompts/case-chat-grounded.md`, ~1,500 tokens) and tool schemas (`CASE_CHAT_TOOLS`, ~700 tokens) are identical across all cases and all users. Cache hit rate is very high.

Cache write premium: $3.75/1M (vs $3/1M) — paid once per 5-minute window per process. Negligible.

### Task 2 — History Payload Slimming

The frontend (`case-chat-panel.tsx`) maintains the conversation history and sends it on each API call. Currently, assistant turn content includes the full `StructuredAnswer` object serialised as JSON — including `annotations` (character-level spans) and `citations` (with `sentenceBefore`/`sentenceHit`/`sentenceAfter` fields). This can be 500–1,500 tokens per historical turn.

The model has no need for prior citation spans or chunk references when generating a new answer. It only needs the prior `answerText` to maintain conversational coherence.

Fix: when building the `history` array for the API request, for each assistant entry extract only `answerText` (if the content is a parseable `StructuredAnswer`) or leave the string as-is (if it's already plain text or a tool proposal). No change to what is displayed to the user.

### Task 3 — Session Priming Context Cache

**Core pattern:** separate the case context ("what we know about this case") from the conversation ("what we've discussed"). The case context is injected once as a synthetic `user`+`assistant` exchange at position 0 of every API call within a session. Because it's always at the same position with the same text, Anthropic's prompt cache hits reliably on turns 2+.

**Session cache module** (`src/lib/chat-context-cache.ts`):
- Process-local `Map<string, { primedContext: string; chunkIds: Set<number>; expiresAt: number }>`
- Key: `${userId}:${caseId}`
- TTL: 5 minutes (aligns with Anthropic's ephemeral cache window)

**Turn 1 (cache miss):**
1. Run existing retrieval pipeline — BM25 + vector + RRF + Voyage rerank, but `topK = 30` (increased from 20) to give the priming set broader coverage.
2. Assemble `primedContext = buildStructuredContext(...) + buildEvidencePrompt(chunks)` — the same format as today.
3. Store in session cache with the set of chunk IDs retrieved.
4. Build API call with priming pair as position 0:
   ```
   messages: [
     { role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: userMessage }] },
   ]
   ```
5. No change to response processing.

**Turn 2+ (cache hit):**
1. Retrieve cached `primedContext` — **skip BM25 + vector + Voyage rerank entirely** (saves ~$0.002–$0.005 Voyage cost + ~200ms latency).
2. Run **delta retrieval**: vector search only (no BM25, no rerank), `topK = 5`. Filter out chunk IDs already in the priming set. These are small, query-specific additions.
3. Build API call with priming pair at position 0 (same `primedContext` — cache hit!), then history, then current message with delta chunks appended:
   ```
   messages: [
     { role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: firstHistoryQuestion }] },
     { role: "assistant", content: firstHistoryAnswer },
     ...remainingHistory,
     { role: "user", content: `${userMessage}\n\n[DODATKOWY KONTEKST]\n${deltaEvidence}` },
   ]
   ```
4. Log `cache_read_input_tokens` from `message.usage` alongside normal input/output tokens.

**Force refresh:** API accepts optional `forceRefresh: boolean`. If `true`, clear session cache entry and run full turn-1 pipeline. Used by the frontend if the user explicitly triggers re-fetch (e.g., a "refresh context" button, or when new documents are added to the case mid-session).

**Quality guarantee:** delta retrieval ensures follow-up questions with different retrieval needs still get relevant fresh chunks. The priming set (30 chunks) provides broad coverage; delta retrieval fills precision gaps. Edge case: if a user's follow-up needs more than 5 additional chunks beyond the priming set, quality is the same as current (priming + delta covers it). The only degradation scenario is if a question needs >35 total unique chunks — extremely rare for typical case queries.

### Token Logging Update

`logTokenUsage` already accepts `inputTokens` and `outputTokens`. Anthropic returns `cache_creation_input_tokens` and `cache_read_input_tokens` in `message.usage`. On turns where cache is active, the effective input tokens = `input_tokens + cache_read_input_tokens`. The cost formula should use:

```
actualInputCost = (inputTokens / 1_000_000 * PRICING.claude.sonnet.input)
                + (cacheReadTokens / 1_000_000 * PRICING.claude.sonnet.cacheRead)   // $0.30/1M
                + (cacheWriteTokens / 1_000_000 * PRICING.claude.sonnet.cacheWrite) // $3.75/1M
```

Add `PRICING.claude.sonnet.cacheRead = 0.30` and `PRICING.claude.sonnet.cacheWrite = 3.75` to `src/lib/constants.ts`. Update `logTokenUsage` call in the chat route to pass `cacheReadTokens` and `cacheWriteTokens`.

---

## Task List

### Task 1 — Prompt Caching: System Prompt + Tool Schemas

**Description:**
Modify the `anthropic.messages.create` call in the Legal Hub chat route to use `cache_control: { type: "ephemeral" }` on the system prompt content block and on the last tool definition. Update `PRICING` constants with cache read/write rates.

**Files:**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts`
- `src/lib/constants.ts`

**Patterns:**
- Read `src/app/api/legal-hub/cases/[id]/chat/route.ts` — current `anthropic.messages.create` call structure (system string, tools array, messages)
- Read `src/lib/constants.ts` — PRICING object structure

**Success Criteria:**
- `anthropic.messages.create` `system` parameter is `[{ type: "text", text: systemPromptContent, cache_control: { type: "ephemeral" } }]`
- `CASE_CHAT_TOOLS` last tool has `cache_control: { type: "ephemeral" }` (spread as new array, don't mutate the constant)
- `PRICING.claude.sonnet.cacheRead = 0.30` and `PRICING.claude.sonnet.cacheWrite = 3.75` exist in `src/lib/constants.ts`
- `tsc --noEmit` passes
- On second request within 5 minutes: `message.usage.cache_read_input_tokens > 0` (verifiable via log or debug)

**Dependencies:** none

---

### Task 2 — History Payload Slimming

**Description:**
Audit what the `case-chat-panel.tsx` frontend sends in the `history` array for assistant messages. If full `StructuredAnswer` JSON is being serialised (including `citations[]` and `annotations[]`), change it to send only the `answerText` string. The model only needs prior answer text to maintain conversational coherence — not citation metadata.

**Files:**
- `src/components/legal-hub/case-chat-panel.tsx`
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` (validation/defensive handling)

**Patterns:**
- Read `src/components/legal-hub/case-chat-panel.tsx` — how `history` state is built and what gets pushed as assistant message content
- Read `src/app/api/legal-hub/cases/[id]/chat/route.ts` — how `history` is consumed server-side

**Success Criteria:**
- Assistant entries in the `history` array sent to `/api/legal-hub/cases/[id]/chat` contain only the `answerText` string (not a serialised JSON object with citations/annotations)
- User-visible chat display is unchanged — the frontend still renders citations and annotations from the current response, not from history
- `tsc --noEmit` passes
- A history-heavy turn (6 prior assistant messages) is measurably smaller than before (verifiable via token log in dashboard)

**Dependencies:** none (can run in parallel with Task 1)

---

### Task 3 — Session Priming Context Cache

**Description:**
Introduce a process-local session context cache. On the first turn of a case conversation, retrieve 30 broad chunks (up from 20), cache the assembled case context, and inject it as a permanent priming pair at message position 0 — marked with `cache_control: { type: "ephemeral" }` — on every subsequent API call. Follow-up turns skip the full Voyage rerank pipeline and instead run a lightweight delta vector search (top 5) to supply question-specific chunks not in the priming set. Update token logging to record cache hit tokens.

**Files:**
- `src/lib/chat-context-cache.ts` (new)
- `src/app/api/legal-hub/cases/[id]/chat/route.ts`
- `src/lib/db-imports.ts` (if `logTokenUsage` signature changes)
- `lib/db.js` (if `logTokenUsage` signature changes)
- `lib/db.d.ts` (if signature changes)

**Patterns:**
- Read `src/app/api/legal-hub/cases/[id]/chat/route.ts` — full flow: retrieval, context assembly, message construction
- Read `lib/case-retrieval.js` — `CaseRetrievalService.search` parameters and return shape
- Read `lib/citation-assembler.js` — `buildEvidencePrompt` signature
- Read `src/lib/db-imports.ts` — `logTokenUsage` call signature

**Success Criteria:**
- `src/lib/chat-context-cache.ts` exports `getSessionContext`, `setSessionContext`, `clearSessionContext`
- Turn 1: `primedContext` assembled and stored; API call's `messages[0]` is `{ role: "user", content: [{ type: "text", text: primedContext, cache_control: { type: "ephemeral" } }, { type: "text", text: userMessage }] }`
- Turn 2+ (within TTL): Voyage `search()` NOT called for the main retrieval; delta vector search runs for top 5; delta chunks deduped against priming set chunk IDs; `messages[0]` is the same priming pair (cache hit verifiable via `cache_read_input_tokens > 0` in token log)
- `forceRefresh: true` body parameter clears cache and runs full pipeline
- Token logging records `cache_read_input_tokens` and `cache_write_input_tokens` (add optional params to `logTokenUsage`, default 0)
- `tsc --noEmit` passes

**Dependencies:** Task 1 (requires `cache_control` wiring already in place for the priming pair to be cached correctly)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anthropic SDK type errors for `cache_control` field | Low | Use `as any` or update SDK; types may already be present in current version |
| Cache miss every turn if `primedContext` differs slightly | Low | Context assembled deterministically from DB data; no randomness |
| Delta retrieval misses important chunks | Low | Priming set is 30 chunks (50% more than today's 20); delta adds 5 more; total coverage is better |
| Session cache grows unbounded | Low | Map is keyed by userId:caseId with 5-min TTL; entries are ~10KB; negligible memory |
| `forceRefresh` not surfaced in UI | Medium | API supports it; UI can add a button later; not a blocker for correctness |
| History slimming breaks display | None | Display uses current response, not history; history is only for model context |

---

## Tech Stack

- `@anthropic-ai/sdk` — `cache_control` on system blocks and tool definitions
- Next.js 15 App Router, TypeScript
- `lib/case-retrieval.js` — `CaseRetrievalService`
- `lib/citation-assembler.js` — `buildEvidencePrompt`
- `src/lib/constants.ts` — PRICING constants
- `lib/db.js` — `logTokenUsage`
