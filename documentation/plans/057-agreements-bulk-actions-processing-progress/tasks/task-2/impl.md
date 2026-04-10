## Task 2 Complete -- ContractBulkActionBar Component

### Files Created

- **`src/components/ui/progress.tsx`** (new file)
  - Shadcn/ui-style Progress component based on `@radix-ui/react-progress`
  - Follows existing UI component patterns (cn utility, data-slot attributes, function components)
  - Installed `@radix-ui/react-progress` as new dependency

- **`src/components/contracts/contract-bulk-action-bar.tsx`** (new file)
  - Exported `ContractBulkActionBar` component and `ContractBulkActionBarProps` interface
  - Two visual modes:
    - **Action mode** (processingProgress is null): Badge with count, Select dropdown for CONTRACT_STATUSES, "Process Selected" button, "Clear" ghost button
    - **Progress mode** (processingProgress.active): Progress bar with percentage and "Processing X/N -- name" label
  - Slide-up/slide-down via `transition-transform duration-300` + `translate-y-full` when hidden
  - Fixed positioning at bottom of viewport (`fixed bottom-0 left-0 right-0 z-50`)
  - Max-width container (`max-w-4xl mx-auto`) for consistent sizing
  - Select dropdown opens upward (`side="top"`) since bar is at viewport bottom
  - All UI strings use `useTranslations("Contracts")` i18n keys

### Files Modified

- **`src/components/contracts/contracts-tab.tsx`** (major changes)
  - **Lifted contract fetch** from ContractList: added `contracts: Contract[]` and `contractsLoading: boolean` state with `useEffect` fetch (same pattern as was in ContractList)
  - Added `refreshContracts` callback to increment `refreshTrigger`
  - Added `processingProgress: ProcessingProgress | null` state (null = idle; Task 4 fills the handler)
  - Added `statusChangeInProgress: boolean` state (Task 3 fills the handler)
  - Added `selectedContracts` derived via `useMemo` from `contracts.filter(c => selectedIds.has(c.id))`
  - Added placeholder `handleBulkStatusChange` (Task 3) and `handleBatchProcess` (Task 4) callbacks
  - Mounted `<ContractBulkActionBar>` after the main layout div with all props wired
  - Exported `ProcessingProgress` type for use by Tasks 3 and 4
  - New imports: `useEffect`, `useMemo`, `toast`, `Contract` type, `ContractBulkActionBar`

- **`src/components/contracts/contract-list.tsx`** (refactored to presentational)
  - Removed internal `fetch`, `contracts`/`loading` state, and `cardRefresh` state
  - Removed `useState`, `useEffect`, `toast` imports (no longer needed)
  - New props: `contracts: Contract[]`, `loading: boolean`, `onRefresh?: () => void`
  - Removed prop: `refreshTrigger`
  - `onContractUpdate` in each ContractCard now calls `onRefresh?.()` + `onClearSelection?.()` instead of internal `setCardRefresh`
  - All filtering, multi-select, and rendering logic unchanged

- **`messages/en.json`** -- Added under "Contracts":
  - `"changeStatus"`: "Change Status"
  - `"processSelected"`: "Process Selected"
  - `"clearSelection"`: "Clear"
  - `"processingProgress"`: "Processing {current}/{total} -- {name}"
  - `"bulkSelectedCount"`: "{count} selected"

- **`messages/pl.json`** -- Added under "Contracts":
  - `"changeStatus"`: "Zmien status"
  - `"processSelected"`: "Przetwarzaj zaznaczone"
  - `"clearSelection"`: "Wyczysc"
  - `"processingProgress"`: "Przetwarzanie {current}/{total} -- {name}"
  - `"bulkSelectedCount"`: "Zaznaczono: {count}"

### Data Lifting Decision

Moved the `/api/contracts` fetch from ContractList to ContractsTab as recommended by Lead notes. This gives ContractsTab access to Contract objects (not just IDs), enabling it to:
1. Derive `selectedContracts: Contract[]` for the action bar props
2. Pass contract data to Task 3's status change handler and Task 4's processing handler

ContractList is now a pure display component that receives `contracts` and `loading` as props.

### Integration Points for Downstream Tasks

- **Task 3 (Bulk status change):** Should implement `handleBulkStatusChange` in ContractsTab. The function receives `targetStatus: string`. Use `selectedContracts` (already computed) + `CONTRACT_STATUS_ACTION_MAP` (Task 3 adds to constants.ts). Set `statusChangeInProgress = true` during execution. Call `refreshContracts()` + `clearSelection()` on completion.

- **Task 4 (Batch processing):** Should implement `handleBatchProcess` in ContractsTab. Use `selectedContracts` array. Set `processingProgress` state during loop. The bar already consumes this state to show live progress. Call `refreshContracts()` + `clearSelection()` + `setProcessingProgress(null)` on completion.

- **IMPORTANT for Tasks 3 & 4:** The `setProcessingProgress` and `setStatusChangeInProgress` state setters are currently only used locally. Tasks 3 and 4 will need to access them when implementing their handlers. Since they modify the same file (contracts-tab.tsx), the placeholders are already in place.

### Exports

- `ContractBulkActionBar` component from `src/components/contracts/contract-bulk-action-bar.tsx`
- `ContractBulkActionBarProps` interface from same file
- `ProcessingProgress` type from `src/components/contracts/contracts-tab.tsx`

### Success Criteria Verification

1. Bar slides up when selected -- translate-y-0 when `selectedCount > 0 || processingProgress?.active`, translate-y-full otherwise
2. "Change Status" dropdown shows all 4 CONTRACT_STATUSES -- iterates `CONTRACT_STATUSES`, displays via `t('contractStatus.{status}')`
3. "Process Selected" disabled during status change -- `disabled={statusChangeInProgress || selectedCount === 0}`
4. Progress bar fills proportionally -- `Progress value = Math.round((current / total) * 100)`
5. Contract list scrollable behind bar -- bar uses `fixed` positioning with `z-50`, no overflow changes on parent
