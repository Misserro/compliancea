# Lead Notes — Plan 019: Obligation Improvements

## Plan Overview

Three coordinated improvements: (1) standalone /obligations page + nav cleanup, (2) 4-category typed system with DB columns + category-first creation form, (3) obligation card redesign with Complete dialog.

## Concurrency Decision

- 3 tasks; Task 1 and Task 2 are independent — run simultaneously
- Task 3 depends on Task 2 (needs typed category fields in Obligation type)
- Max 2 active task-teams at a time
- Pipeline-spawn Task 3 in planning-only mode when Task 2 enters review/test

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies
- Task 3: depends on Task 2 (category-specific fields on Obligation type and constants)

## Key Architectural Constraints

1. All DB logic in `lib/db.js` (CJS) only — bridge via `src/lib/db-imports.ts`
2. New category columns via `ALTER TABLE` migrations (same pattern as existing migration block)
3. Category migration map: `payments→payment`, `termination→operational`, `legal→compliance`, `others→operational`
4. New 4 categories: `payment`, `reporting`, `compliance`, `operational`
5. logAction() must receive plain objects — NO JSON.stringify()
6. Complete dialog requires at least note OR document (validated client-side + server enforces existing behavior)
7. Task 3 card redesign must preserve all existing ObligationCard callback props (onUpdateField, onAddEvidence, etc.)

## Execution Complete

**Plan:** 019-obligation-improvements
**Tasks:** 3 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1 (Navigation cleanup): /obligations/page.tsx replaced redirect with real page (heading, stats bar, ObligationsTab). /contracts/page.tsx stripped of tab switcher — renders ContractsTab directly.
- Task 2 (Category system): 4 new categories (payment/reporting/compliance/operational) with 8 typed DB columns. Category-first creation form. Migration map for old categories. POST route fixed: logAction added, re-fetch added, category no blank default.
- Task 3 (Card + view redesign): ObligationCard surface redesigned — category badge, title, due date chip (overdue=red), status badge, Evidence + Complete buttons always visible. CompleteObligationDialog with note/document validation. finalize route hardened (runtime, ensureDb, NextRequest, audit-imports, catch typing). AlertDialog replaces window.confirm for evidence removal.

### Files Modified
- `src/app/(app)/obligations/page.tsx` — real page
- `src/app/(app)/contracts/page.tsx` — simplified
- `lib/db.js` — 8 new category columns, updated insertObligation/updateObligation/spawnDueObligations
- `lib/db.d.ts` — updated declarations
- `src/lib/types.ts` — 8 new Obligation fields
- `src/lib/constants.ts` — new categories, colors, migration map, REPORTING_FREQUENCIES, STATUS_COLORS.upcoming
- `src/app/api/obligations/[id]/route.ts` — expanded PATCH allowlist
- `src/app/api/documents/[id]/obligations/route.ts` — logAction + re-fetch added to POST
- `src/app/api/obligations/[id]/finalize/route.ts` — hardened per standards
- `src/app/(app)/contracts/new/ContractsNewForm.tsx` — category-first form
- `src/components/obligations/obligation-card.tsx` — full redesign
- `src/components/contracts/per-contract-obligations.tsx` — onFinalize→onCompleted
- `documentation/technology/standards/logging.md` — added "finalized" to allowed actions

### Files Created
- `src/components/obligations/complete-obligation-dialog.tsx`

### Decisions Made During Execution
- STATUS_COLORS.upcoming added to constants (amber token) rather than inline utilities
- POST /obligations route: logAction + re-fetch were pre-existing gaps, fixed as part of task 2 review
- finalize route had 6 pre-existing standards violations (runtime, ensureDb, NextRequest, audit-imports, unknown catch, action name) — all fixed when task 3 touched the file
- "finalized" added to logging.md allowed action names

### Test Results
- Per-task tests: 3/3 passed (each after ≤1 review fix cycle)
- Final gate (full suite): PASSED — npm run build, 50 pages, zero TypeScript errors

### Follow-up Items
- `documents/[id]/obligations` POST route: pre-existing `isNaN` guard is after `ensureDb()` — technically compliant but note for future cleanup
- `contract-card.tsx:62` window.confirm() is pre-existing, not in scope of this plan

## Critical Decisions

- Task 1 and Task 2 run in parallel (both independent)
- Task 3 pipeline-spawned during Task 2 review/test to parallelize planning
- Completion flow reuses existing `/finalize` endpoint — UI change only for the dialog
- Category-specific fields stored as typed columns (not details_json) for queryability

## Agents

| Agent | Name | Status |
|-------|------|--------|
| Tech Knowledge | knowledge-obligation-improvements | pending |
| Project Manager | pm-obligation-improvements | pending |
| Executor (T1) | executor-1 | pending |
| Executor (T2) | executor-2 | pending |
| Executor (T3) | executor-3 | pending |
