# Task 3 Implementation Notes

## Files Changed

| File | Change |
|------|--------|
| `lib/db.js` | Modified `getAllDocuments` to add `is_unmatched` computed column via CASE/EXISTS subqueries. Added `d` table alias to `FROM documents`. `DOC_COLUMNS` constant unchanged. |
| `src/lib/types.ts` | Added `is_unmatched?: number` to `Document` interface. Added `document_id?: number \| null` to `Invoice` interface. |
| `src/components/contracts/contract-annexes-section.tsx` | **NEW** — Self-fetching component. Receives `contractId`, fetches from `GET /api/contracts/[id]/documents`, filters for `document_type === 'annex'`. Returns `null` if no annexes. |
| `src/components/contracts/contract-gdrive-invoices-section.tsx` | **NEW** — Self-fetching component. Receives `contractId`, fetches from `GET /api/contracts/[id]/invoices`, filters for `document_id != null`. Displays `description` as invoice identifier (Task 1 stores invoice number there). Returns `null` if no GDrive invoices. |
| `src/components/contracts/contract-card.tsx` | Imported and rendered `ContractAnnexesSection` and `ContractGDriveInvoicesSection` in the left column of the expanded view, after the download link. |
| `src/components/documents/document-badges.tsx` | Added always-visible amber badges for unmatched annexes (`doc.is_unmatched === 1 && doc.doc_type === 'annex'`) and unmatched invoices (`doc.is_unmatched === 1 && doc.doc_type === 'invoice'`), placed after the in_force pill. |
| `messages/en.json` | Added 3 keys to Contracts namespace (`annexes`, `linkedInvoices`, `due`) and 2 keys to Documents.badges namespace (`unmatchedAnnex`, `unmatchedInvoice`). |
| `messages/pl.json` | Added 3 keys to Contracts namespace (`annexes`, `linkedInvoices`, `due`) and 2 keys to Documents.badges namespace (`unmatchedAnnex`, `unmatchedInvoice`). |

## Key Decisions

1. **Self-fetching pattern (Option C):** New sections follow the existing `InvoiceSection` / `ContractDocumentsSection` architecture. Each component receives `contractId` and fetches from existing API endpoints. No changes to the contract detail API route or `contract-metadata-display.tsx`.

2. **No new DB functions or API routes:** Existing `GET /api/contracts/[id]/documents` and `GET /api/contracts/[id]/invoices` already return the needed data. Client-side filtering separates annexes and GDrive invoices.

3. **`is_unmatched` computed in SQL:** Added CASE expression with EXISTS subqueries only inside `getAllDocuments` — `DOC_COLUMNS` constant is untouched.

4. **Invoice number display:** `contract_invoices` has no `invoice_number` column. Task 1 stores invoice numbers in the `description` field. The UI displays `inv.description` as the invoice identifier.

## Build Status

`npm run build` passes with no TypeScript errors.
