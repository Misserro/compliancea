# Plan: Contracts Expansion — Invoice Management & Multi-Document Support

> **Execute:** `/uc:plan-execution 018`
> Created: 2026-03-17
> Status: Draft
> Source: Feature Mode

## Objective

Expand the Contracts tab with two new capabilities: (1) invoice tracking per contract — amounts, currencies, file attachments (invoice PDF + payment confirmation), overdue detection, and financial totals; (2) multi-document support per contract — attach amendments, addenda, and exhibits via upload or by linking existing library documents.

## Context

- **Architecture:** [Database Schema](../../technology/architecture/database-schema.md) — `contract_invoices` and `contract_documents` tables defined
- **Architecture:** [API Endpoints](../../technology/architecture/api-endpoints.md) — existing contract routes
- **Requirements:** [Features](../../product/requirements/features.md) — Invoice Management and Contract Documents sections
- **Prior plans:** [013 — Contracts Tab Redesign](../013-contracts-tab-redesign/) | [014 — Contract Manual Creation](../014-contract-manual-creation/) | [016 — Obligation Fields Redesign](../016-obligation-fields-redesign/)

## Tech Stack

- Next.js 15 (App Router), TypeScript, React 19
- shadcn/ui (Radix UI + CVA), Tailwind v4, Lucide icons, Sonner toasts
- sql.js (WASM SQLite, in-memory, filesystem persistence)
- Node.js fs module (file storage in DOCUMENTS_DIR/invoices/ and DOCUMENTS_DIR/contract-attachments/)

## Scope

### In Scope

- New `contract_invoices` table: amount (REAL), currency (TEXT), description, date_of_issue, date_of_payment, is_paid, invoice_file_path, payment_confirmation_path
- Invoice CRUD API routes under `/api/contracts/[id]/invoices/`
- Invoice file upload/download for invoice PDF and payment confirmation (stored in `DOCUMENTS_DIR/invoices/`)
- Overdue detection: `date_of_payment < today AND is_paid = 0` → visual warning badge
- Financial summary: total invoiced / total paid per contract (numeric SUM)
- Invoice UI section within expanded contract card: list view, add/edit dialog, summary row
- New `contract_documents` table: supports linking an existing library document OR uploading a new lightweight attachment
- Contract documents API routes under `/api/contracts/[id]/documents/`
- Contract attachment file upload/download (stored in `DOCUMENTS_DIR/contract-attachments/`, NOT in main Documents library)
- Contract documents UI section within expanded contract card: list with type badges, add dialog with "Upload new" / "Link existing" tabs
- Primary contract document download button (surfacing existing `/api/documents/[id]/download` endpoint) on contract card
- Ensure company, counterparty, and key dates are prominently shown in expanded card view

### Out of Scope

- Invoice generation / PDF auto-generation (invoices are uploaded, not created by the system)
- Invoice payments appearing as obligations or tasks
- Multi-currency conversion or exchange rates
- Email notifications for overdue invoices
- Invoice numbering schemes or sequential invoice IDs
- Bulk invoice import
- Contract attachments appearing in the main Documents library tab or being processed with embeddings/AI
- Access control per invoice or document (auth is middleware-wide)

## Success Criteria

- [ ] A user can open a contract card, click "Add Invoice", fill in amount/currency/dates, upload an invoice PDF and a payment confirmation file, and save — the invoice appears in the list
- [ ] An invoice with a past payment date and `is_paid = false` shows an overdue badge
- [ ] The contract card header area shows "Total invoiced: X / Total paid: Y" derived from numeric aggregation
- [ ] A user can mark an invoice as paid — the overdue badge disappears
- [ ] A user can upload a new contract attachment (PDF/DOCX) directly on the contract card — it appears in the "Documents" section without appearing in the main Documents tab
- [ ] A user can link an existing library document to a contract — it appears in the contract's Documents section with the selected type label
- [ ] Each attached document has a download button that serves the file
- [ ] A user can delete an invoice or a contract document attachment
- [ ] The primary contract PDF has a visible download button on the expanded card
- [ ] `npm run build` passes with no TypeScript errors

## Task List

> Every task gets the full pipeline: planning -> impl -> review -> test.
> Tasks must deliver end-to-end testable user value — from database through backend to API/UI. A tester must be able to verify each task by simulating user behavior, not just checking technical artifacts.

---

### Task 1: Invoice management — DB, API, and UI

**Description:**

Add full invoice tracking to the contracts feature, covering all layers from the database to the UI.

**Database (lib/db.js):**
- Add `contract_invoices` table via `ALTER TABLE`-style migration (use `CREATE TABLE IF NOT EXISTS` since this is a new table, not an ALTER): columns `id INTEGER PRIMARY KEY AUTOINCREMENT`, `contract_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE`, `amount REAL NOT NULL`, `currency TEXT NOT NULL DEFAULT 'EUR'`, `description TEXT`, `date_of_issue DATE`, `date_of_payment DATE`, `is_paid INTEGER DEFAULT 0`, `invoice_file_path TEXT`, `payment_confirmation_path TEXT`, `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- Add indexes: `idx_invoices_contract` on `(contract_id)`, `idx_invoices_payment_date` on `(date_of_payment)`
- Add DB functions: `insertInvoice(params)`, `getInvoicesByContractId(contractId)`, `updateInvoice(id, fields)`, `deleteInvoice(id)`, `getContractInvoiceSummary(contractId)` — returns `{ totalInvoiced: number, totalPaid: number, overdueCount: number }`
- Ensure `lib/paths.js` exports `INVOICES_DIR` (= `DOCUMENTS_DIR/invoices`) and the dir is created via `ensureDirectories()`
- Export new functions via `lib/db.d.ts` and `src/lib/db-imports.ts`

**API routes (all under src/app/api/contracts/[id]/invoices/):**
- `route.ts`: `GET` — list all invoices for a contract (calls `getInvoicesByContractId` + `getContractInvoiceSummary`); `POST` — create invoice with optional invoice file and payment confirmation file upload (multipart/form-data with fields: `amount`, `currency`, `description`, `date_of_issue`, `date_of_payment`, `invoice_file?`, `payment_confirmation_file?`)
- `[invoiceId]/route.ts`: `PATCH` — update invoice fields including `is_paid` toggle; `DELETE` — delete invoice + remove files from disk
- `[invoiceId]/invoice-file/route.ts`: `GET` — serve invoice PDF file (reuse path-traversal guard pattern from documents download route)
- `[invoiceId]/payment-confirmation/route.ts`: `GET` — serve payment confirmation file

All routes: `export const runtime = "nodejs"`, call `ensureDb()`, call `logAction()` after mutations, return `{ error }` on failure with appropriate status codes.

File validation for uploads: allowlist `.pdf`, `.docx`, `.jpg`, `.png`; max 10MB; sanitise filename; store in `INVOICES_DIR/{contractId}/`.

**TypeScript types (src/lib/types.ts):**
- Add `Invoice` interface: `{ id, contract_id, amount, currency, description, date_of_issue, date_of_payment, is_paid, invoice_file_path, payment_confirmation_path, created_at, updated_at }`
- Add `InvoiceSummary` interface: `{ totalInvoiced, totalPaid, overdueCount }`

**Constants (src/lib/constants.ts):**
- Add `INVOICE_CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CHF']` or similar
- Add `INVOICE_FILE_EXTENSIONS = ['.pdf', '.docx', '.jpg', '.png']`

**UI (src/components/contracts/):**
- Create `invoice-section.tsx` — a self-contained component rendered inside the expanded contract card. Shows:
  - Summary row: "Total invoiced: €X,XXX.XX | Total paid: €X,XXX.XX" (format each amount with currency)
  - Invoice list table: columns = Date of Issue, Date of Payment, Amount, Status (badge: Paid / Overdue / Pending), Files (download links for invoice + payment confirmation), Actions (edit / delete)
  - Overdue badge: red badge when `date_of_payment < today AND is_paid === 0`
  - "Add Invoice" button → opens `AddInvoiceDialog`
- Create `add-invoice-dialog.tsx` — Radix Dialog with form fields: Amount (numeric input), Currency (select from INVOICE_CURRENCIES), Description (optional text), Date of Issue (date input), Date of Payment (date input), Invoice File (file input, optional), Payment Confirmation (file input, optional). On save: POST to `/api/contracts/[id]/invoices` with multipart form data. Show Sonner toast on success/error. After save: re-fetch invoice list.
- Edit flow: re-use dialog in edit mode (pre-fill fields, PATCH request, no file re-upload required if files unchanged)
- Wire `InvoiceSection` into `src/components/contracts/contract-card.tsx` expanded view (add as a new collapsible section below obligations summary, above or replacing the bottom of the expanded area)
- Also ensure the primary contract document download button is visible on the card (using existing `/api/documents/[id]/download` endpoint — add if not already present)

**Files to create/modify:**
- `lib/db.js` (modify — add contract_invoices table + functions)
- `lib/db.d.ts` (modify — add type declarations)
- `lib/paths.js` (modify — add INVOICES_DIR)
- `src/lib/db-imports.ts` (modify — re-export new functions)
- `src/lib/types.ts` (modify — add Invoice, InvoiceSummary)
- `src/lib/constants.ts` (modify — add currency constants)
- `src/app/api/contracts/[id]/invoices/route.ts` (create)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/route.ts` (create)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` (create)
- `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` (create)
- `src/components/contracts/invoice-section.tsx` (create)
- `src/components/contracts/add-invoice-dialog.tsx` (create)
- `src/components/contracts/contract-card.tsx` (modify — add InvoiceSection, ensure download button)

**Patterns:**
- `documentation/technology/standards/rest-api.md` — route structure, ensureDb(), allowlist PATCH fields, file upload validation, logAction() after mutations, error response shape
- `documentation/technology/standards/database.md` — CREATE TABLE IF NOT EXISTS pattern, parameterized queries, saveDb(), import bridge pattern (lib/db.js → src/lib/db-imports.ts)
- `documentation/technology/standards/security.md` — file upload allowlist, size limit, filename sanitization, path traversal prevention (path.resolve + startsWith check on download routes)
- `documentation/technology/standards/error-handling.md` — `err instanceof Error ? err.message : "Unknown error"`, HTTP status codes, graceful degradation (non-critical file ops in try/catch)
- `documentation/technology/standards/logging.md` — logAction() entity type ("invoice"), semantic action names (created, updated, deleted)
- `documentation/technology/standards/design-system.md` — CVA badge variants for overdue/paid/pending status, cn() utility, Radix Dialog pattern, Sonner toasts
- `documentation/technology/standards/module-separation.md` — lib/ (CJS) ↔ src/lib/*-imports.ts (TS bridge) split; all DB logic in lib/db.js only

**Success criteria:**
- `GET /api/contracts/[id]/invoices` returns `{ invoices: Invoice[], summary: InvoiceSummary }`
- `POST /api/contracts/[id]/invoices` with valid multipart body creates invoice, saves files to disk, returns 201 with invoice record
- `PATCH /api/contracts/[id]/invoices/[invoiceId]` with `{ is_paid: 1 }` marks invoice paid, returns updated invoice
- `DELETE /api/contracts/[id]/invoices/[invoiceId]` removes DB record and associated files
- Invoice file download (`GET .../invoice-file`) returns the PDF with correct Content-Type and Content-Disposition
- A new invoice with past `date_of_payment` shows overdue badge in the UI
- The summary row shows correct numeric totals (invoiced vs paid)
- `npm run build` passes

**Dependencies:** None

---

### Task 2: Multi-document support — DB, API, and UI

**Description:**

Add support for attaching multiple documents per contract (amendments, addenda, exhibits, etc.), with two flows: upload a new file directly, or link an existing document from the library.

**Database (lib/db.js):**
- Add `contract_documents` table via `CREATE TABLE IF NOT EXISTS`: columns `id INTEGER PRIMARY KEY AUTOINCREMENT`, `contract_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE`, `document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL` (nullable), `file_path TEXT` (nullable), `file_name TEXT`, `document_type TEXT DEFAULT 'other'`, `label TEXT`, `added_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- Add index: `idx_contract_docs_contract` on `(contract_id)`
- Add DB functions: `addContractDocumentUpload(params)` (for new file uploads), `linkContractDocument(params)` (for linking existing library docs), `getContractDocuments(contractId)`, `deleteContractDocument(id)` — also removes file from disk if `file_path` is set
- Ensure `lib/paths.js` exports `CONTRACT_ATTACHMENTS_DIR` (= `DOCUMENTS_DIR/contract-attachments`) and the dir is created via `ensureDirectories()`
- Export new functions via `lib/db.d.ts` and `src/lib/db-imports.ts`

**API routes (all under src/app/api/contracts/[id]/documents/):**
- `route.ts`: `GET` — list all contract documents (calls `getContractDocuments`); `POST` — two modes determined by form field `mode`:
  - `mode=upload`: multipart/form-data with `file`, `document_type`, `label?` → save file to `CONTRACT_ATTACHMENTS_DIR/{contractId}/`, create record
  - `mode=link`: JSON body with `document_id`, `document_type`, `label?` → validate document exists, create link record
- `[contractDocId]/route.ts`: `DELETE` — remove record + file from disk if applicable
- `[contractDocId]/download/route.ts`: `GET` — serve file for uploaded attachments OR redirect to existing `/api/documents/{document_id}/download` for linked library docs

All routes: standard patterns (`runtime = "nodejs"`, `ensureDb()`, `logAction()`, `{ error }` responses).

File validation for uploads: allowlist `.pdf`, `.docx`; max 10MB; sanitise filename.

**TypeScript types (src/lib/types.ts):**
- Add `ContractDocument` interface: `{ id, contract_id, document_id, file_path, file_name, document_type, label, added_at }`

**Constants (src/lib/constants.ts):**
- Add `CONTRACT_DOCUMENT_TYPES = ['amendment', 'addendum', 'exhibit', 'other']` (with display labels)

**UI (src/components/contracts/):**
- Create `contract-documents-section.tsx` — component for the contract card expanded view. Shows:
  - Document list: rows with type badge (amendment / addendum / exhibit / other), filename or document name, date added, download button, delete button
  - "Add Document" button → opens `AddContractDocumentDialog`
- Create `add-contract-document-dialog.tsx` — Radix Dialog with two tabs:
  - **"Upload new"** tab: file input (PDF/DOCX), document type selector, optional label. On save: POST with `mode=upload` multipart.
  - **"Link existing"** tab: fetches `/api/documents` (or `/api/contracts` to get full list), shows searchable list of library documents, document type selector, optional label. On save: POST with `mode=link` JSON.
  - Show Sonner toast on success/error. After save: re-fetch documents list.
- Wire `ContractDocumentsSection` into `src/components/contracts/contract-card.tsx` expanded view (add after `InvoiceSection` — requires Task 1 to have added `InvoiceSection` first)

**Files to create/modify:**
- `lib/db.js` (modify — add contract_documents table + functions)
- `lib/db.d.ts` (modify — add type declarations)
- `lib/paths.js` (modify — add CONTRACT_ATTACHMENTS_DIR)
- `src/lib/db-imports.ts` (modify — re-export new functions)
- `src/lib/types.ts` (modify — add ContractDocument)
- `src/lib/constants.ts` (modify — add CONTRACT_DOCUMENT_TYPES)
- `src/app/api/contracts/[id]/documents/route.ts` (create)
- `src/app/api/contracts/[id]/documents/[contractDocId]/route.ts` (create)
- `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` (create)
- `src/components/contracts/contract-documents-section.tsx` (create)
- `src/components/contracts/add-contract-document-dialog.tsx` (create)
- `src/components/contracts/contract-card.tsx` (modify — add ContractDocumentsSection after InvoiceSection)

**Patterns:**
- `documentation/technology/standards/rest-api.md` — dual-mode POST (upload vs link), allowlist validation, ensureDb(), logAction(), error response shape
- `documentation/technology/standards/database.md` — CREATE TABLE IF NOT EXISTS, parameterized queries, saveDb(), import bridge
- `documentation/technology/standards/security.md` — file upload allowlist (.pdf/.docx only), 10MB limit, filename sanitisation, path traversal guard on download
- `documentation/technology/standards/error-handling.md` — graceful degradation, status codes (404 if contract not found, 400 if neither document_id nor file provided)
- `documentation/technology/standards/logging.md` — logAction() entity type ("contract_document"), action names (linked, uploaded, deleted)
- `documentation/technology/standards/design-system.md` — Badge variants for document types, two-tab dialog pattern using Radix Tabs, cn() utility

**Success criteria:**
- `GET /api/contracts/[id]/documents` returns `{ documents: ContractDocument[] }`
- `POST /api/contracts/[id]/documents` with `mode=upload` + valid PDF saves file to `CONTRACT_ATTACHMENTS_DIR`, creates DB record, returns 201
- `POST /api/contracts/[id]/documents` with `mode=link` + valid `document_id` creates link record, returns 201
- `DELETE /api/contracts/[id]/documents/[contractDocId]` removes record; if upload mode, also removes file from disk
- Download endpoint serves file for uploaded attachments and proxies to `/api/documents/{id}/download` for linked library docs
- A newly uploaded attachment does NOT appear in the main Documents tab (`GET /api/documents` does not list it)
- The "Link existing" tab in the dialog shows and lets the user search library documents
- `npm run build` passes

**Dependencies:** Task 1 (for the contract-card.tsx structure — `ContractDocumentsSection` is wired below `InvoiceSection`)

---

## Documentation Changes

Documentation updated during Stage 4 (already on disk):

| File | Action | Summary |
|------|--------|---------|
| `documentation/product/requirements/features.md` | Updated | Added Invoice Management and Contract Documents sections under Contract Management |
| `documentation/technology/architecture/database-schema.md` | Updated | Added `contract_invoices` and `contract_documents` table definitions |

Additional documentation gaps identified (not yet addressed):

| File | Needed Change |
|------|---------------|
| `documentation/technology/architecture/api-endpoints.md` | Add the new contract invoice and contract document API routes |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `contract-card.tsx` merge conflict between Task 1 and Task 2 | High (if run in parallel) | Medium | Task 2 explicitly depends on Task 1; run sequentially. Task 1 adds InvoiceSection + establishes the expanded card section structure; Task 2 appends ContractDocumentsSection below it |
| Invoice file storage fills Railway /data volume | Low | High | Invoice files share the same `/data` volume as compliance docs. Monitor volume usage. Future mitigation: move to object storage |
| `lib/db.js` grows too large to maintain | Medium | Low | Both new tables are additive. No existing functions modified. The CJS module pattern supports this growth |
| Numeric amount precision for large values (e.g., €1,000,000.00) | Low | Low | REAL (IEEE 754 double) has ~15 significant digits, sufficient for typical invoice amounts. Currency stored separately as text |
| Linked document deleted from library while still referenced by contract | Medium | Low | Schema uses `ON DELETE SET NULL` on `document_id` — attachment record persists, download falls back gracefully (404 with clear message) |
| `mode=upload` vs `mode=link` dual-mode POST validation | Medium | Medium | Route must validate: if `mode=upload`, require file; if `mode=link`, require `document_id` and verify it exists. Add explicit 400 with descriptive message for each invalid combination |
