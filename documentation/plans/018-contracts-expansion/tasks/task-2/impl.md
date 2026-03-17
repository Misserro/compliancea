## Task 2 Complete -- Multi-document support (DB, API, UI)

### Files Modified
- `lib/paths.js` (added `CONTRACT_ATTACHMENTS_DIR` export, added directory creation in `ensureDirectories()`)
- `lib/paths.d.ts` (added `CONTRACT_ATTACHMENTS_DIR` type declaration)
- `src/lib/paths-imports.ts` (added `CONTRACT_ATTACHMENTS_DIR` re-export)
- `lib/db.js` (added `contract_documents` CREATE TABLE + 1 index in `initDb()`; added 5 functions: `addContractDocumentUpload`, `linkContractDocument`, `getContractDocuments`, `getContractDocumentById`, `deleteContractDocument`)
- `lib/db.d.ts` (added type declarations for all 5 new functions)
- `src/lib/db-imports.ts` (added re-exports for all 5 new functions)
- `src/lib/types.ts` (added `ContractDocument` interface)
- `src/lib/constants.ts` (added `CONTRACT_DOCUMENT_TYPES`, `CONTRACT_DOCUMENT_TYPE_COLORS`)
- `src/components/contracts/contract-card.tsx` (imported `ContractDocumentsSection`, added it below `InvoiceSection` with border-t separator)

### Files Created
- `src/app/api/contracts/[id]/documents/route.ts` -- GET (list contract documents) and POST (dual-mode: upload or link)
- `src/app/api/contracts/[id]/documents/[contractDocId]/route.ts` -- DELETE (remove record + file from disk if applicable)
- `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` -- GET (serve uploaded file or redirect to library download for linked docs)
- `src/components/contracts/contract-documents-section.tsx` -- Self-contained document list component with AlertDialog delete confirmation
- `src/components/contracts/add-contract-document-dialog.tsx` -- Dialog with two tabs (Upload new / Link existing)

### Key Design Decisions
- Uploaded files stored in `DOCUMENTS_DIR/contract-attachments/{contractId}/` with `doc_{crypto.randomUUID()}_{safeName}` naming pattern
- POST is dual-mode via `mode` form field: `mode=upload` expects multipart file; `mode=link` expects `document_id`
- Download route for linked docs uses `NextResponse.redirect()` to the library's `/api/documents/{id}/download` endpoint
- File validation: `.pdf`/`.docx` only, MIME type check, 10MB max (more restrictive than invoices per task spec)
- Tab switching in dialog uses state-based approach with styled buttons (no Tabs UI component exists in the project)
- "Link existing" tab fetches `/api/documents` and provides client-side search filtering
- `linkContractDocument()` DB function looks up the document name from the documents table to populate `file_name`
- `getContractDocuments()` uses LEFT JOIN on documents to get `linked_document_name` for display
- `contract_documents.document_id` uses `ON DELETE SET NULL` so linked records persist if library doc is deleted
- All routes follow established patterns: `runtime = "nodejs"`, `ensureDb()`, `logAction()` after mutations, path traversal prevention on download routes
- AlertDialog used for delete confirmation (same pattern as invoice-section.tsx)
- Entity type for logging: `"contract_document"` (needs to be added to logging standard's allowed entity types)

### INTEGRATION Notes
- The `ContractDocumentsSection` is wired below `InvoiceSection` in `contract-card.tsx`
- Contract documents are completely separate from the main Documents library -- they live in `contract_documents` table, not `documents`
- Uploaded attachments do NOT appear in `GET /api/documents` since they are stored in a separate table/directory

### Exports
- DB functions: `addContractDocumentUpload`, `linkContractDocument`, `getContractDocuments`, `getContractDocumentById`, `deleteContractDocument`
- Types: `ContractDocument`
- Constants: `CONTRACT_DOCUMENT_TYPES`, `CONTRACT_DOCUMENT_TYPE_COLORS`
- Components: `ContractDocumentsSection`, `AddContractDocumentDialog`
