# Plan 057 — Agreements Bulk Actions + Processing Progress Bar

## Overview

Two coupled features on the agreements/contracts view:

1. **Multi-select + bulk status change** — select multiple contracts and change all of them to a chosen status in one action.
2. **Batch process with progress bar** — select contracts, click Process, watch a live `X/N` progress bar as each one is processed sequentially.

Both features share one multi-select model: checkboxes on each card → floating action bar with both actions available.

## Architecture Notes

- `ContractCard` already has unused `isSelected` and `onSelect` props — wire them up rather than adding new ones.
- Contract status changes **must** go through `POST /api/documents/[id]/contract-action` (not PATCH status) because the route also triggers obligation stage transitions.
- Status→action mapping (client-side): `(currentStatus, targetStatus) → actionName`
- Processing uses the existing serial loop pattern from `library/page.tsx:handleProcessAll` — no new API endpoints needed.
- Progress is tracked entirely client-side: `{ active, current, total, currentName }` state in `ContractsTab`.

## Status → Action Mapping

| Current → Target | Action |
|---|---|
| unsigned → signed | `sign` |
| signed → unsigned | `unsign` |
| signed → active | `activate` |
| active → signed | `deactivate` |
| active → terminated | `terminate` |
| terminated → active | `reactivate` |

Contracts with no valid transition to the chosen target status are skipped; result toast reports `X updated, Y skipped`.

## Files Affected

- `src/components/contracts/contracts-tab.tsx` — add selection state + processing progress state
- `src/components/contracts/contract-list.tsx` — thread selection callbacks down to cards; add "Select all" toggle
- `src/components/contracts/contract-card.tsx` — wire existing `isSelected`/`onSelect` props to render checkbox
- `src/components/contracts/contract-bulk-action-bar.tsx` — **new** — floating bar with status dropdown, process button, progress bar
- `src/lib/constants.ts` — add `CONTRACT_STATUS_ACTION_MAP` for the (currentStatus, targetStatus) → action lookup

## Tasks

- [ ] **Task 1 — Multi-select wiring** (contracts-tab.tsx, contract-list.tsx, contract-card.tsx)
- [ ] **Task 2 — ContractBulkActionBar component** (contract-bulk-action-bar.tsx)
- [ ] **Task 3 — Bulk status change logic** (contracts-tab.tsx, constants.ts)
- [ ] **Task 4 — Batch processing with progress** (contracts-tab.tsx, contract-bulk-action-bar.tsx)

---

## Task 1 — Multi-select wiring

**Goal:** Clicking a checkbox on a contract card toggles its selection. A "select all / deselect all" control is available. Selection state is visible across all cards simultaneously.

**Why:** `ContractCard` already accepts `isSelected` and `onSelect` props (contract-card.tsx:18–19) but they are unused — nothing passes them. Selection state needs to live at the `ContractsTab` level (already owns filter state) and thread down.

**Files to modify:**
- `src/components/contracts/contracts-tab.tsx` — add `selectedIds: Set<number>` state; `toggleSelect(id)`, `selectAll()`, `clearSelection()` handlers; pass down to `ContractList`
- `src/components/contracts/contract-list.tsx` — accept and thread `selectedIds`, `onToggleSelect`, `onSelectAll`, `onClearSelection` props; pass `isSelected` and `onSelect` to each `ContractCard`; add "Select all N / Deselect all" toggle above the list (only visible when ≥1 contract rendered)
- `src/components/contracts/contract-card.tsx` — render a checkbox in the card header when `onSelect` is provided; clicking it calls `onSelect(contract.id, contract.name)` and stops event propagation to prevent expanding the card

**Success criteria:**
- Clicking a card's checkbox selects/deselects it without expanding/collapsing the card
- Selecting some cards and then clicking "Select all" selects every visible contract
- Refreshing the list (via `onContractUpdate`) clears the selection
- No regression: existing card expand/collapse, metadata editing, and status action buttons still work

---

## Task 2 — ContractBulkActionBar component

**Goal:** A sticky bar appears at the bottom of the agreements view whenever ≥1 contracts are selected. It shows the count, a "Change Status" dropdown, a "Process Selected" button, and a "Clear selection" link. While processing is active, the action buttons are replaced by a progress bar showing `Processing X/N — <contract name>`.

**Files to create/modify:**
- `src/components/contracts/contract-bulk-action-bar.tsx` — **new component**
  - Props: `selectedCount`, `selectedContracts: Contract[]`, `onStatusChange(targetStatus)`, `onProcess()`, `onClear()`, `progress: { active, current, total, currentName } | null`
  - When `progress` is null: render count badge + "Change Status" dropdown (CONTRACT_STATUSES options) + "Process Selected" button + "Clear" link
  - When `progress` is active: render progress bar (`current/total` width) + label "Processing {current}/{total} — {currentName}" + disabled cancel (future scope, not now)
  - Transitions with a slide-up animation; disappears when `selectedCount === 0` and no active progress
- `src/components/contracts/contracts-tab.tsx` — mount `<ContractBulkActionBar>` below the contract list; pass selection and progress state as props

**Success criteria:**
- Bar slides up when first contract is selected, slides down when selection is cleared after processing completes
- "Change Status" dropdown shows all 4 CONTRACT_STATUSES with their display labels
- "Process Selected" button is disabled while bulk status change is in progress (and vice versa)
- Progress bar fills proportionally: 0% at start, 100% when last document finishes
- During processing, the contract list behind the bar is still visible and scrollable

---

## Task 3 — Bulk status change logic

**Goal:** User picks a target status in the action bar dropdown → all selected contracts that can validly transition to that status are updated; ones that cannot are skipped. A toast summarises the outcome.

**Files to modify:**
- `src/lib/constants.ts` — add `CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>>` mapping `[currentStatus][targetStatus]` to the action name string (e.g., `CONTRACT_STATUS_ACTION_MAP.unsigned.signed === "sign"`). This is the single source of truth for the transition table.
- `src/components/contracts/contracts-tab.tsx` — add `handleBulkStatusChange(targetStatus: string)` handler:
  1. Build a list of `{ contract, action }` pairs using `CONTRACT_STATUS_ACTION_MAP`; contracts with no valid transition are noted as skipped
  2. Show a confirmation dialog if any contracts will be skipped
  3. Call `POST /api/documents/[id]/contract-action` for each applicable contract (serial to avoid thundering herd, same pattern as `handleProcessAll`)
  4. On completion: call `onContractUpdate()` to refresh the list and clear selection; show toast: `"Updated X contract(s). Y skipped (no valid transition)."`

**Success criteria:**
- Selecting 3 "unsigned" contracts and setting status to "signed" calls `sign` action on all 3 and shows "Updated 3 contracts."
- Selecting a mix of "unsigned" and "terminated" contracts and setting status to "signed" updates the "unsigned" ones and shows "Updated N contracts. M skipped (no valid transition)."
- If all selected contracts are already at the target status, nothing is called and toast says "0 updated, N already at target status."
- The contract list refreshes after bulk change and shows updated status badges
- No regression: single-card status action buttons (sign, activate, etc.) still work independently

---

## Task 4 — Batch processing with progress

**Goal:** "Process Selected" processes each selected contract sequentially, advancing a visible progress indicator from `0/N` to `N/N`. When done, the selection is cleared and a toast confirms completion.

**Files to modify:**
- `src/components/contracts/contracts-tab.tsx` — add `processingProgress: { active: boolean; current: number; total: number; currentName: string } | null` state (null = idle); add `handleBatchProcess()` handler:
  1. Set `processingProgress = { active: true, current: 0, total: selectedContracts.length, currentName: "" }`
  2. Loop: for each contract at index `i`, set `current = i + 1, currentName = contract.name`, call `POST /api/documents/${contract.id}/process`; await before moving to next
  3. On completion (or error per-item — log and continue): set `processingProgress = null`, clear selection, call `onContractUpdate()`, toast "Processed X/N contracts."
- `src/components/contracts/contract-bulk-action-bar.tsx` — consumes `progress` prop (from Task 2) to render live state

**Success criteria:**
- Selecting 3 contracts and clicking "Process Selected" shows the action bar transform into a progress bar displaying "Processing 1/3 — [name of first contract]"
- After first contract finishes, label updates to "Processing 2/3 — [name of second contract]" and the bar advances to ~33% → ~66%
- If one contract fails processing (API returns error), that contract is counted but processing continues to the next; final toast shows how many succeeded
- After all N finish, the progress bar disappears, the action bar closes, the list refreshes with updated `processed` state
- No regression: the single-document process flow in the document library continues to work independently
