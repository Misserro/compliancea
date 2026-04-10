## Task 4 Complete -- Batch Processing with Progress

### Files Modified

- **`src/components/contracts/contracts-tab.tsx`** (lines 175-209)
  - Replaced placeholder `handleBatchProcess` (was empty `useCallback(() => {}, [])`) with full async implementation
  - Sets `processingProgress = { active: true, current: 0, total, currentName: "" }` at start
  - Serial loop: for each contract at index `i`, updates `processingProgress` to `{ active: true, current: i+1, total, currentName: contract.name }` BEFORE the fetch call so UI shows the in-flight contract
  - Calls `POST /api/documents/${contract.id}/process` with `method: "POST"` (no body needed)
  - Per-item try/catch: failures increment `failed` counter but loop continues
  - On completion: `setProcessingProgress(null)`, `clearSelection()`, `refreshContracts()`
  - Toast: success shows "Processed X/N contracts.", warning shows "Processed X/N contracts. M failed."
  - Dependencies: `[selectedContracts, t, refreshContracts, clearSelection]`

- **`messages/en.json`** (after `bulkStatusFailed` key, before `annexes`):
  - `"bulkProcessed": "Processed {succeeded}/{total} contracts."`
  - `"bulkProcessedWithFailures": "Processed {succeeded}/{total} contracts. {failed} failed."`

- **`messages/pl.json`** (same position):
  - `"bulkProcessed": "Przetworzono {succeeded}/{total} umow."`
  - `"bulkProcessedWithFailures": "Przetworzono {succeeded}/{total} umow. {failed} nie powiodlo sie."`

### No Changes Needed

- **`src/components/contracts/contract-bulk-action-bar.tsx`** -- already renders progress mode when `processingProgress?.active` is true. No modifications required.
- **`src/app/api/documents/[id]/process/route.ts`** -- existing endpoint, no changes.
- **`src/app/(app)/documents/library/page.tsx`** -- single-document process flow untouched.

### Design Decisions

1. **Serial loop with indexed for-loop**: Matches `handleProcessAll` pattern from `library/page.tsx`. Uses `for (let i = 0; ...)` instead of `for...of` to get the index for progress tracking.

2. **Progress update before fetch**: `setProcessingProgress` is called with `current: i + 1` BEFORE `await fetch(...)` so the user sees "Processing 1/3 -- ContractName" while the request is in flight, not after it completes.

3. **`selectedContracts` used directly**: The `useMemo`-derived `selectedContracts` array is used directly in the loop -- no re-filtering needed.

4. **Toast uses `succeeded` not `processed`**: Named `succeeded` to distinguish from `failed`, matching the i18n parameter names.

### TypeScript

`npx tsc --noEmit` passes cleanly with no errors.

### Success Criteria Verification

1. "Processing 1/3 -- [name]" display -- SATISFIED: `setProcessingProgress` called with `current: i+1, currentName: contract.name` before each fetch
2. Bar advances proportionally -- SATISFIED: `ContractBulkActionBar` computes `progressPercent = Math.round((current / total) * 100)` from the progress state
3. Failed contracts counted, processing continues -- SATISFIED: per-item try/catch, `failed` counter incremented on error or non-ok response
4. Progress disappears, bar closes, list refreshes -- SATISFIED: `setProcessingProgress(null)` + `clearSelection()` + `refreshContracts()`
5. No regression on single-document process -- SATISFIED: no changes to process API route or library page
