# Lead Notes — Plan 059

## Plan Overview

Three independent bug fixes from Plan 057 (bulk actions + progress bar):
1. **Task 1** — Progress bar stuck: add try/finally to guarantee cleanup in handleBatchProcess
2. **Task 2** — No progress bar on docs tab: extract shared ProcessingProgressBar component, add to documents library
3. **Task 3** — Can't skip status transitions: add cross-step entries to CONTRACT_STATUS_ACTION_MAP

## Concurrency Decision

3 tasks, all independent → 2 concurrent task-teams (rule: 1-3 tasks = 1-2 slots).
- Tasks 1 and 3 spawn first (smaller changes, faster to complete).
- Task 2 spawns when first slot frees.

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies
- Task 3: no dependencies

All 3 are fully independent.

## Key Architectural Constraints

1. **`processingProgress` state** — `ProcessingProgress | null` in `contracts-tab.tsx`. `null` = hidden. `{ active: true, ... }` = showing. There's no `active: false` state — bar is controlled by null vs. non-null.

2. **`isVisible` condition** — `selectedCount > 0 || processingProgress?.active`. Bar visible if contracts are selected OR processing is active. After processing: both must be falsy to hide.

3. **`CONTRACT_STATUS_ACTION_MAP`** — maps `[currentStatus][targetStatus]` → action string for the API. Missing entries yield `undefined` → silent skip in `handleBulkStatusChange`. API route already supports all needed actions (sign, activate, terminate, unsign, deactivate, reactivate).

4. **`transitionObligationsByStage` ignores `previousStage`** — the function deactivates ALL stages ≠ newStage. Cross-step transitions are safe DB-side. No DB/API changes needed for Task 3.

5. **Shared component extraction (Task 2)** — Extract progress bar UI from `ContractBulkActionBar` into `src/components/ui/processing-progress-bar.tsx`. Both contracts tab and documents library import it. The existing progress bar CSS/animation stays identical.

6. **Documents library processing pattern** — `library/page.tsx` currently calls `handleProcessAll` which processes ALL eligible docs in parallel (Promise.all or forEach). Must change to sequential per-item loop (same as contracts tab) to enable per-item progress tracking.

7. **`action-bar.tsx` change** — Currently accepts `loading: string | null` prop. Add `processingProgress: ProcessingProgress | null` prop. Disable process button when `processingProgress?.active`.

## Files Involved

- Task 1: `src/components/contracts/contracts-tab.tsx`
- Task 2: `src/components/ui/processing-progress-bar.tsx` (new), `src/components/contracts/contract-bulk-action-bar.tsx`, `src/app/(app)/documents/library/page.tsx`, `src/components/documents/action-bar.tsx`
- Task 3: `src/lib/constants.ts`

## Execution Log

(to be filled during execution)
