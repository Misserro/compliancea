# Task 1 Plan: Classification Engine and DB Infrastructure

## Overview

Add `classifyGDriveDocument` to `lib/contracts.js`, add the `document_id` migration and new DB helpers to `lib/db.js`, and re-export from `src/lib/db-imports.ts`.

## Implementation Steps

### 1. `lib/contracts.js` — Add `classifyGDriveDocument(text, apiKey?)`

- Follow the same pattern as `extractContractTerms`: create Anthropic client, truncate text to 6000 words, single Claude call, parse JSON response, return structured result with `tokenUsage`.
- System prompt instructs Claude to classify as `contract | annex | invoice | other` and extract `annexParentReference` (for annexes) and `invoiceData` (for invoices).
- Classification indicators:
  - **Annex:** "Annex", "Zalacznik", "Addendum", "Amendment", "Exhibit", "Schedule", references to parent contract
  - **Invoice:** "Invoice", "Faktura", "VAT", invoice number patterns, total amount, payment due date
  - **Contract:** parties, effective/expiry dates, obligation language, governing law
  - **Other:** everything else
- Default to `'contract'` when uncertain (fail-safe).
- Return shape:
  ```js
  {
    classification: 'contract' | 'annex' | 'invoice' | 'other',
    annexParentReference: { contractTitle, parties, contractNumber } | null,
    invoiceData: { vendorName, contractReference, invoiceNumber, amount, currency, issueDate, dueDate } | null,
    tokenUsage: { input, output, total, model }
  }
  ```
- On parse error: return `{ classification: 'contract', ... }` (fail-safe).

### 2. `lib/db.js` — Migration: `document_id` on `contract_invoices`

- Add after the last migration block (after token_usage cache columns, ~line 841):
  ```js
  try { db.run(`ALTER TABLE contract_invoices ADD COLUMN document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL`); } catch (e) {}
  ```
- Follow the existing `try/catch` pattern used for all ALTER TABLE migrations.

### 3. `lib/db.js` — Add `findMatchingContract(orgId, { parties, contractRef, vendorName })`

- Query: `SELECT id, suggested_name, contracting_company, contracting_vendor FROM documents WHERE doc_type IN ('contract', 'agreement') AND org_id = ? AND (status IS NULL OR status != 'terminated')`
- Scoring:
  - For each contract, compute score based on:
    - Party name overlap: case-insensitive includes against `contracting_company` and `contracting_vendor` (0.4 per match)
    - Contract reference substring match against `suggested_name` (0.3)
    - Vendor name match against `contracting_vendor` or `contracting_company` (0.3)
  - Max score = 1.0
- Return `{ contractId, confidence }` if best score >= 0.5, else `null`.
- If multiple contracts share the top score, return `null` (ambiguity rule).

### 4. `lib/db.js` — DB Helpers

All use the existing `run`, `get`, `query` helpers.

- **`insertContractDocument(contractId, documentId, documentType, label)`** — INSERT into `contract_documents` with `document_id` set. Look up `file_name` from documents table (same pattern as `linkContractDocument`).
- **`getUnmatchedAnnexes(orgId)`** — SELECT documents with `doc_type='annex'` and no matching `contract_documents` row.
- **`getUnmatchedInvoices(orgId)`** — SELECT documents with `doc_type='invoice'` and no matching `contract_invoices` row.
- **`insertContractInvoiceFromGDrive(contractId, documentId, localPath, invoiceData)`** — INSERT into `contract_invoices` with `document_id`, `invoice_file_path = localPath`, and financial fields from `invoiceData`.
- **`getDocumentFullText(docId)`** — SELECT `full_text` FROM documents WHERE id = ?.

### 5. `src/lib/db-imports.ts` — Re-export new helpers

Add to the export list:
- `findMatchingContract`
- `insertContractDocument`
- `getUnmatchedAnnexes`
- `getUnmatchedInvoices`
- `insertContractInvoiceFromGDrive`
- `getDocumentFullText`

### 6. `updateDocumentMetadata` — allowedFields

The `updateDocumentMetadata` function's `allowedFields` already includes `doc_type` and `processed`, so no change needed for setting `doc_type = 'annex' | 'invoice' | 'other'`.

## Files Changed

- `lib/contracts.js` — add `classifyGDriveDocument`
- `lib/db.js` — migration + `findMatchingContract` + 5 helpers
- `src/lib/db-imports.ts` — re-exports

## Risks

- `findMatchingContract` scoring is heuristic; thresholds may need tuning in practice.
- Classification prompt must be bilingual (EN/PL) since documents may be in Polish.
