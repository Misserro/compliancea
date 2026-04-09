# Task 2 Plan: Maintenance cycle — classification branch + re-match loop

## Overview

Replace the hard-coded `doc_type = 'contract'` path in `processGDriveDocument` with a classification branch using `classifyGDriveDocument` from Task 1, and add a `rematchUnlinkedDocuments` function called at the end of each per-org maintenance pass.

## Files to modify

1. **`lib/maintenance.js`** — the only file changed

## Detailed Changes

### 1. Update imports (line 4, 7)

Add to db.js import:
- `findMatchingContract`, `insertContractDocument`, `getUnmatchedAnnexes`, `getUnmatchedInvoices`, `insertContractInvoiceFromGDrive`, `getDocumentFullText`

Add to contracts.js import:
- `classifyGDriveDocument`

### 2. Refactor `processGDriveDocument` (lines 149-301)

**Current flow:** text extraction -> `extractContractTerms` -> update metadata as contract -> historical check -> obligations.

**New flow:** text extraction -> `classifyGDriveDocument(text)` -> branch on `classification`:

#### Branch: `'contract'` (existing path, unchanged)
- Call `extractContractTerms(text)` (same as today)
- `updateDocumentMetadata(docId, { doc_type: 'contract', ...fields, processed: 1 })`
- Historical check + obligation insertion (copy existing code verbatim)

#### Branch: `'annex'`
- `updateDocumentProcessed(docId, wordCount)`
- `updateDocumentMetadata(docId, { doc_type: 'annex', full_text: text, classification_metadata: JSON.stringify(annexParentReference), name: annexParentReference?.contractTitle ? 'Annex: ' + annexParentReference.contractTitle : doc name })`
- `findMatchingContract(orgId, { parties: annexParentReference.parties, contractRef: annexParentReference.contractNumber })` -> if matched: `insertContractDocument(contractId, docId, 'annex', annexParentReference.contractTitle)`
- Log action

#### Branch: `'invoice'`
- `updateDocumentProcessed(docId, wordCount)`
- `updateDocumentMetadata(docId, { doc_type: 'invoice', full_text: text, classification_metadata: JSON.stringify(invoiceData) })`
- `findMatchingContract(orgId, { parties: [invoiceData.vendorName], contractRef: invoiceData.contractReference, vendorName: invoiceData.vendorName })` -> if matched: `insertContractInvoiceFromGDrive(contractId, docId, invoiceData)`
- Log action

#### Branch: `'other'`
- `updateDocumentProcessed(docId, wordCount)`
- `updateDocumentMetadata(docId, { doc_type: 'other', full_text: text })`
- Log action

### 3. Add `rematchUnlinkedDocuments(orgId)` function

- Fetch `getUnmatchedAnnexes(orgId)` — for each doc:
  - Parse `classification_metadata` JSON to get `annexParentReference`
  - If metadata available: call `findMatchingContract(orgId, { parties, contractRef })`
  - If matched: `insertContractDocument(contractId, docId, 'annex', label)`
- Fetch `getUnmatchedInvoices(orgId)` — for each doc:
  - Parse `classification_metadata` JSON to get `invoiceData`
  - If metadata available: call `findMatchingContract(orgId, { parties: [vendorName], contractRef, vendorName })`
  - If matched: `insertContractInvoiceFromGDrive(contractId, docId, invoiceData)`
- No Claude calls — uses stored `classification_metadata` only
- Errors per-doc are caught and logged, don't break the loop

### 4. Call `rematchUnlinkedDocuments` in `runMaintenanceCycle`

After the GDrive sync + auto-process loop for each org (after line 81), call `await rematchUnlinkedDocuments(org_id)` and store result in `results.gdrive[org_id].rematch`.

## Design Decisions

1. **Store `classification_metadata` during initial processing** — This avoids re-calling Claude during re-match. The `classification_metadata TEXT` column was already added by Task 1's migration.
2. **Re-match is heuristic-only** — Uses `findMatchingContract` with stored metadata. No AI calls.
3. **Contract branch unchanged** — The existing obligation extraction path is preserved verbatim to avoid regression.
4. **`full_text` stored for all classifications** — Enables future re-processing if needed.

## Risk Mitigation

- Contract path is extracted into a helper or kept inline but unchanged — zero regression risk
- Each classification branch has its own error boundary in the log action
- Re-match errors are per-document, don't fail the maintenance cycle
