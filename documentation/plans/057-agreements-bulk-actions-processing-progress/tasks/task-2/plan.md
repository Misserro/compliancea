# Task 2 Plan -- ContractBulkActionBar Component

## Overview

Build the floating action bar that appears at the bottom of the agreements view when contracts are selected. The bar shows selection count, "Change Status" dropdown, "Process Selected" button, and "Clear" link. It transforms into a live progress bar during processing.

## Files to Create/Modify

### 1. NEW: `src/components/ui/progress.tsx`
- Create shadcn/ui Progress component (radix-ui/react-progress based)
- Follows same pattern as other shadcn/ui components in the project (cn utility, data-slot, function components)
- Needed by the action bar for the processing progress indicator

### 2. NEW: `src/components/contracts/contract-bulk-action-bar.tsx`
- Props interface as specified in the task spawn prompt (selectedCount, selectedContracts, onStatusChange, onProcess, onClear, processingProgress, statusChangeInProgress)
- Two visual modes:
  - **Action mode** (processingProgress is null): Badge with count, Select dropdown for CONTRACT_STATUSES (using existing Select components from ui/select.tsx), "Process Selected" Button, "Clear" link button
  - **Progress mode** (processingProgress.active is true): Progress bar showing current/total with currentName label
- Slide-up/slide-down animation via Tailwind `transition-transform` + `translate-y-full` when hidden
- Visibility: shown when selectedCount > 0 OR processingProgress?.active
- "Process Selected" button disabled when statusChangeInProgress is true
- "Change Status" dropdown disabled when processingProgress?.active is true
- i18n via useTranslations("Contracts") for all user-visible strings
- Fixed positioning at bottom of viewport (or sticky within container) so contract list remains scrollable behind it

### 3. MODIFY: `src/components/contracts/contracts-tab.tsx`
- **Lift contract data from ContractList**: Add `contracts: Contract[]` and `loading: boolean` state to ContractsTab. Move the fetch from ContractList up to ContractsTab. Pass contracts down to ContractList as a prop (ContractList becomes a "display" component that receives data rather than fetching it).
- **Add new ContractList props**: `contracts: Contract[]`, `loading: boolean` -- ContractList will use these instead of its own fetch.
- **Add processingProgress state**: `{ active: boolean; current: number; total: number; currentName: string } | null` (initialized as null). Task 4 will fill the handler; the state is created now.
- **Add statusChangeInProgress state**: `boolean` (initialized as false). Task 3 will fill the handler; the state is created now.
- **Add placeholder handlers**: `handleBulkStatusChange(targetStatus: string)` (no-op for now, Task 3 fills), `handleBatchProcess()` (no-op for now, Task 4 fills).
- **Compute selectedContracts**: Derive `selectedContracts` from `contracts.filter(c => selectedIds.has(c.id))`.
- **Mount ContractBulkActionBar**: After the ContractList, render `<ContractBulkActionBar>` with all props wired up.
- **Wrap the contracts section in a relative container** so the fixed bar positions correctly.

### 4. MODIFY: `src/components/contracts/contract-list.tsx`
- Remove the internal `fetch` + `contracts`/`loading` state.
- Accept `contracts: Contract[]` and `loading: boolean` as props instead.
- Keep the `cardRefresh` mechanism -- but change it to call an `onRefresh?: () => void` prop to signal ContractsTab to re-fetch.
- Keep all filtering logic (still operates on the contracts prop).
- Keep all multi-select wiring from Task 1 unchanged.

### 5. MODIFY: `messages/en.json`
- Add translation keys under "Contracts":
  - `"changeStatus"`: "Change Status"
  - `"processSelected"`: "Process Selected"
  - `"clearSelection"`: "Clear"
  - `"processing"`: "Processing {current}/{total} -- {name}"
  - `"bulkSelectedCount"`: "{count} selected"

### 6. MODIFY: `messages/pl.json`
- Add corresponding Polish translation keys under "Contracts":
  - `"changeStatus"`: "Zmien status"
  - `"processSelected"`: "Przetwarzaj zaznaczone"
  - `"clearSelection"`: "Wyczysc"
  - `"processing"`: "Przetwarzanie {current}/{total} -- {name}"
  - `"bulkSelectedCount"`: "Zaznaczono: {count}"

## Data Lifting Strategy

Currently, ContractList fetches its own data via `fetch("/api/contracts")`. The BulkActionBar needs the actual Contract objects (not just IDs) for status validation and progress display. The plan lifts this fetch to ContractsTab:

1. Move the `useEffect` fetch + `contracts`/`loading` state from ContractList to ContractsTab
2. ContractsTab passes `contracts` and `loading` as props to ContractList
3. ContractList's `cardRefresh` state becomes an `onRefresh` callback that increments `refreshTrigger` in ContractsTab
4. ContractsTab can then derive `selectedContracts = contracts.filter(c => selectedIds.has(c.id))`

This is the approach recommended by the Lead notes ("Prefer option 1 -- lift to ContractsTab for cleaner data flow").

## Risks and Trade-offs

- **Data lifting is a refactoring step**: Moving the fetch from ContractList to ContractsTab changes the data flow. Must ensure no regressions in filtering, loading states, and card refresh behavior.
- **Progress component**: No shadcn/ui Progress component exists in the project. I will create a minimal one following the project's shadcn/ui patterns (radix-ui/react-progress).
- **Select dropdown position**: The action bar is at the bottom of the viewport. The Select dropdown opens upward (side="top") to avoid being clipped. Need to verify the Select component supports this via the `side` prop on SelectContent.

## Success Criteria Mapping

1. Bar slides up when first contract selected -> translate-y animation keyed on (selectedCount > 0 || processingProgress?.active)
2. "Change Status" shows all 4 CONTRACT_STATUSES -> iterate CONTRACT_STATUSES, display via t('contractStatus.{status}')
3. "Process Selected" disabled during status change -> disabled={statusChangeInProgress}
4. Progress bar fills proportionally -> Progress component value = (current/total)*100
5. Contract list scrollable behind bar -> bar uses fixed/sticky positioning with appropriate z-index, list has no overflow:hidden
