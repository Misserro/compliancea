# Task 2 Implementation Plan: Multi-Document Support (DB, API, UI)

## Overview

Add support for attaching multiple documents per contract via upload or linking existing library documents. Follows the exact patterns established by Task 1 (invoice management).

## Files to Modify

### 1. `lib/db.js` — Add contract_documents table + 4 functions

**In `initDb()` — insert BEFORE `saveDb()` call (after contract_invoices table creation at ~line 420):**

```sql
CREATE TABLE IF NOT EXISTS contract_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  file_path TEXT,
  file_name TEXT,
  document_type TEXT DEFAULT 'other',
  label TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
```sql
CREATE INDEX IF NOT EXISTS idx_contract_docs_contract ON contract_documents(contract_id)
```

**New exported functions (add after `getContractInvoiceSummary`, before user auth section ~line 1694):**

- `addContractDocumentUpload({ contractId, filePath, fileName, documentType, label })` — INSERT, return `lastInsertRowId`
- `linkContractDocument({ contractId, documentId, documentType, label })` — INSERT with `document_id`, look up `file_name` from documents table, return `lastInsertRowId`
- `getContractDocuments(contractId)` — SELECT with LEFT JOIN on documents to get linked doc name, ORDER BY `added_at DESC`
- `deleteContractDocument(id)` — DELETE, return the record before deletion (so caller can clean up file)
- `getContractDocumentById(id)` — SELECT single record (needed by delete/download routes)

### 2. `lib/db.d.ts` — Add type declarations

Add 5 new function declarations following the existing `(...args: any[]): any` pattern.

### 3. `src/lib/db-imports.ts` — Add re-exports

Add the 5 new function names to the export list.

### 4. `lib/paths.js` — Add CONTRACT_ATTACHMENTS_DIR

- Add `export const CONTRACT_ATTACHMENTS_DIR = path.join(DOCUMENTS_DIR, "contract-attachments");`
- Add directory creation in `ensureDirectories()`

### 5. `lib/paths.d.ts` — Add type declaration

Add `export const CONTRACT_ATTACHMENTS_DIR: any;`

### 6. `src/lib/paths-imports.ts` — Add re-export

Add `CONTRACT_ATTACHMENTS_DIR` to the export list.

### 7. `src/lib/types.ts` — Add ContractDocument interface

```typescript
export interface ContractDocument {
  id: number;
  contract_id: number;
  document_id: number | null;
  file_path: string | null;
  file_name: string | null;
  document_type: string;
  label: string | null;
  added_at: string;
  linked_document_name?: string;  // from JOIN
}
```

### 8. `src/lib/constants.ts` — Add CONTRACT_DOCUMENT_TYPES

```typescript
export const CONTRACT_DOCUMENT_TYPES = [
  { value: "amendment", label: "Amendment" },
  { value: "addendum", label: "Addendum" },
  { value: "exhibit", label: "Exhibit" },
  { value: "other", label: "Other" },
] as const;

export const CONTRACT_DOCUMENT_TYPE_COLORS: Record<string, string> = {
  amendment: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  addendum: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  exhibit: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  other: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
};
```

## Files to Create

### 9. `src/app/api/contracts/[id]/documents/route.ts` — GET + POST

**GET:** List contract documents. Validates contract exists, calls `getContractDocuments(contractId)`, returns `{ documents }`.

**POST:** Dual-mode. Reads `mode` from form data.
- `mode=upload`: multipart with `file`, `document_type`, `label`. Validates extension (.pdf/.docx), MIME type, 10MB size. Uses `crypto.randomUUID()` for filename. Saves to `CONTRACT_ATTACHMENTS_DIR/{contractId}/`. Calls `addContractDocumentUpload()`.
- `mode=link`: reads `document_id`, `document_type`, `label` from form data fields. Validates document exists via `getDocumentById()`. Calls `linkContractDocument()`.
- Both modes: `logAction("contract_document", newId, "created", { contractId, mode })`, return 201.

### 10. `src/app/api/contracts/[id]/documents/[contractDocId]/route.ts` — DELETE

Validates IDs, checks record exists, calls `deleteContractDocument(id)`. If `file_path` is set, removes file from disk (non-critical, wrapped in try/catch). Calls `logAction("contract_document", id, "deleted", { contractId })`.

### 11. `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` — GET

Validates IDs, fetches record. Two paths:
- If `file_path` is set (upload mode): path traversal guard against `CONTRACT_ATTACHMENTS_DIR`, serve file with correct Content-Type/Content-Disposition.
- If `document_id` is set (link mode): redirect to `/api/documents/${document_id}/download` using `NextResponse.redirect()`.
- If neither: 404.

### 12. `src/components/contracts/contract-documents-section.tsx` — Document list UI

Follows `invoice-section.tsx` pattern exactly:
- Fetches `/api/contracts/${contractId}/documents` on mount
- Shows document list with type badge, name/label, date, download link, delete button
- "Add Document" button opens the dialog
- AlertDialog for delete confirmation (same pattern as invoice-section)

### 13. `src/components/contracts/add-contract-document-dialog.tsx` — Two-tab dialog

Uses Radix Dialog (not Tabs component since it doesn't exist). Implements tab switching with state:
- State `activeTab: "upload" | "link"`
- Two tab buttons at top, styled with the active/inactive pattern
- **"Upload new" tab:** file input (.pdf/.docx), document type Select, optional label Input. POST with mode=upload.
- **"Link existing" tab:** fetches `/api/documents` to get library docs. Shows searchable list (Input for search filter, filtered list of documents). Select a document by clicking. Document type Select, optional label. POST with mode=link.
- Sonner toast on success/error. Re-fetches documents list on save.

### 14. `src/components/contracts/contract-card.tsx` — Wire in ContractDocumentsSection

Add import and render `ContractDocumentsSection` BELOW the `InvoiceSection`, using the same full-width pattern with border-t separator.

## Risks and Trade-offs

- No Tabs UI component exists in the project. I will implement manual tab switching with button state instead of adding a new UI dependency. This is simpler and consistent with the project's approach of using only existing components.
- The "Link existing" tab fetches `/api/documents` which returns ALL documents. For a large library this could be slow. Acceptable for now since the project is small-scale, and the UI includes client-side search filtering.
- `document_id REFERENCES documents(id) ON DELETE SET NULL` means if a linked library doc is deleted, the contract_documents record persists with `document_id = NULL`. The download route handles this gracefully with a 404.

## Success Criteria Verification

1. GET /api/contracts/[id]/documents -> `{ documents: ContractDocument[] }` -- covered by route.ts GET
2. POST mode=upload -> file saved, DB record, 201 -- covered by route.ts POST upload path
3. POST mode=link -> link record, 201 -- covered by route.ts POST link path
4. DELETE removes record + file -- covered by [contractDocId]/route.ts DELETE
5. Download serves file or redirects -- covered by [contractDocId]/download/route.ts
6. Uploaded attachments not in Documents tab -- CONTRACT_ATTACHMENTS_DIR is separate from DOCUMENTS_DIR; the main `/api/documents` queries the `documents` table, not `contract_documents`
7. "Link existing" tab shows searchable library docs -- covered by dialog UI
8. npm run build passes -- will verify
