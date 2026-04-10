# Lead Notes — Plan 061: Conditional Obligation Filter

## Plan Overview

Fix the LLM-based obligation extractor so conditional/contingent payment obligations are never extracted. Only obligations certain to occur (fixed periodic payments, milestone deliveries, notice deadlines) should appear.

## Concurrency Decision

1 task total → 1 concurrent task-team: executor-1, reviewer-1, tester-1.

## Key Architectural Constraints

- **Single file, prompt-only change** — only `lib/contracts.js` changes; no schema, no new LLM calls, no post-processing code
- The system prompt is a template literal inside `extractContractTerms()` (lines 21–140)
- Three targeted edits: line 82 (payments category definition), lines 87–109 (gate block replacement), lines 111–112 (payment extraction heading)
- TypeScript check is a formality — the prompt is a string literal

## Task Dependency Graph

- Task 1: no dependencies (standalone)

## Critical Decisions

- Prompt-only fix chosen over post-processing code filter (Option A vs B) — cleaner, no extra LLM cost, the non-payment gate already proves prompt-level filtering works
- Conditional payment examples are explicit: travel reimbursement, contingent bonuses, commissions on deal closure, breach penalties
- Penalty/late-payment interest stays as `penalties` field on parent obligation, never standalone
- Existing DB obligations not retroactively corrected by this plan — separate step: run POST /api/admin/reanalyze-all-contracts after deploy

## Execution Complete

**Plan:** 061-conditional-obligation-filter
**Tasks:** 1 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: 3 targeted prompt edits to lib/contracts.js — narrowed payments category definition, added CONDITIONAL PAYMENT GATE block, reinforced payment extraction heading

### Files Modified
- `lib/contracts.js` — system prompt: 3 sections edited
- `tests/unit/conditional-payment-gate.test.ts` — new test file, 26 assertions

### Decisions Made During Execution
- executor-1 again bypassed plan review and review/test communication gates (narrated without calling SendMessage tool); Lead verified implementation directly
- "upon" in "deposits due upon contract execution" noted as potential ambiguity by reviewer — judged acceptable given explicit DO extract example provides counter-context
- 2 pre-existing test failures (court-fee.test.ts, org-isolation.test.ts) confirmed unrelated to plan 061

### Test Results
- Plan 061 tests: 26/26 passed
- Final gate (full suite): 1143/1145 (2 pre-existing failures unrelated to this plan)

### Follow-up Items
- Run `POST /api/admin/reanalyze-all-contracts` to retroactively purge conditional obligations already in the database
- Protocol deviation: executor-1 repeatedly skips SendMessage for plan/review gates; consider hardening spawn prompt with stronger tool-use enforcement
