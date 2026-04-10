## Task 4 Plan -- Batch Processing with Progress

### Goal

Replace the placeholder `handleBatchProcess` in `contracts-tab.tsx` with a real async handler that serially processes each selected contract via `POST /api/documents/[id]/process`, updating `processingProgress` state after each step. Add i18n keys for the completion toast.

### Files to Modify

1. **`src/components/contracts/contracts-tab.tsx`** (lines 175-178)
   - Replace placeholder `handleBatchProcess` with async implementation
   - Change `useCallback(() => {}, [])` to `useCallback(async () => { ... }, [selectedContracts, t, refreshContracts, clearSelection, setProcessingProgress])`
   - Implementation follows `handleProcessAll` pattern from `library/page.tsx:129-161`

2. **`messages/en.json`** -- Add toast keys under "Contracts" section (after `bulkStatusFailed`):
   - `"bulkProcessed": "Processed {succeeded}/{total} contracts."`
   - `"bulkProcessedWithFailures": "Processed {succeeded}/{total} contracts. {failed} failed."`

3. **`messages/pl.json`** -- Add Polish translations for the same 2 keys

### Implementation Details

#### handleBatchProcess logic:

```
1. Early return if selectedContracts.length === 0
2. const total = selectedContracts.length
3. setProcessingProgress({ active: true, current: 0, total, currentName: "" })
4. let succeeded = 0, failed = 0
5. for (let i = 0; i < selectedContracts.length; i++):
   a. const contract = selectedContracts[i]
   b. setProcessingProgress({ active: true, current: i + 1, total, currentName: contract.name })
   c. try:
      - await fetch(`/api/documents/${contract.id}/process`, { method: "POST" })
      - if res.ok: succeeded++ else: failed++
   d. catch: failed++
6. setProcessingProgress(null)
7. clearSelection()
8. refreshContracts()
9. Toast: if failed > 0, use bulkProcessedWithFailures; else use bulkProcessed
```

#### Key decisions:
- **Serial loop with for-of + await**: matches `handleProcessAll` pattern exactly
- **Per-item try/catch**: individual failures don't stop the batch
- **Progress update BEFORE the fetch**: user sees "Processing 1/3 -- ContractName" while it's being processed (same UX pattern as the library page)
- **POST body**: empty `{}` not needed -- the process route reads from URL params and the document DB record, no body required. Just `method: "POST"`.
- **No changes to ContractBulkActionBar**: it already reads `processingProgress` prop and renders progress mode when `active === true`

### Risks

- None significant. The pattern is well-established in the codebase. The progress state type is already declared. The action bar already consumes it.

### Success Criteria Mapping

1. "Processing 1/3 -- [name]" -- satisfied by setting current=i+1, currentName=contract.name BEFORE fetch
2. Bar advances proportionally -- satisfied by ContractBulkActionBar already computing width from current/total
3. Failed contracts counted, processing continues -- satisfied by per-item try/catch
4. Progress disappears, bar closes, list refreshes -- satisfied by setProcessingProgress(null) + clearSelection() + refreshContracts()
5. No regression on single-document process -- we don't touch the process API route or library page
