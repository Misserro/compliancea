# Lead Notes — Plan 024: Case Chat Unified Retrieval

## Plan Overview

Remove the Haiku intent classifier from the case chat route. Replace the 5-branch intent router with a single parallel retrieval flow: always fetch structured case context (DB) + always run document retrieval (CaseRetrievalService). Single Claude generation call with combined context. Fix two existing bugs: max_tokens truncation returning raw JSON, and summarize not triggering high-risk retrieval.

## Concurrency

1 task, 1 team. No concurrency decisions needed.

## Task Dependency Graph

- Task 1: no dependencies

## Key Architectural Constraints

1. **Remove classifier entirely** — no Haiku call, no intent routing branches
2. **Always fetch structured context** — buildStructuredContext(case + parties + deadlines) runs every query
3. **Always run CaseRetrievalService.search()** — document retrieval runs every query
4. **Parallel fetch** — use Promise.all() for structured context + document retrieval
5. **Single grounded system prompt** — updated case-chat-grounded.md handles both data sources
6. **StructuredAnswer shape unchanged** — frontend works as-is
7. **Citation mechanics unchanged** — only document evidence gets [cit:N] markers; structured data answers do not need citations
8. **If no documents indexed** — answer from structured data only, note the gap in answerText
9. **isHighRiskQuery** — add "summarize/streszcz/podsumuj/summary/overview" patterns

## Critical Technical Notes

- `respondWithSimpleContext` function: DELETE entirely (no longer needed)
- `CLASSIFIER_SYSTEM`: DELETE entirely
- The `case-chat.md` prompt: no longer used in the route (keep the file, just don't reference it)
- `buildStructuredContext`: NEW function — formats case info + parties + deadlines into `[DANE SPRAWY]` section
- System prompt `case-chat-grounded.md`: UPDATE to handle both `[DANE SPRAWY]` and `[DOKUMENTY SPRAWY]` sections
- JSON prefill trick (`{ role: "assistant", content: "{" }`) stays — still needed for JSON output
- max_tokens fix: return clean Polish fallback, not raw JSON string
- The frontend (`case-chat-panel.tsx`) does NOT change

## Files to Change

1. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — rewrite
2. `prompts/case-chat-grounded.md` — update
3. `lib/citation-assembler.js` — minor: add summarize patterns to isHighRiskQuery

## Execution Log

## Execution Complete

**Plan:** 024-case-chat-unified-retrieval
**Tasks:** 1 completed, 0 skipped, 0 escalated
**Final Gate:** PASSED — 65 tests, tsc clean, build clean

### Tasks Completed
- **Task 1 — Unified Case Chat Route:** Removed Haiku intent classifier entirely. Added `buildStructuredContext()` combining case info + parties + deadlines. Added always-parallel unified retrieval (structured context + CaseRetrievalService.search). Fixed max_tokens truncation bug. Added summarize patterns to isHighRiskQuery. Updated case-chat-grounded.md with dual [DANE SPRAWY]/[DOKUMENTY SPRAWY] context handling.

### Files Modified
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — rewritten
- `prompts/case-chat-grounded.md` — replaced
- `lib/citation-assembler.js` — isHighRiskQuery patterns added

### Decisions Made During Execution
- Keep formatCaseInfoContext/formatPartiesContext/formatDeadlinesContext as private helpers reused by buildStructuredContext (not deleted)
- formatDeadlinesContext updated to filter out completed deadlines and those with past due_date
- getCaseParties/getCaseDeadlines called synchronously before the async retrieval (no Promise.all needed for sync calls)
- When no documents indexed: CaseRetrievalService returns lowConfidence:true → confidence="low" on answer, Claude answers from structured data

### Test Results
- Per-task tests: PASS (65/65)
- Final gate: PASSED — 65 tests, tsc clean, build clean
