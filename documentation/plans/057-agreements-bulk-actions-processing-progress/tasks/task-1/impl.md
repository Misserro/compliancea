## Task 1 Complete -- Multi-select wiring

### Files Modified

- **`src/components/contracts/contract-card.tsx`** (lines 9, 16-23, 47, 121, 135-147)
  - Added import for `Checkbox` from `@/components/ui/checkbox`
  - Added new props: `isMultiSelected?: boolean`, `onToggleSelect?: (contractId: number) => void`
  - Renders a `Checkbox` in the card header (before the chevron) when `onToggleSelect` is provided
  - Checkbox is wrapped in a `<div onClick={e.stopPropagation()}>` to prevent card expand/collapse
  - Card ring styling responds to both `isSelected` (chat panel) and `isMultiSelected` (bulk select)

- **`src/components/contracts/contract-list.tsx`** (lines 8, 18-25, 34-37, 105-128, 130-141)
  - Added import for `Checkbox` from `@/components/ui/checkbox`
  - Added new props: `selectedIds`, `onToggleSelect`, `onSelectAllVisible`, `onClearSelection`
  - Renders a "Select all / Deselect all" toggle above the list (only when `onToggleSelect` is provided and filtered contracts exist)
  - Uses indeterminate checkbox state when some (but not all) visible contracts are selected
  - Threads `isMultiSelected` and `onToggleSelect` to each ContractCard
  - Calls `onClearSelection` when any card triggers `onContractUpdate` (list refresh clears selection)

- **`src/components/contracts/contracts-tab.tsx`** (lines 2, 22-43, 108-111)
  - Added `useCallback` import
  - Added `selectedIds: Set<number>` state
  - Added handlers: `toggleSelect`, `selectAllVisible`, `clearSelection` (all wrapped in `useCallback`)
  - Passes all multi-select props to `ContractList`

- **`messages/en.json`** -- Added translation keys under `Contracts`:
  - `selectAll`: "Select all {count}"
  - `deselectAll`: "Deselect all"
  - `selected`: "{count} selected"

- **`messages/pl.json`** -- Added Polish translation keys under `Contracts`:
  - `selectAll`: "Zaznacz wszystkie ({count})"
  - `deselectAll`: "Odznacz wszystkie"
  - `selected`: "Zaznaczono: {count}"

### Design Decision: New Props vs Reusing Existing

The plan said "wire existing isSelected/onSelect props" but those props are actively used by the AI chat panel for single-contract selection (contracts-tab.tsx passes them conditionally when `chatOpen` is true). Repurposing them for multi-select checkboxes would break the chat panel.

**Decision:** Added NEW props (`isMultiSelected`/`onToggleSelect`) for bulk selection. The existing `isSelected`/`onSelect` remain untouched for the chat panel. Both can coexist -- a card can be both the chat-panel-selected card AND multi-selected for bulk actions.

### Integration Points for Downstream Tasks

- **Task 2 (ContractBulkActionBar):** Should consume `selectedIds` from ContractsTab. The `selectedIds` state and `clearSelection` handler are already exported-ready as props.
- **Task 3 (Bulk status change):** Will need access to `selectedIds` and the contract objects. ContractList currently owns the contract data (fetched internally). Task 3 may need to either:
  - Lift contract fetching to ContractsTab, OR
  - Have ContractList expose filtered contracts via a callback/ref
- **Task 4 (Batch processing):** Same data access consideration as Task 3.

### Exports

- `ContractCard` now accepts: `isMultiSelected?: boolean`, `onToggleSelect?: (contractId: number) => void`
- `ContractList` now accepts: `selectedIds?: Set<number>`, `onToggleSelect?: (contractId: number) => void`, `onSelectAllVisible?: (ids: number[]) => void`, `onClearSelection?: () => void`

### Success Criteria Verification

1. Checkbox click selects/deselects without expand/collapse -- stopPropagation on wrapper div
2. "Select all" selects every visible contract -- calls onSelectAllVisible with filtered IDs
3. List refresh clears selection -- onContractUpdate calls onClearSelection
4. No regression -- existing isSelected/onSelect/expand/collapse/metadata/status actions untouched
