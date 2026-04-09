# Task 1 Implementation Notes

## Files Changed

| File | Change |
|------|--------|
| `lib/contracts.js` | Added `classifyGDriveDocument(text, apiKey?)` — single Claude call returning `{ classification, annexParentReference, invoiceData, tokenUsage }`. Defaults to `'contract'` on parse failure (fail-safe). Bilingual EN/PL classification prompt. |
| `lib/contracts.d.ts` | Added type declaration for `classifyGDriveDocument` |
| `lib/db.js` | Migration: `document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL` on `contract_invoices`, `classification_metadata TEXT` on `documents`. Added 6 new functions: `findMatchingContract`, `insertContractDocument`, `getUnmatchedAnnexes`, `getUnmatchedInvoices`, `insertContractInvoiceFromGDrive`, `getDocumentFullText`. |
| `lib/db.d.ts` | Added type declarations for all 6 new DB functions |
| `src/lib/db-imports.ts` | Re-exported all 6 new DB functions |
| `src/lib/contracts-imports.ts` | Re-exported `classifyGDriveDocument` |

## Key Decisions

1. **`classification_metadata TEXT` column added to `documents`** — stores the `annexParentReference` or `invoiceData` JSON from initial classification. Task 2's re-match loop can read this without re-calling Claude.

2. **`insertContractInvoiceFromGDrive` looks up `document.path` internally** — no `localPath` parameter needed; the function queries the documents table by `documentId` to get the path for `invoice_file_path`.

3. **`findMatchingContract` scoring** — integer-based scoring (1 point per match). Threshold is 0.5, so effectively score >= 1. Ambiguity rule: if top two scores tie, returns `null`.

4. **`getUnmatchedAnnexes` and `getUnmatchedInvoices`** return `classification_metadata` column for re-match loop use in Task 2.

## Build Status

`npm run build` passes with no TypeScript errors.
