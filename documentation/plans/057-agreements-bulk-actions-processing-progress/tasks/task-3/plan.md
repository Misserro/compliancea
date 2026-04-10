# Task 3 Plan -- Bulk Status Change Logic

## Overview

Implement the `CONTRACT_STATUS_ACTION_MAP` constant and the `handleBulkStatusChange` handler in `ContractsTab`. When a user picks a target status from the action bar dropdown, iterate all selected contracts, resolve the action via the map, call `POST /api/documents/[id]/contract-action` serially for valid transitions, skip invalid ones, then show a summary toast and refresh.

## Files to Modify

### 1. `src/lib/constants.ts`
- Add `CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>>` after the existing `CONTRACT_STATUS_DISPLAY` block (line ~58)
- Maps `[currentStatus][targetStatus]` to action name:
  - unsigned.signed = "sign"
  - signed.unsigned = "unsign"
  - signed.active = "activate"
  - active.signed = "deactivate"
  - active.terminated = "terminate"
  - terminated.active = "reactivate"

### 2. `src/components/contracts/contracts-tab.tsx`
- Import `CONTRACT_STATUS_ACTION_MAP` from constants
- Replace placeholder `handleBulkStatusChange` (lines 102-104) with full implementation:
  1. Set `setStatusChangeInProgress(true)`
  2. Partition `selectedContracts` into actionable (have valid transition) vs skipped (same status as target OR no valid transition)
  3. Track "already at target" separately from "no valid transition" for distinct toast messages
  4. Serial loop: for each actionable contract, call `POST /api/documents/${contract.id}/contract-action` with `{ action }`. Count successes and failures.
  5. Set `setStatusChangeInProgress(false)`
  6. Call `refreshContracts()` and `clearSelection()`
  7. Show toast with results
- Add a `selectResetKey` state counter that increments after each status change, passed as `key` to the Select in the action bar to reset its displayed value

### 3. `src/components/contracts/contract-bulk-action-bar.tsx`
- Add `selectResetKey?: number` prop
- Apply it as `key={selectResetKey}` on the Select component so it resets after a bulk status change

### 4. `messages/en.json` -- Add under "Contracts":
- `"bulkStatusUpdated"`: "Updated {updated} contract(s)."
- `"bulkStatusSkipped"`: "Updated {updated} contracts. {skipped} skipped (no valid transition)."
- `"bulkStatusAlreadyTarget"`: "0 updated, {count} already at target status."
- `"bulkStatusFailed"`: "{failed} failed to update."

### 5. `messages/pl.json` -- Add under "Contracts":
- Polish translations for the same keys

## Logic Details

### Partitioning algorithm
```
for each contract in selectedContracts:
  if contract.status === targetStatus:
    -> alreadyAtTarget++
  else if CONTRACT_STATUS_ACTION_MAP[contract.status]?.[targetStatus]:
    -> actionable list (contract + action)
  else:
    -> skipped (no valid transition)
```

### Toast message logic
- If actionable.length === 0 and alreadyAtTarget > 0: "0 updated, N already at target status."
- If skipped > 0: "Updated X contracts. Y skipped (no valid transition)."
- If all succeeded: "Updated X contract(s)."
- If any failed: append " Z failed to update."

### Select reset
The Select in ContractBulkActionBar is uncontrolled (no `value` prop). After a status change completes, I need to reset it. I'll pass a `selectResetKey` number prop and use it as the `key` on the Select element. Incrementing the key forces React to remount the Select, resetting it to the placeholder state.

## Risks / Trade-offs

- Serial API calls: for large selections this could be slow. This matches the existing `handleProcessAll` pattern and avoids thundering herd. Acceptable for now.
- No confirmation dialog for bulk changes: the plan says "show a confirmation dialog if any contracts will be skipped" but the success criteria do not mention a confirmation dialog. I will skip the confirmation dialog to keep scope tight -- the toast provides sufficient feedback. If needed, it can be added later.
- The contract-action endpoint does its own validation (checks valid actions). If a transition is invalid server-side, the endpoint returns 400. The client-side map should prevent this, but we handle errors gracefully anyway.
