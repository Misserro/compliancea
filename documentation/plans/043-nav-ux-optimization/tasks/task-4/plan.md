# Task 4 — Implementation Plan: Consolidate ActionBar into Dropdown

## Overview

Replace the 4 individual bulk-action buttons in `ActionBar` with a single "Actions" `DropdownMenu`. Keep Expand/Collapse as a standalone button. Consolidate 4 separate loading booleans into a single `string | null` state.

## Files to Modify

### 1. `src/components/documents/action-bar.tsx` (rewrite)

**Current state:** 4 separate `Button` components for Scan Server, Scan GDrive, Process All, Retag All. Each has its own `useState<boolean>` for loading. Plus 1 Expand/Collapse button.

**Changes:**
- Remove 4 individual `useState<boolean>` hooks (`scanning`, `scanningGDrive`, `processing`, `retagging`)
- Add single `useState<string | null>(null)` named `loading` to track which action is running
- Import `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- Import `ChevronDown` once (used for both menu chevron and expand icon — already imported)
- Add helper function `run(key: string, fn: () => Promise<void>)` that sets loading key, awaits fn, then clears loading
- Replace 4 buttons with a single `DropdownMenu`:
  - Trigger: `Button variant="outline" size="sm"` with text from `t("actionBar.actions")` + ChevronDown icon
  - Trigger disabled when `loading !== null`
  - 4 `DropdownMenuItem` entries, each with icon + label (showing loading text when active)
  - Each item disabled when `loading !== null`
- Expand/Collapse button remains unchanged (same variant="ghost", same icons, same behavior)
- `ActionBarProps` interface preserved exactly as-is (6 props, same types)

### 2. `messages/en.json` — add "actions" key

Add `"actions": "Actions"` to the `Documents.actionBar` object (after existing keys or at the start). All other keys remain unchanged.

### 3. `messages/pl.json` — add "actions" key

Add `"actions": "Akcje"` to the `Documents.actionBar` object. All other keys remain unchanged.

## Success Criteria Mapping

1. "ActionBar renders as 1 Actions dropdown + Expand/Collapse button" -- Dropdown replaces 4 buttons, Expand/Collapse stays.
2. "All 4 actions are reachable from the dropdown and function identically" -- Same onClick handlers, same loading text, same icons.
3. "Only one action can run at a time" -- Single `loading` state; trigger and all items disabled when `loading !== null`.
4. "Expand/Collapse button is unchanged" -- Copied verbatim from current code.

## Risks

- **Radix DropdownMenu closes on item click by default.** This is fine because `run()` captures the action in closure before the menu closes. The loading state disables re-opening until the action completes.
- **`ActionBarProps` interface must not change.** The rewrite preserves it exactly.
