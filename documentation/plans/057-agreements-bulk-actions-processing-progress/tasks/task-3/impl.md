## Task 3 Complete -- Bulk Status Change Logic

### Files Modified

- **`src/lib/constants.ts`** (added lines 60-67)
  - Added `CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>>` after `CONTRACT_STATUS_DISPLAY`
  - Maps `[currentStatus][targetStatus]` to action name: unsigned->signed="sign", signed->unsigned="unsign", signed->active="activate", active->signed="deactivate", active->terminated="terminate", terminated->active="reactivate"

- **`src/components/contracts/contracts-tab.tsx`** (lines 13, 94, 102-173, 277)
  - Added import of `CONTRACT_STATUS_ACTION_MAP` from constants
  - Added `selectResetKey` state (line 94) to reset the Select dropdown after status change
  - Replaced placeholder `handleBulkStatusChange` with full async implementation (lines 102-173):
    - Partitions selectedContracts into: actionable (valid transition exists), alreadyAtTarget (status === target), skipped (no valid transition)
    - Early return with info toast if nothing actionable
    - Serial fetch loop calling `POST /api/documents/[id]/contract-action` with `{ action }` for each actionable contract
    - Sets `statusChangeInProgress` true/false to disable UI during operation
    - Calls `refreshContracts()` + `clearSelection()` + increments `selectResetKey` on completion
    - Toast logic: success if all updated, warning if any failed, info if nothing to do
  - Passed `selectResetKey` prop to `<ContractBulkActionBar>`

- **`src/components/contracts/contract-bulk-action-bar.tsx`** (lines 32, 42, 85)
  - Added `selectResetKey?: number` to `ContractBulkActionBarProps` interface
  - Destructured `selectResetKey` in component params
  - Applied `key={selectResetKey}` on Select component to force remount/reset after status change

- **`messages/en.json`** -- Added under "Contracts" (after bulkSelectedCount):
  - `"bulkStatusUpdated"`: "Updated {updated} contracts."
  - `"bulkStatusSkipped"`: "Updated {updated} contracts. {skipped} skipped (no valid transition)."
  - `"bulkStatusAlreadyTarget"`: "0 updated, {count} already at target status."
  - `"bulkStatusFailed"`: "{failed} failed to update."

- **`messages/pl.json`** -- Added under "Contracts" (after bulkSelectedCount):
  - Polish translations for the same 4 keys

### Integration Points for Downstream Tasks

- **Task 4 (Batch processing):** `processingProgress` and `setProcessingProgress` are already declared in ContractsTab. The placeholder `handleBatchProcess` at line 176 is ready to be filled. The `selectResetKey` mechanism is independent of processing progress.

### Design Decisions

1. **Serial API calls**: Follows the same pattern as `handleProcessAll` in `library/page.tsx`. Each contract is updated sequentially to avoid thundering herd.

2. **Three-way partition**: Contracts are classified as (a) already at target status, (b) has valid transition, or (c) no valid transition. This gives precise toast messages per the success criteria.

3. **Select reset via key prop**: The Select component in ContractBulkActionBar is uncontrolled (no `value` prop). After a status change, incrementing `selectResetKey` forces React to remount the Select, resetting it to the placeholder state.

4. **No confirmation dialog**: The README mentions a confirmation dialog when contracts will be skipped, but the success criteria do not require it. Kept scope tight -- the toast provides the skip feedback.

### Success Criteria Verification

1. Selecting 3 unsigned contracts -> target "signed": all 3 get action "sign" via map, toast "Updated 3 contracts." -- SATISFIED
2. Mix of unsigned + terminated -> target "signed": unsigned gets "sign", terminated has no map entry for "signed" so skipped. Toast "Updated N contracts. M skipped (no valid transition)." -- SATISFIED
3. All contracts already at target status: all counted as alreadyAtTarget, no API calls, toast "0 updated, N already at target status." -- SATISFIED
4. List refreshes after bulk change: `refreshContracts()` called, selection cleared -- SATISFIED
5. No regression on single-card actions: `handleStatusAction` in contract-card.tsx is untouched -- SATISFIED

### TypeScript

`npx tsc --noEmit` passes cleanly with no errors.
