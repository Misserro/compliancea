# Task 1 — Implementation Plan

## Overview

Remove Haiku intent classifier, implement always-parallel unified retrieval, update grounded system prompt, fix max_tokens bug, add summarize patterns to isHighRiskQuery.

## Files to Modify

### 1. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — Rewrite

**Delete:**
- `CLASSIFIER_SYSTEM` constant (lines 21-39)
- `Intent` type (lines 41-47)
- `ClassifierResult` type (lines 49-52)
- Haiku classifier call block (lines 114-133)
- Intent routing branches: `unknown` disambiguation (lines 138-147), `case_info` (lines 150-159), `party_lookup` (lines 161-170), `deadline_query` (lines 172-183)
- `respondWithSimpleContext` function (lines 271-324)
- Early return when `retrieval.results.length === 0` (lines 196-205) — now we answer from structured data instead

**Keep:**
- Auth check + DB setup (lines 60-108)
- `CaseRow`, `PartyRow`, `DeadlineRow` types (lines 54-56)
- `HISTORY_TURNS` constant (line 58)
- `formatCaseInfoContext`, `formatPartiesContext`, `formatDeadlinesContext` helper functions — reuse in `buildStructuredContext`
- `CaseRetrievalService` + `buildEvidencePrompt` + `parseCitationResponse` + `isHighRiskQuery` imports
- JSON prefill trick (`{ role: "assistant", content: "{" }`)
- History handling

**Add:**
- `buildStructuredContext(legalCase, parties, deadlines): string` — combines existing format functions under `=== DANE SPRAWY ===` header, limits deadlines to next 5 upcoming sorted by due_date
- New unified flow in POST handler:
  1. After auth/parse, fetch structured data synchronously: `getLegalCaseById`, `getCaseParties`, `getCaseDeadlines` (all sync DB calls — no await needed)
  2. Build structured context: `buildStructuredContext(legalCase, parties, deadlines)`
  3. Run async document retrieval in parallel (only `CaseRetrievalService.search()` is async): `isHighRiskQuery(message)` → `retrievalService.search(message, caseId, opts)`
  4. Build combined user message with `[DANE SPRAWY]` and `[DOKUMENTY SPRAWY]` sections
  5. Single Claude call with grounded system prompt
  6. Parse response with `parseCitationResponse`
  7. If no retrieval results: set `confidence = "low"`
- max_tokens fix: return clean Polish fallback message instead of raw truncated JSON

**Note:** `getCaseParties` and `getCaseDeadlines` are synchronous (better-sqlite3), so they don't belong in `Promise.all`. Only `CaseRetrievalService.search()` is async.

### 2. `prompts/case-chat-grounded.md` — Replace content

New prompt must:
- Acknowledge two context sections: `[DANE SPRAWY]` (structured DB data) and `[DOKUMENTY SPRAWY]` (document evidence with `[CHUNK:...]` tags)
- Instruct to prefer `[DANE SPRAWY]` for case registration facts (court, parties, deadlines, claim value, judge)
- Instruct to use `[DOKUMENTY SPRAWY]` for case merits, contract content, legal arguments, obligations
- When `[DOKUMENTY SPRAWY]` says "Brak zindeksowanych dokumentów": answer from `[DANE SPRAWY]` only and state that no documents were searched
- Citation mechanics unchanged: `[cit:chunkId]` only for document evidence, never for structured data
- Same JSON output format: `{answerText, citations}`
- Polish default language, match user's language if different
- Strict grounding: no external knowledge for case facts

### 3. `lib/citation-assembler.js` — Minor update

Add patterns to `isHighRiskQuery`:
- `/summarise/i` (British spelling — "summarize" already exists)
- `/summary/i`
- `/overview/i`
- `/streszcz/i`
- `/streszczenie/i`

Note: `podsumuj`, `podsumowanie`, and `summarize` are already in the existing patterns.

## Implementation Order

1. `lib/citation-assembler.js` — smallest change, no dependencies
2. `prompts/case-chat-grounded.md` — new prompt content
3. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — main rewrite, depends on prompt

## Risk Mitigation

- The existing `formatCaseInfoContext`, `formatPartiesContext`, `formatDeadlinesContext` functions are reused inside `buildStructuredContext` — no logic duplication
- `parseCitationResponse` already handles graceful degradation if JSON is malformed
- When no documents are indexed, `CaseRetrievalService.search` returns `{ results: [], lowConfidence: true }` — we handle this by still providing structured context

## Verification

- TypeScript compiles clean (`npm run build`)
- Existing test suite passes (`npm test`)
