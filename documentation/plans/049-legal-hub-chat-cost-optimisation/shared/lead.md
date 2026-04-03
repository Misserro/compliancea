# Lead Notes — Plan 049: Legal Hub Chat Cost Optimisation

## Plan Overview

Reduce Legal Hub case chat cost from ~$0.04/turn to ~$0.018–$0.022/turn on turns 2+ using:
1. Anthropic prompt caching on system prompt + tool schemas (~15% savings)
2. History payload slimming — strip citation arrays from prior assistant messages (~10-20% savings)
3. Session priming context cache — cache assembled case context server-side, inject as stable prefix position 0 for Anthropic cache hits on document tokens (40-55% savings on turns 2+)

## Concurrency Decision

2 concurrent task-teams max (3 tasks).
- Task 1 and Task 2: parallel (no interdependency)
- Task 3: sequential after Task 1 (requires `cache_control` wiring from Task 1)

Pipeline-spawn Task 2 during Task 1 execution. Task 3 spawns after Task 1 passes.

## Task Dependency Graph

- Task 1: no dependencies (Prompt Caching: System + Tools)
- Task 2: no dependencies — parallel with Task 1 (History Payload Slimming)
- Task 3: depends on Task 1 (Session Priming Context Cache)

## Key Architectural Constraints

1. **Anthropic cache_control format** — system must be array `[{ type: "text", text: ..., cache_control: { type: "ephemeral" } }]`. Tools: add `cache_control` to last tool only (spread, never mutate CASE_CHAT_TOOLS constant).
2. **Session cache key** — `${userId}:${caseId}`. TTL 5 min (matches Anthropic ephemeral window). Process-local Map.
3. **Priming pair structure** — position 0 in messages array is `{ role: "user", content: [contextBlock(cache_control), questionText] }`. This EXACT structure must be identical across all turns for cache hits.
4. **Delta retrieval** — vector search only (no BM25, no rerank), topK=5, deduplicate against priming chunk IDs. Only runs on turns 2+.
5. **History slimming** — frontend change only. Strip citations/annotations from assistant history entries before sending. Display is unaffected (renders from current response, not history).
6. **logTokenUsage extension** — add optional `cacheReadTokens` and `cacheWriteTokens` params (default 0). Add `PRICING.claude.sonnet.cacheRead = 0.30` and `PRICING.claude.sonnet.cacheWrite = 3.75`.

## Critical Files

- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — main chat endpoint (modified by Tasks 1 and 3)
- `src/lib/constants.ts` — PRICING constants (modified by Task 1)
- `src/components/legal-hub/case-chat-panel.tsx` — frontend history (modified by Task 2)
- `src/lib/chat-context-cache.ts` — new session cache module (created by Task 3)
- `lib/db.js` + `lib/db.d.ts` + `src/lib/db-imports.ts` — logTokenUsage (possibly extended by Task 3)
- `lib/case-retrieval.js` — CaseRetrievalService.search (read by Task 3)
- `lib/citation-assembler.js` — buildEvidencePrompt (read by Task 3)
