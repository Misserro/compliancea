# Task 1 — Multi-select wiring — Implementation Plan

## Overview

Wire up multi-select on contract cards. ContractCard already has `isSelected`/`onSelect` props but they are currently used for the AI chat panel's single-selection behavior. We need to repurpose them for multi-select (checkbox toggle) while preserving the chat panel's single-select when chat is open.

## Key Discovery

Currently, `onSelect` is called inside the card header's `onClick` handler — it fires on every card expand/collapse click and is used to tell the chat panel which contract is selected. This is **not** a checkbox; it is a click-to-expand that also notifies the parent.

For multi-select, we need a **separate checkbox element** in the card header that calls a different callback. The existing `onSelect`/`isSelected` props serve the chat panel and should not be repurposed for bulk selection — that would break chat panel selection.

**Approach:** Add new props for multi-select (`isMultiSelected`, `onMultiSelect`) alongside the existing `isSelected`/`onSelect` which continue to serve the chat panel. The checkbox only renders when `onMultiSelect` is provided.

**Wait — re-reading the plan:** The plan says "wire existing isSelected/onSelect props." Let me re-examine.

Looking at the plan more carefully: the plan says ContractCard "already accepts `isSelected` and `onSelect` props (contract-card.tsx:18-19) but they are unused." However, they ARE used — ContractList passes them when `chatOpen` is true (contracts-tab.tsx:83-84). The plan may not have accounted for this.

**Resolution:** I will add dedicated multi-select props (`isMultiSelected`/`onToggleSelect`) to avoid breaking the chat panel's single-select behavior. The existing `isSelected`/`onSelect` remain for the chat panel. This is a safer approach that avoids regression.

**Update after further review:** Actually, the task description says "Wire existing isSelected/onSelect props on ContractCard." I'll follow the plan literally. The current `isSelected`/`onSelect` usage for chat panel will need to coexist. Looking more carefully at the code:

- `isSelected` currently adds `ring-2 ring-primary/40` styling (line 118)
- `onSelect` is called on header click alongside expand/collapse (lines 125-127)

The plan wants checkboxes for bulk selection. The simplest correct approach: add NEW multi-select props since the existing ones serve a different purpose (chat context). I'll document this deviation clearly.

## Final Approach

Add new props to ContractCard and ContractList for multi-select, keeping existing chat-panel selection intact.

## Files to Modify

### 1. `src/components/contracts/contract-card.tsx`
- Add props: `isMultiSelected?: boolean`, `onToggleSelect?: (contractId: number) => void`
- Render a `Checkbox` (from `@/components/ui/checkbox`) in the card header, before the chevron, when `onToggleSelect` is provided
- Checkbox click handler: `event.stopPropagation()` + call `onToggleSelect(contract.id)`
- Card visual: add `ring-2 ring-primary/40` when `isMultiSelected` (currently this styling is on `isSelected` — both can coexist)

### 2. `src/components/contracts/contract-list.tsx`
- Add props: `selectedIds?: Set<number>`, `onToggleSelect?: (contractId: number) => void`, `onSelectAll?: () => void`, `onClearSelection?: () => void`
- Pass `isMultiSelected={selectedIds?.has(contract.id)}` and `onToggleSelect` to each ContractCard
- Add a "Select all / Deselect all" toggle above the list (only visible when `onToggleSelect` is provided and contracts exist)
- Expose `filteredContracts` to parent — actually, the parent needs to know visible contract IDs for "select all". Two options:
  - Option A: ContractList calls `onSelectAll` and parent selects all by querying the list (but parent doesn't know which are filtered)
  - Option B: ContractList manages select-all internally by passing all filtered IDs up
  - **Decision:** ContractList will call a new `onSelectAllVisible?: (ids: number[]) => void` that passes the filtered contract IDs. This way ContractsTab can set all of them. Simpler: just have `onSelectAll` and `onClearSelection`, but ContractList implements select-all by calling `onToggleSelect` for each visible contract — no, that's N calls.
  - **Final decision:** Add `onSelectAllVisible?: (ids: number[]) => void` to ContractList props. When "Select all" is clicked, ContractList calls `onSelectAllVisible(filteredContracts.map(c => c.id))`. ContractsTab sets `selectedIds = new Set(ids)`.

### 3. `src/components/contracts/contracts-tab.tsx`
- Add state: `const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())`
- Add handlers:
  - `toggleSelect(id: number)` — toggle id in/out of set
  - `selectAllVisible(ids: number[])` — set selectedIds to new Set(ids)
  - `clearSelection()` — set to empty Set
- Clear selection when `refreshTrigger` changes (on contract update) — add useEffect or clear in the refresh handler
- Pass `selectedIds`, `onToggleSelect`, `onSelectAllVisible`, `onClearSelection` to ContractList
- These props are always passed (not gated on chatOpen like the existing selection)

### 4. `messages/en.json` — Add translation keys
- `Contracts.selectAll`: "Select all {count}"
- `Contracts.deselectAll`: "Deselect all"
- `Contracts.selected`: "{count} selected"

### 5. `messages/pl.json` — Add Polish translation keys
- `Contracts.selectAll`: "Zaznacz wszystkie {count}"
- `Contracts.deselectAll`: "Odznacz wszystkie"
- `Contracts.selected`: "{count} zaznaczonych"

## Success Criteria Mapping

1. **Clicking a card's checkbox selects/deselects it without expanding/collapsing the card** -- Checkbox with stopPropagation, separate from header click
2. **Selecting some cards and then clicking "Select all" selects every visible contract** -- "Select all" calls onSelectAllVisible with filtered IDs
3. **Refreshing the list (via onContractUpdate) clears the selection** -- Clear selectedIds when refreshTrigger increments
4. **No regression** -- Existing isSelected/onSelect for chat panel remains untouched; expand/collapse, metadata editing, status actions unchanged

## Risks

- **Deviation from plan:** Plan says "wire existing isSelected/onSelect" but those props are actively used by the chat panel. Adding new props is safer. If the Lead disagrees, I can refactor to share the props, but that requires changing the chat panel integration too (out of scope).
