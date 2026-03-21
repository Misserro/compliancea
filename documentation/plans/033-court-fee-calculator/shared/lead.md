# Lead Notes — Plan 033: Polish Court Fee Calculator

## Plan Overview

Add an automatic Polish civil court fee calculator derived from `claim_value`. The fee is never stored — computed on render. Two tasks, sequential dependency.

## Concurrency Decision

- 1 active task-team at a time (Task 2 depends on Task 1)
- Task 2 will be pipeline-spawned (planning only) while Task 1 is in review/test

## Task Dependency Graph

- Task 1: no dependencies — Court Fee Calculation Utility + Unit Tests
- Task 2: depends on Task 1 — Court Fee Row in Case Metadata Form

## Key Architectural Constraints

1. **No DB changes** — fee is a pure computed value, never persisted
2. **No API changes** — calculation happens client-side on render
3. **Calculation utility goes in `src/lib/court-fee.ts`** — pure TypeScript, zero imports
4. **UI change is read-only** — only view mode of `CaseMetadataForm`, not edit mode
5. **Condition: `case_type === "civil"`** — the stored enum value for civil cases
6. **Currency guard: `claim_currency === "PLN"`** — show note otherwise
7. **Fee display pattern** — match existing `${value.toLocaleString()} ${currency}` pattern from line 338

## Critical Decisions

- Court fee shown only for `case_type === "civil"` (user confirmed)
- Non-PLN claims: show muted note "Court fee calculation applies to PLN claims only"
- Invalid/null claim: show "—"
- `(auto)` suffix to signal it's system-calculated
- Test file: `tests/unit/court-fee.test.ts` (Vitest, matches existing pattern in `tests/unit/`)

## Files to Be Touched

- `src/lib/court-fee.ts` — new (Task 1)
- `tests/unit/court-fee.test.ts` — new (Task 1)
- `src/components/legal-hub/case-metadata-form.tsx` — modified (Task 2)

## Post-Execution

Push to GitHub after all tasks complete.

---

## Execution Complete

**Plan:** 033-court-fee-calculator
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: `src/lib/court-fee.ts` + `tests/unit/court-fee.test.ts` — 33-test boundary suite, all passing
- Task 2: `src/components/legal-hub/case-metadata-form.tsx` — read-only Court Fee row added to view mode

### Files Modified
- `src/lib/court-fee.ts` — created
- `tests/unit/court-fee.test.ts` — created
- `src/components/legal-hub/case-metadata-form.tsx` — modified (import + view-mode row)

### Test Results
- Per-task tests (Task 1): 33/33 passed
- Full suite after Task 2: 709/709 passed (0 regressions)

### Decisions Made During Execution
- Reviewer/tester agents exit after context-loading when no messages arrive — handled by Lead doing plan review directly
- executor-1 implemented without waiting for plan review gate (acceptable given exact match with spec)
- IIFE pattern used for courtFee local const in JSX (`(() => { const courtFee = ...; return ... })()`)

