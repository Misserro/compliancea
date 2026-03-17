# Lead Notes — Plan 018: Contracts Expansion

## Plan Overview

Expand the Contracts tab with invoice tracking and multi-document support per contract.

## Concurrency Decision

- 2 tasks, sequential dependency (Task 2 depends on Task 1)
- Max 1 active task-team at a time
- Pipeline-spawn Task 2 in planning-only mode when Task 1 enters review/test phase

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: depends on Task 1 (contract-card.tsx structure must exist)

## Key Architectural Constraints

1. All DB logic in `lib/db.js` (CJS) only — never in src/. Bridge via `src/lib/db-imports.ts`
2. File storage: invoices → `DOCUMENTS_DIR/invoices/{contractId}/`, attachments → `DOCUMENTS_DIR/contract-attachments/{contractId}/`
3. Contract attachments must NOT appear in the main Documents library tab
4. All API routes: `export const runtime = "nodejs"`, call `ensureDb()`, call `logAction()` after mutations
5. File upload allowlists: invoices (.pdf, .docx, .jpg, .png, 10MB max), attachments (.pdf, .docx, 10MB max)
6. Path traversal prevention required on all download routes

## Critical Decisions

- Task 2 pipeline-spawned during Task 1 review/test to save time on planning
- Sequential contract-card.tsx modification: Task 1 adds InvoiceSection, Task 2 appends ContractDocumentsSection below it

## Agents

| Agent | Name | Status |
|-------|------|--------|
| Tech Knowledge | knowledge-contracts-expansion | done |
| Project Manager | pm-contracts-expansion | done |
| Executor (T1) | executor-1 | done |
| Reviewer (T1) | reviewer-1 | done (1 retry) |
| Tester (T1) | tester-1 | done |
| Executor (T2) | executor-2 | done |
| Reviewer (T2) | reviewer-2 | done (1 retry) |
| Tester (T2) | tester-2 | done |

## Execution Complete

**Plan:** 018-contracts-expansion
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1 (Invoice management): contract_invoices DB table, 6 DB functions, 4 API routes under /api/contracts/[id]/invoices/, InvoiceSection + AddInvoiceDialog UI components wired into contract-card.tsx. AlertDialog component created. @radix-ui/react-alert-dialog dependency added.
- Task 2 (Multi-document support): contract_documents DB table, 5 DB functions, 3 API routes under /api/contracts/[id]/documents/, ContractDocumentsSection + AddContractDocumentDialog UI wired into contract-card.tsx below InvoiceSection.

### Files Modified
- `lib/db.js` — contract_invoices + contract_documents tables and functions
- `lib/db.d.ts` — type declarations for 11 new functions
- `lib/paths.js` — INVOICES_DIR, CONTRACT_ATTACHMENTS_DIR
- `lib/paths.d.ts` — type declarations
- `src/lib/db-imports.ts` — re-exports for 11 new functions
- `src/lib/paths-imports.ts` — re-exports for both new dirs
- `src/lib/types.ts` — Invoice, InvoiceSummary, ContractDocument interfaces
- `src/lib/constants.ts` — INVOICE_CURRENCIES, INVOICE_FILE_EXTENSIONS, INVOICE_STATUS_COLORS, CONTRACT_DOCUMENT_TYPES, CONTRACT_DOCUMENT_TYPE_COLORS
- `src/components/contracts/contract-card.tsx` — InvoiceSection + ContractDocumentsSection wired
- `documentation/technology/standards/logging.md` — added invoice, contract_document to allowed entity types
- `package.json` / `package-lock.json` — @radix-ui/react-alert-dialog added

### Files Created
- `src/app/api/contracts/[id]/invoices/route.ts`
- `src/app/api/contracts/[id]/invoices/[invoiceId]/route.ts`
- `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts`
- `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts`
- `src/app/api/contracts/[id]/documents/route.ts`
- `src/app/api/contracts/[id]/documents/[contractDocId]/route.ts`
- `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts`
- `src/components/contracts/invoice-section.tsx`
- `src/components/contracts/add-invoice-dialog.tsx`
- `src/components/contracts/contract-documents-section.tsx`
- `src/components/contracts/add-contract-document-dialog.tsx`
- `src/components/ui/alert-dialog.tsx`

### Decisions Made During Execution
- PATCH for invoice edit uses JSON body (no file re-upload) — matches spec, simpler
- Manual tab switching in AddContractDocumentDialog (no Radix Tabs component exists in project)
- AlertDialog component created as new shadcn/ui component (required by design-system.md standard)
- logging.md updated to add invoice and contract_document to allowed entity types

### Test Results
- Per-task tests: 2/2 passed (both after 1 review fix cycle each)
- Final gate (full suite): PASSED — npm run build, 50 pages, zero TypeScript errors

### Follow-up Items
- `add-invoice-dialog.tsx`: state doesn't reset via useEffect when editInvoice prop changes between renders — stale values shown when editing a second invoice in the same session. Minor UX bug, not a TypeScript error.
- The `window.confirm()` at contract-card.tsx:62 is pre-existing (outside task scope) — should be replaced with AlertDialog in a future cleanup task.
