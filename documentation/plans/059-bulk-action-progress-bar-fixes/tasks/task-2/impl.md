## Task 2 Complete -- Processing progress bar for documents library tab

### Files changed

- **Created:** `src/components/ui/processing-progress-bar.tsx` (new file)
  - Exports `ProcessingProgress` interface (canonical location)
  - Exports `ProcessingProgressContent` -- pure inner component (label + percentage + Progress bar, no fixed wrapper). Used by `ContractBulkActionBar` inside its own single persistent wrapper.
  - Exports `ProcessingProgressBar` -- standalone component with fixed-bottom container + translate-y slide animation. Used by documents library page which has no existing fixed-bottom bar.
  - Both accept `processingProgress` and `label: string` (parent formats the label with its own translations)

- **Modified:** `src/components/contracts/contract-bulk-action-bar.tsx`
  - Removed local `ProcessingProgress` interface, replaced with import from `@/components/ui/processing-progress-bar`
  - Removed `Progress` import (no longer used directly)
  - Imports `ProcessingProgressContent` (not `ProcessingProgressBar`) to render progress inside the existing single wrapper
  - Preserves the original single-wrapper pattern: ONE `<div>` with `fixed bottom-0` always in the DOM, with `isVisible = selectedCount > 0 || processingProgress?.active` controlling the translate-y animation
  - Inside that single wrapper, ternary branches between `<ProcessingProgressContent>` (progress mode) and action buttons (action mode)
  - CSS transition works correctly in both directions (slide-in on process start, slide-out on process end)

- **Modified:** `src/components/contracts/contracts-tab.tsx`
  - Removed local `ProcessingProgress` interface export, replaced with type import from `@/components/ui/processing-progress-bar`

- **Modified:** `src/app/(app)/documents/library/page.tsx`
  - Added `ProcessingProgressBar` and `ProcessingProgress` imports
  - Added `processingProgress` state (`useState<ProcessingProgress | null>(null)`)
  - Rewrote `handleProcessAll` from simple sequential loop to progress-tracked sequential loop:
    - Sets `processingProgress` before the loop with `{ active: true, current: 0, total, currentName: "" }`
    - Updates `processingProgress` per item with `current: i + 1` and `currentName: doc.name`
    - Wrapped in `try/finally` to guarantee `setProcessingProgress(null)` and `loadDocuments()` on exit
    - Kept existing `processingIds` tracking for per-item spinner in the document list
    - Changed toast from always `toast.success` to `toast.warning` for failures
  - Passes `processingProgress` to `<ActionBar>`
  - Mounts `<ProcessingProgressBar>` at the bottom of page JSX (standalone, with its own fixed-bottom container)

- **Modified:** `src/components/documents/action-bar.tsx`
  - Added `ProcessingProgress` type import
  - Added optional `processingProgress?: ProcessingProgress | null` prop
  - Added `isDisabled` computed flag: `loading !== null || processingProgress?.active === true`
  - All `disabled={loading !== null}` replaced with `disabled={isDisabled}`

- **Modified:** `messages/en.json` -- added `Documents.processingProgress` key
- **Modified:** `messages/pl.json` -- added `Documents.processingProgress` key

### Verification

- `npx tsc --noEmit` -- passes clean
- `npx next build` -- passes clean

### Review fix log

- **Fix 1:** Reviewer identified that the early-return pattern in `ContractBulkActionBar` breaks the CSS slide-out animation (two separate DOM nodes swap instead of one node toggling classes). Fixed by splitting the shared component into `ProcessingProgressContent` (pure inner, no wrapper) and `ProcessingProgressBar` (standalone with fixed wrapper). `ContractBulkActionBar` uses `ProcessingProgressContent` inside its single persistent wrapper with the original ternary pattern. Documents library page uses `ProcessingProgressBar` standalone.

### Integration notes

- INTEGRATION: The `ProcessingProgress` type is now exported from `src/components/ui/processing-progress-bar.tsx`. Any file that previously imported it from `contracts-tab.tsx` should update its import path.
- INTEGRATION: Two exports from the shared component -- use `ProcessingProgressContent` when you have your own container (like `ContractBulkActionBar`), use `ProcessingProgressBar` when you need a standalone fixed-bottom bar.
