## Task 1 Complete -- Invoice management (DB, API, UI)

### Files Modified
- `lib/paths.js` (added `INVOICES_DIR` export, added directory creation in `ensureDirectories()`)
- `lib/paths.d.ts` (added `INVOICES_DIR` type declaration)
- `src/lib/paths-imports.ts` (added `INVOICES_DIR` re-export)
- `lib/db.js` (added `contract_invoices` CREATE TABLE + 2 indexes in `initDb()`; added 6 functions: `insertInvoice`, `getInvoicesByContractId`, `getInvoiceById`, `updateInvoice`, `deleteInvoice`, `getContractInvoiceSummary`)
- `lib/db.d.ts` (added type declarations for all 6 new functions)
- `src/lib/db-imports.ts` (added re-exports for all 6 new functions)
- `src/lib/types.ts` (added `Invoice` and `InvoiceSummary` interfaces)
- `src/lib/constants.ts` (added `INVOICE_CURRENCIES`, `INVOICE_FILE_EXTENSIONS`, `INVOICE_STATUS_COLORS`)
- `src/components/contracts/contract-card.tsx` (imported `InvoiceSection`, added it below the two-column grid in expanded view)

### Files Created
- `src/app/api/contracts/[id]/invoices/route.ts` -- GET (list invoices + summary) and POST (create invoice with file uploads)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/route.ts` -- PATCH (update fields) and DELETE (remove record + files)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` -- GET (serve invoice file with path traversal guard)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` -- GET (serve payment confirmation file)
- `src/components/contracts/invoice-section.tsx` -- Self-contained invoice list/summary component
- `src/components/contracts/add-invoice-dialog.tsx` -- Dialog for creating/editing invoices

### Key Design Decisions
- Invoice files stored in `DOCUMENTS_DIR/invoices/{contractId}/` with timestamp-prefixed sanitized filenames
- PATCH uses JSON body (not multipart) -- file uploads only on initial creation via POST
- `getContractInvoiceSummary` uses SQL aggregation for totalInvoiced/totalPaid/overdueCount
- Overdue detection: `date_of_payment < date('now') AND is_paid = 0` in both DB summary and UI badge logic
- All routes follow established patterns: `runtime = "nodejs"`, `ensureDb()`, `logAction()` after mutations, path traversal prevention on download routes
- InvoiceSection placed below the two-column metadata/status grid in the expanded contract card, spanning full width with a border-top separator

### INTEGRATION Notes for Task 2
- Task 2 should add `ContractDocumentsSection` below the `InvoiceSection` in `contract-card.tsx`
- The expanded card structure is: two-column grid (metadata + status), then full-width InvoiceSection, then Task 2 should add another full-width section
- The `INVOICES_DIR` pattern in `lib/paths.js` can be followed for `CONTRACT_ATTACHMENTS_DIR`

### Exports
- DB functions: `insertInvoice`, `getInvoicesByContractId`, `getInvoiceById`, `updateInvoice`, `deleteInvoice`, `getContractInvoiceSummary`
- Types: `Invoice`, `InvoiceSummary`
- Constants: `INVOICE_CURRENCIES`, `INVOICE_FILE_EXTENSIONS`, `INVOICE_STATUS_COLORS`
- Components: `InvoiceSection`, `AddInvoiceDialog`

### Build Status
- `npm run build` passes with no TypeScript errors
- All 4 API routes visible in build output
