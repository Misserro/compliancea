# Task 1 Implementation Plan: Invoice Management — DB, API, and UI

## Overview

Add full invoice tracking to the contracts feature across all layers: database schema, API routes, TypeScript types/constants, and UI components.

## Files to Modify

### 1. `lib/paths.js` — Add INVOICES_DIR
- Export `INVOICES_DIR = path.join(DOCUMENTS_DIR, "invoices")`
- Add directory creation in `ensureDirectories()`: `if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });`

### 2. `src/lib/paths-imports.ts` — Re-export INVOICES_DIR
- Add `INVOICES_DIR` to the re-export list

### 3. `lib/db.js` — Add contract_invoices table + 5 functions
- In `initDb()`, after the product_features table creation (before `saveDb()`):
  - `CREATE TABLE IF NOT EXISTS contract_invoices (...)` with columns per task spec
  - `CREATE INDEX IF NOT EXISTS idx_invoices_contract ON contract_invoices(contract_id)`
  - `CREATE INDEX IF NOT EXISTS idx_invoices_payment_date ON contract_invoices(date_of_payment)`
- Add 5 new exported functions at the end of the contract section:
  - `insertInvoice({ contractId, amount, currency, description, dateOfIssue, dateOfPayment, isPaid, invoiceFilePath, paymentConfirmationPath })` — INSERT, return `lastInsertRowId`
  - `getInvoicesByContractId(contractId)` — SELECT * ORDER BY date_of_issue DESC
  - `getInvoiceById(id)` — get() single invoice
  - `updateInvoice(id, updates)` — allowlist pattern with fields: amount, currency, description, date_of_issue, date_of_payment, is_paid, invoice_file_path, payment_confirmation_path. Always set updated_at.
  - `deleteInvoice(id)` — DELETE by id, return the deleted row data (get before delete for file cleanup info)
  - `getContractInvoiceSummary(contractId)` — Returns `{ totalInvoiced, totalPaid, overdueCount }` via SUM aggregation

### 4. `lib/db.d.ts` — Add type declarations
- Add declarations for all 6 new functions (insertInvoice, getInvoicesByContractId, getInvoiceById, updateInvoice, deleteInvoice, getContractInvoiceSummary)

### 5. `src/lib/db-imports.ts` — Re-export new functions
- Add all 6 new function names to the re-export block

### 6. `src/lib/types.ts` — Add Invoice and InvoiceSummary interfaces
- `Invoice`: id, contract_id, amount, currency, description, date_of_issue, date_of_payment, is_paid, invoice_file_path, payment_confirmation_path, created_at, updated_at
- `InvoiceSummary`: totalInvoiced, totalPaid, overdueCount

### 7. `src/lib/constants.ts` — Add invoice constants
- `INVOICE_CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CHF'] as const`
- `INVOICE_FILE_EXTENSIONS = ['.pdf', '.docx', '.jpg', '.png'] as const`

## Files to Create

### 8. `src/app/api/contracts/[id]/invoices/route.ts` — GET + POST
- **GET**: `ensureDb()` -> parse/validate contract id -> `getInvoicesByContractId(id)` + `getContractInvoiceSummary(id)` -> return `{ invoices, summary }`
- **POST**: `ensureDb()` -> parse formData -> validate required fields (amount, currency) -> validate currency enum -> validate optional files (extension allowlist `.pdf/.docx/.jpg/.png`, max 10MB, sanitize filename) -> mkdir `INVOICES_DIR/{contractId}/` -> save files -> `insertInvoice(...)` -> `logAction("invoice", newId, "created")` -> return 201 with invoice

### 9. `src/app/api/contracts/[id]/invoices/[invoiceId]/route.ts` — PATCH + DELETE
- **PATCH**: `ensureDb()` -> parse ids -> parse JSON body -> allowlist fields -> `updateInvoice(id, updates)` -> `logAction("invoice", id, "updated")` -> re-fetch -> return invoice
- **DELETE**: `ensureDb()` -> parse ids -> get invoice (404 if not found) -> `deleteInvoice(id)` -> remove files from disk (non-critical try/catch) -> `logAction("invoice", id, "deleted")` -> return success

### 10. `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` — GET
- `ensureDb()` -> get invoice -> validate invoice_file_path exists -> path traversal guard (resolve + startsWith INVOICES_DIR) -> read file -> return with Content-Type and Content-Disposition

### 11. `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` — GET
- Same pattern as invoice-file but for `payment_confirmation_path`

### 12. `src/components/contracts/invoice-section.tsx` — InvoiceSection component
- "use client" component
- Props: `contractId: number`, `onUpdate?: () => void`
- State: invoices list, summary, loading, editingInvoice
- Fetches `GET /api/contracts/{id}/invoices` on mount
- Renders:
  - Summary row: "Total invoiced: {currency}{amount} | Total paid: {currency}{amount}" + overdue count badge
  - Invoice table: Date of Issue, Date of Payment, Amount, Status badge (Paid=green, Overdue=red, Pending=neutral), Files (download links), Actions (edit/delete)
  - Overdue logic: `date_of_payment < today && is_paid === 0`
  - "Add Invoice" button -> opens AddInvoiceDialog
  - Edit button -> opens AddInvoiceDialog in edit mode
  - Delete button -> confirm -> DELETE API call -> refresh
- Uses Badge, Button from ui components, Sonner toast for feedback

### 13. `src/components/contracts/add-invoice-dialog.tsx` — AddInvoiceDialog component
- "use client" component
- Props: `contractId: number`, `open: boolean`, `onOpenChange`, `onSaved`, `editInvoice?: Invoice | null`
- Dialog with form fields: Amount (number input), Currency (select from INVOICE_CURRENCIES), Description (textarea, optional), Date of Issue (date input), Date of Payment (date input), Invoice File (file input, optional), Payment Confirmation (file input, optional)
- Edit mode: pre-fills fields from editInvoice, uses PATCH instead of POST, no file re-upload required (but supported)
- On save: constructs FormData for POST (multipart) or JSON for PATCH, calls API, shows toast, calls onSaved callback

### 14. `src/components/contracts/contract-card.tsx` — Wire InvoiceSection
- Import InvoiceSection
- Add it below the right column (status strip + actions) inside the expanded view, spanning full width
- Pass `contractId={contract.id}` and `onUpdate={onContractUpdate}`

## Risks and Trade-offs

1. **Edit mode file handling**: PATCH uses JSON body (not multipart), so file re-upload in edit mode would require a separate mechanism. For simplicity, edit mode only updates text fields. Users can delete and re-create to change files. This matches the task spec: "no file re-upload required if files unchanged".

2. **Currency formatting**: The summary formats amounts with the contract's most common currency. Since invoices can have mixed currencies, the summary shows raw totals per currency or uses the first invoice's currency. Simplest approach: show totals as numbers without currency symbol if mixed currencies exist.

3. **logAction entity type**: Using "invoice" as entity_type. This is a new entity type not yet in the logging standard's allowed list, but the standard says "When adding a new action, follow the pattern" — this extends naturally.

## Success Criteria Mapping

| Criterion | Implementation |
|-----------|---------------|
| GET returns { invoices, summary } | route.ts GET handler |
| POST creates invoice + saves files, returns 201 | route.ts POST handler |
| PATCH marks invoice paid | [invoiceId]/route.ts PATCH handler |
| DELETE removes DB record + files | [invoiceId]/route.ts DELETE handler |
| File download returns PDF | invoice-file/route.ts + payment-confirmation/route.ts |
| Overdue badge in UI | invoice-section.tsx status badge logic |
| Summary row shows totals | invoice-section.tsx summary row |
| npm run build passes | All TypeScript types properly declared |
