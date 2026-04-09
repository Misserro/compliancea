# Task 2 Implementation Notes

## Files changed

1. **`lib/maintenance.js`** — Full rewrite of `processGDriveDocument` with classification branch, new `rematchUnlinkedDocuments` function, wired into `runMaintenanceCycle`
2. **`lib/db.js`** — Added `classification_metadata` to `allowedFields` in `updateDocumentMetadata` (line 1379)

## Changes in detail

### `lib/maintenance.js`

**Imports updated (lines 1-7):**
- Added from `./db.js`: `findMatchingContract`, `insertContractDocument`, `insertContractInvoiceFromGDrive`, `getUnmatchedAnnexes`, `getUnmatchedInvoices`
- Added from `./contracts.js`: `classifyGDriveDocument`

**`processGDriveDocument` (lines 149-316):**
- Text extraction unchanged
- After extraction, calls `classifyGDriveDocument(text)` to get `{ classification, annexParentReference, invoiceData }`
- `updateDocumentProcessed(docId, wordCount)` called once before branching
- Four branches:
  - `'contract'`: existing path verbatim — `extractContractTerms`, metadata update, historical check, obligation insertion
  - `'annex'`: sets `doc_type='annex'`, stores `classification_metadata` JSON, attempts `findMatchingContract` -> `insertContractDocument` if matched
  - `'invoice'`: sets `doc_type='invoice'`, stores `classification_metadata` JSON, attempts `findMatchingContract` -> `insertContractInvoiceFromGDrive` if matched
  - `'other'`: sets `doc_type='other'`, stores `full_text`, no further processing
- Each branch ends with `logAction` including `classification` field

**`rematchUnlinkedDocuments(orgId)` (lines 318-377):**
- Fetches unmatched annexes via `getUnmatchedAnnexes(orgId)`
- For each: parses `classification_metadata` JSON, runs `findMatchingContract`, inserts `contract_documents` row if matched
- Same pattern for unmatched invoices via `getUnmatchedInvoices(orgId)`
- No Claude calls — heuristic matching only using stored metadata
- Per-document try/catch so one failure doesn't abort the loop
- Returns `{ annexesMatched, invoicesMatched }`

**`runMaintenanceCycle` (lines 83-88):**
- After the auto-process loop for each org, calls `rematchUnlinkedDocuments(org_id)`
- Runs regardless of whether `syncResult.added > 0` (previously unmatched docs may match newly imported contracts from earlier cycles)
- Result stored in `results.gdrive[org_id].rematch`

### `lib/db.js`

- Added `"classification_metadata"` to `allowedFields` array in `updateDocumentMetadata` (line 1379) so that `classification_metadata` values passed via `updateDocumentMetadata` are actually persisted to the DB

## Build verification

`npm run build` passes with no errors.
