# Operational Report — Plan 024: Case Chat Unified Retrieval

**Date:** 2026-03-19
**Plan:** 024-case-chat-unified-retrieval
**Status:** COMPLETE

---

## Summary

Plan 024 removed the Haiku intent classifier from the case chat route and replaced the 5-branch intent router with a single parallel retrieval flow. All 1 tasks completed successfully. TypeScript compiles clean and all 65 tests pass.

---

## Tasks Completed

### Task 1 — Unified Case Chat Route + Updated System Prompt

**Status:** COMPLETED
**Stages:** planning → implementation → review

**Files changed:**

| File | Change |
|------|--------|
| `lib/citation-assembler.js` | Added 5 `isHighRiskQuery` patterns: `/summarise/i`, `/summary/i`, `/overview/i`, `/streszcz/i`, `/streszczenie/i` |
| `prompts/case-chat-grounded.md` | Full replacement — dual-context prompt handling `[DANE SPRAWY]` + `[DOKUMENTY SPRAWY]` |
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | Rewrite — removed classifier, added unified parallel retrieval flow |

**Removed from route.ts:**
- `CLASSIFIER_SYSTEM` constant
- `Intent` and `ClassifierResult` types
- Haiku classifier API call (~400ms latency eliminated per query)
- All intent routing branches (`case_info`, `party_lookup`, `deadline_query`, `unknown`)
- `respondWithSimpleContext` function
- Early return on empty retrieval results

**Added to route.ts:**
- `buildStructuredContext(legalCase, parties, deadlines)` — combines existing format helpers under `=== DANE SPRAWY ===` header, filters completed deadlines, sorts by due_date, limits to top 5
- Unified flow: DB fetch → async document retrieval → combined user message → single Claude call

**Bugs fixed:**
- max_tokens truncation: returns clean Polish fallback (`"Odpowiedź była zbyt długa..."`) instead of raw partial JSON
- No-documents case: sets `confidence = "low"` but still answers from structured context

---

## Verification

- TypeScript: `npx tsc --noEmit` — no errors
- Tests: 65/65 passed (`npm test`)

---

## Architectural State After Plan

- Intent classifier: removed entirely (no Haiku call)
- Every case chat query: fetches structured DB context + runs document retrieval
- System prompt: single grounded prompt handling both data sources
- Source priority: structured data for registration facts; documents for case merits
- Citation mechanics: unchanged (`[cit:chunkId]` for document evidence only)
- Frontend (`case-chat-panel.tsx`): unchanged
- `StructuredAnswer` shape: unchanged

---

## Risks Encountered

None. Execution was clean with no blockers.

---

## Concurrency

1 task, 1 agent. No concurrency issues.
