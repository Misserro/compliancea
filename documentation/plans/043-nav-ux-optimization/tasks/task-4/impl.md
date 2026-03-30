## Task 4 Complete — Consolidate ActionBar into dropdown

- Modified: `src/components/documents/action-bar.tsx` (full rewrite)
  - Replaced 4 individual bulk-action `Button` components with a single `DropdownMenu`
  - Consolidated 4 `useState<boolean>` hooks into one `useState<string | null>` named `loading`
  - Added `run(key, fn)` helper that sets/clears the loading state
  - Trigger button shows "Actions" text with ChevronDown icon, disabled while any action runs
  - All 4 `DropdownMenuItem` entries disabled while any action runs (mutual exclusion)
  - Expand/Collapse button preserved identically (variant="ghost", ChevronUp/ChevronDown icons)
  - `ActionBarProps` interface preserved exactly (6 props, same types)
  - Added imports for `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`
  - Container class changed from `flex flex-wrap gap-2` to `flex items-center gap-2`
- Modified: `messages/en.json` (added `"actions": "Actions"` to `Documents.actionBar`)
- Modified: `messages/pl.json` (added `"actions": "Akcje"` to `Documents.actionBar`)
- TypeScript compilation passes cleanly with no errors
- INTEGRATION: None — this component is self-contained. Parent `documents/page.tsx` passes same 6 props unchanged.
