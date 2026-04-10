# Lead Notes — Plan 057

## Plan Overview

Agreements bulk actions + processing progress bar. Two coupled features on the contracts view:
1. Multi-select checkboxes on contract cards + bulk status change
2. Batch processing of selected contracts with live X/N progress bar

Both features share one selection model. ContractCard already has `isSelected`/`onSelect` props (unused). Processing uses client-side serial loop (same as `library/page.tsx:handleProcessAll`). No new API endpoints needed.

## Concurrency Decision

4 tasks → 2 concurrent task-teams. Tasks 1→2→3 are sequential (each builds on the previous). Task 4 can pipeline off Task 3 (shares progress state).

## Task Dependency Graph

- Task 1 (multi-select wiring): no dependencies
- Task 2 (ContractBulkActionBar component): depends on Task 1
- Task 3 (bulk status change logic): depends on Task 2
- Task 4 (batch processing with progress): depends on Task 3

## Key Architectural Constraints

1. **Contract status changes MUST use `contract-action` route** — NOT `PATCH /api/documents/[id]/status`. The contract-action route triggers obligation stage transitions. Using the direct status PATCH bypasses this and corrupts obligation state.

2. **STATUS_TRANSITION_MAP** — Client-side lookup `(currentStatus, targetStatus) → actionName`:
   - unsigned→signed: "sign"
   - signed→unsigned: "unsign"
   - signed→active: "activate"
   - active→signed: "deactivate"
   - active→terminated: "terminate"
   - terminated→active: "reactivate"
   Add to `src/lib/constants.ts`.

3. **Selection state in ContractsTab** — already owns search/filter state. Add `selectedIds: Set<number>` here. Thread down to ContractList → ContractCard.

4. **ContractCard `onSelect` signature** is `(contractId: number | null, contractName: string | null) => void` — match this exactly.

5. **Progress state in ContractsTab** — `{ active: boolean; current: number; total: number; currentName: string } | null`. Passed as prop to ContractBulkActionBar.

6. **i18n** — project uses next-intl. Any new user-visible strings should use `useTranslations`. Check existing translation keys before adding new ones.

7. **Cards layout** — agreements are collapsible cards, NOT a table. Checkbox in card header must not trigger card expand/collapse (stopPropagation).

## Files Involved

- `src/components/contracts/contracts-tab.tsx` — Tasks 1, 3, 4
- `src/components/contracts/contract-list.tsx` — Task 1
- `src/components/contracts/contract-card.tsx` — Task 1
- `src/components/contracts/contract-bulk-action-bar.tsx` — Task 2 (new)
- `src/lib/constants.ts` — Task 3

## Critical Note for Tasks 2-4

Contract objects are currently fetched inside `ContractList` (not exposed to ContractsTab). `selectedIds` is in `ContractsTab`. Tasks 2-4 need the selected Contract objects (not just IDs) for status change and processing. Executor-2 must address this by either:
- Lifting contract fetch to `ContractsTab` and passing contracts down to `ContractList`, OR
- Adding `onContractsChange?: (contracts: Contract[]) => void` callback from ContractList to ContractsTab

Prefer option 1 (lift to ContractsTab) for cleaner data flow.

## Execution Log

- Task 1 DONE: Multi-select wiring complete. TypeScript clean. New props isMultiSelected/onToggleSelect added to ContractCard (separate from existing chat-panel isSelected/onSelect). Selection state in ContractsTab.
- Task 2 DONE: ContractBulkActionBar created. Contract fetch lifted to ContractsTab. processingProgress + statusChangeInProgress state added. Placeholder handlers ready for Tasks 3+4. Progress.tsx created using @radix-ui/react-progress.
- Task 3 DONE: CONTRACT_STATUS_ACTION_MAP added to constants.ts (6 transitions). handleBulkStatusChange implemented with 3-bucket partitioning (actionable/alreadyAtTarget/skipped), serial API calls, selectResetKey trick for dropdown reset.
- Task 4 DONE: handleBatchProcess implemented with serial for-loop, live processingProgress state updates, setProcessingProgress(null) + clearSelection + refreshContracts on completion, toast with succeeded/failed counts.

## Final Gate Result

PASSED — 2026-04-10
- 1100 tests passed (2 pre-existing failures unrelated to Plan 057)
- `npx tsc --noEmit` clean
- `npx next build` successful

## Key Decisions Made During Execution

1. **New props for multi-select** — executor-1 correctly added `isMultiSelected`/`onToggleSelect` as NEW props rather than repurposing `isSelected`/`onSelect` (used by chat panel). Both coexist; no regression.
2. **Contract fetch lifted to ContractsTab** — executor-2 implemented option 1 (lift), passing `contracts`+`loading` as props to ContractList. Cleaner data flow.
3. **Progress component created** — `src/components/ui/progress.tsx` was missing from project. Lead pre-emptively notified executor-2; created using `@radix-ui/react-progress`.
4. **3-bucket partitioning for status change** — Lead proactively clarified distinction between `alreadyAtTarget` (skip, different toast) vs `skipped` (invalid transition). Executor-3 implemented correctly.
