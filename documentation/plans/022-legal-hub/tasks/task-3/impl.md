## Task 3 Complete -- Case Document Repository

### Files Created
- `src/app/api/legal-hub/cases/[id]/documents/route.ts` -- GET (list) + POST (upload/link)
- `src/app/api/legal-hub/cases/[id]/documents/[did]/route.ts` -- DELETE
- `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts` -- GET (download/redirect)
- `src/components/legal-hub/case-documents-tab.tsx` -- Documents tab with category filter, list, empty state
- `src/components/legal-hub/add-case-document-dialog.tsx` -- Upload/link dialog with category, date filed, filing reference fields

### Files Modified
- `lib/db.js` (appended 4 helpers after `getCaseDeadlineById`: `getCaseDocuments`, `addCaseDocument`, `getCaseDocumentById`, `removeCaseDocument`)
- `lib/db.d.ts` (appended 4 type declarations)
- `lib/paths.js` (added `CASE_ATTACHMENTS_DIR` constant + `ensureDirectories()` entry)
- `lib/paths.d.ts` (added `CASE_ATTACHMENTS_DIR` declaration)
- `src/lib/db-imports.ts` (appended 4 exports)
- `src/lib/paths-imports.ts` (added `CASE_ATTACHMENTS_DIR` export)
- `src/lib/constants.ts` (appended `CASE_DOCUMENT_CATEGORIES` and `CASE_DOCUMENT_CATEGORY_COLORS`)
- `src/components/legal-hub/case-detail-page.tsx` (replaced Documents tab placeholder with `<CaseDocumentsTab>`, added import)

### API Response Envelopes (per Lead correction)
- GET /documents -> `{ case_documents: [...] }`
- POST /documents -> `{ case_document: doc }` with status 201
- DELETE /documents/[did] -> `{ case_document: { id: did } }`

### Integration Points
- **Task 5 (chat)**: `getCaseDocuments(caseId)` returns `document_id` values needed for vector search scoping via `JOIN chunks -> case_documents -> documents`
- Uploaded PDF/DOCX files are added to `documents` table via `addDocument()` and processed via fire-and-forget `POST /api/documents/[docId]/process` -- this creates chunks + embeddings for chat search
- The fire-and-forget process call passes the request cookie header for auth

### Key Decisions
- Upload always creates a `documents` table entry and links via `document_id` -- files become first-class library documents, searchable in chat
- DELETE only removes `case_documents` row; physical file only deleted when `document_id IS NULL` (pure upload without library entry, which does not occur in current flow)
- Category filter is client-side (computed from fetched list); no server-side filter needed for typical case document counts
- Path traversal prevention in download route: `path.resolve()` must start with `path.resolve(CASE_ATTACHMENTS_DIR)` (tightened from DOCUMENTS_DIR per review)

### GOTCHA
- Task 4 was running concurrently and already added template helpers to `lib/db.js`, `lib/db.d.ts`, and `src/lib/db-imports.ts`. I inserted my helpers between the deadline section and the template section to maintain logical ordering.

### TypeScript Check
- `npx tsc --noEmit` shows 0 errors from Task 3 code. 3 errors shown are all from Task 4's in-progress code (templateEngine module, Buffer type, template-form module).
