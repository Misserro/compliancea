# Contracts Tab: Search & Filter

**Date:** 2026-03-15

## Overview

Three targeted changes to the Contracts tab:
1. Remove the active/overdue obligation count badges from each contract card.
2. Add a dynamic search bar that filters contracts by name or vendor as the user types.
3. Add a multi-select status filter (checkboxes) to show only contracts of chosen statuses.

All filtering is client-side on the already-fetched dataset — no API changes required.

## Files Affected

### `src/components/contracts/contract-card.tsx`

Remove the obligation count badges section from the collapsed card header. Specifically, delete the `<div className="flex items-center gap-2 ml-4 flex-shrink-0">` block containing the "Active" and "Overdue" badge elements (currently lines ~146–159). Also remove the now-unused `AlertCircle` and `CheckCircle2` imports from `lucide-react`.

The `activeObligations` and `overdueObligations` fields remain on the `Contract` type — they are simply no longer rendered.

### `src/components/contracts/contracts-tab.tsx`

Gains two new state variables:
- `searchQuery: string` — initialised to `""`.
- `selectedStatuses: string[]` — initialised to `["unsigned", "signed", "active", "terminated"]` (all selected, so nothing is hidden on first load).

**Layout changes** (below the existing title + "Add New Contract" button row):

1. **Search bar** — a full-width controlled input with placeholder "Search by name or vendor…", updates `searchQuery` on every `onChange`. Uses the `Input` component from `@/components/ui/input` (confirmed present in this codebase).

2. **Status checkboxes** — a horizontal row of four labelled checkboxes, one per status, using the internal status keys and their display labels from `CONTRACT_STATUS_DISPLAY` (imported from `@/lib/constants`):
   - `unsigned` → "Inactive"
   - `signed` → "To Sign"
   - `active` → "Active"
   - `terminated` → "Terminated"

   Each checkbox toggles its status key in/out of `selectedStatuses`.

Both `searchQuery` and `selectedStatuses` are passed as props to `<ContractList>`.

### `src/components/contracts/contract-list.tsx`

Accepts two new props:
```ts
searchQuery: string;
selectedStatuses: string[];
```

After the fetch resolves, derives `filteredContracts` from the raw `contracts` array by applying both filters in sequence:

1. **Status filter:** keep contracts where `contract.status` is included in `selectedStatuses`. If `selectedStatuses` is empty, show nothing (not all — empty selection means nothing passes).

2. **Search filter:** if `searchQuery.trim()` is non-empty, keep only contracts where at least one of the following contains the query (case-insensitive):
   - `contract.name` (non-nullable, safe to call directly)
   - `contract.contracting_vendor` (nullable — must be null-guarded, e.g. `(contract.contracting_vendor ?? "")`)
   - `contract.client` (nullable — must be null-guarded, e.g. `(contract.client ?? "")`)

Renders `filteredContracts` instead of `contracts`.

**Empty state:** when `filteredContracts` is empty but `contracts` is non-empty (i.e. filters are active), show "No contracts match your search." instead of the default "No contracts found." message.

## Data Flow

```
ContractsTab
  state: searchQuery, selectedStatuses
  ↓ props
ContractList
  fetch: /api/contracts → contracts[]
  derive: filteredContracts (status filter → search filter)
  render: filteredContracts.map(ContractCard)
```

## Out of Scope

- No API changes.
- No changes to `contract-card.tsx` beyond removing the obligation badges.
- No changes to `obligations-tab.tsx`.
- No URL-based filter persistence.
- No debouncing of the search input (immediate filtering on each keystroke is the stated requirement).
