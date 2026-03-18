# Task 3 Implementation Plan — Case Document Repository

## Overview

This plan implements the Documents tab within the case detail view. It adds three backend API routes for document listing/upload/linking, deletion, and download. It adds three DB helpers. It wires the `CaseDocumentsTab` component into `case-detail-page.tsx` replacing the "Coming soon" placeholder. File storage uses `DOCUMENTS_DIR/case-attachments/[case_id]/`. For PDF/DOCX uploads, the standard document processing pipeline (text extraction + chunking + embeddings) is triggered so uploaded case files become searchable in the future chat (Task 5).

---

## Files to Create or Modify

### 1. `lib/db.js` — append three new helpers after the deadlines section

New section `// ---- Case Documents ----` appended after `deleteCaseDeadline`/`getCaseDeadlineById`:

**`getCaseDocuments(caseId)`**
```js
export function getCaseDocuments(caseId) {
  return query(
    `SELECT cd.*,
       d.name AS linked_document_name,
       d.path AS linked_document_path
     FROM case_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.case_id = ?
     ORDER BY cd.added_at DESC`,
    [caseId]
  );
}
```

**`addCaseDocument({ caseId, documentId, filePath, fileName, documentCategory, label, dateFiled, filingReference })`**
```js
export function addCaseDocument({
  caseId, documentId, filePath, fileName,
  documentCategory, label, dateFiled, filingReference,
}) {
  const result = run(
    `INSERT INTO case_documents (
      case_id, document_id, file_path, file_name,
      document_category, label, date_filed, filing_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caseId,
      documentId || null,
      filePath || null,
      fileName || null,
      documentCategory || 'other',
      label || null,
      dateFiled || null,
      filingReference || null,
    ]
  );
  return result.lastInsertRowId;
}
```

**`getCaseDocumentById(id)`**
```js
export function getCaseDocumentById(id) {
  return get(
    `SELECT cd.*,
       d.name AS linked_document_name,
       d.path AS linked_document_path
     FROM case_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.id = ?`,
    [id]
  );
}
```

**`removeCaseDocument(id)`** — deletes the `case_documents` row only; does NOT touch `documents` table.
```js
export function removeCaseDocument(id) {
  run(`DELETE FROM case_documents WHERE id = ?`, [id]);
}
```

Note: `run()` already calls `saveDb()` internally. No explicit `saveDb()` call needed.

---

### 2. `lib/db.d.ts` — append four declarations

```ts
export function getCaseDocuments(...args: any[]): any;
export function addCaseDocument(...args: any[]): any;
export function getCaseDocumentById(...args: any[]): any;
export function removeCaseDocument(...args: any[]): any;
```

---

### 3. `src/lib/db-imports.ts` — append four exports

Add before the closing `} from "../../lib/db.js"`:
```ts
getCaseDocuments,
addCaseDocument,
getCaseDocumentById,
removeCaseDocument,
```

---

### 4. `src/lib/constants.ts` — add case document category constants

Append after `LEGAL_CASE_TYPE_LABELS`:

```ts
export const CASE_DOCUMENT_CATEGORIES = [
  { value: "pleadings", label: "Pisma procesowe" },
  { value: "evidence", label: "Dowody" },
  { value: "correspondence", label: "Korespondencja" },
  { value: "court_decisions", label: "Orzeczenia" },
  { value: "powers_of_attorney", label: "Pełnomocnictwa" },
  { value: "contracts_annexes", label: "Umowy i aneksy" },
  { value: "invoices_costs", label: "Faktury i koszty" },
  { value: "internal_notes", label: "Notatki wewnętrzne" },
  { value: "other", label: "Inne" },
] as const;

export const CASE_DOCUMENT_CATEGORY_COLORS: Record<string, string> = {
  pleadings: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  evidence: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  correspondence: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  court_decisions: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  powers_of_attorney: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  contracts_annexes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  invoices_costs: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  internal_notes: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  other: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};
```

---

### 5. `src/app/api/legal-hub/cases/[id]/documents/route.ts` — GET, POST (new file)

**Auth pattern:** `const session = await auth()` FIRST, then `await ensureDb()`.

```
export const runtime = "nodejs";
```

**GET handler:**
- `auth()` → 401 if no session
- `ensureDb()`
- `try { ... } catch (err: unknown) { message = err instanceof Error ? err.message : "Unknown error"; return NextResponse.json({ error: message }, { status: 500 }); }`
- Parse `props.params` → `id` → parseInt → 400 if NaN
- `getLegalCaseById(id)` → 404 if null
- `getCaseDocuments(id)` — returns rows with `linked_document_name` join
- Return `NextResponse.json({ data: documents })`

**POST handler:**
- `auth()` → 401 if no session
- `ensureDb()`
- try/catch (err: unknown) pattern
- Parse `props.params` → `id` → parseInt → 400 if NaN
- `getLegalCaseById(id)` → 404 if null
- Read `request.formData()`
- `mode` = formData.get("mode") — must be "upload" or "link" → 400 otherwise
- `document_category` = formData.get("document_category") || "other" — validate against `CASE_DOCUMENT_CATEGORIES` values → 400 if invalid
- `label` = formData.get("label") || null
- `date_filed` = formData.get("date_filed") || null
- `filing_reference` = formData.get("filing_reference") || null

**Upload path:**
- `file = formData.get("file")` as File
- Validate: file exists + size > 0 → 400 "No file uploaded"
- Validate extension: `.pdf` or `.docx` (ALLOWED_EXTENSIONS = `/\.(pdf|docx)$/i`) → 400
- Validate MIME type → 400
- Validate size <= 10MB → 400
- Build case dir: `path.join(DOCUMENTS_DIR, "case-attachments", String(caseId))`
- `fs.mkdirSync(caseDir, { recursive: true })`
- Safe filename: `file.name.replace(/[^a-zA-Z0-9._-]/g, "_")`
- filePath: `path.join(caseDir, `doc_${crypto.randomUUID()}_${safeName}`)`
- Write file to disk
- `newId = addCaseDocument({ caseId, filePath, fileName: safeName, documentCategory, label, dateFiled, filingReference })`
- `logAction("case_document", newId, "created", JSON.stringify({ caseId, mode: "upload", documentCategory }))`
- **Trigger processing pipeline** (if PDF/DOCX):
  - `docId = addDocument(safeName, filePath, "case-attachments", null)` — adds to `documents` table
  - `removeCaseDocument(newId)` — remove the just-created row (had no document_id)
  - `newId = addCaseDocument({ caseId, documentId: docId, filePath, fileName: safeName, documentCategory, label, dateFiled, filingReference })` — re-add with document_id set
  - Fire-and-forget: `fetch("/api/documents/" + docId + "/process", { method: "POST" }).catch(() => {})` — non-blocking; processing failure does not fail the upload response
- `doc = getCaseDocumentById(newId)`
- Return `NextResponse.json({ data: doc }, { status: 201 })`

**Link path:**
- `document_id_str = formData.get("document_id")` → 400 if missing
- `documentId = parseInt(document_id_str)` → 400 if NaN
- `getDocumentById(documentId)` → 404 if not found
- `newId = addCaseDocument({ caseId, documentId, fileName: linkedDoc.name, documentCategory, label, dateFiled, filingReference })`
- `logAction("case_document", newId, "created", JSON.stringify({ caseId, mode: "link", documentId, documentCategory }))`
- `doc = getCaseDocumentById(newId)`
- Return `NextResponse.json({ data: doc }, { status: 201 })`

**Imports needed:**
- `crypto` from "crypto"
- `path` from "path"
- `fs` from "fs"
- `{ auth }` from "@/auth"
- `{ ensureDb }` from "@/lib/server-utils"
- `{ getLegalCaseById, getCaseDocuments, addCaseDocument, getCaseDocumentById, addDocument, getDocumentById, removeCaseDocument }` from "@/lib/db-imports"
- `{ logAction }` from "@/lib/audit-imports"
- `{ DOCUMENTS_DIR }` from "@/lib/paths-imports"
- `{ CASE_DOCUMENT_CATEGORIES }` from "@/lib/constants"

---

### 6. `src/app/api/legal-hub/cases/[id]/documents/[did]/route.ts` — DELETE (new file)

**Auth pattern:** `const session = await auth()` FIRST, then `await ensureDb()`.

**DELETE handler:**
- `auth()` → 401 if no session
- `ensureDb()`
- try/catch (err: unknown) pattern
- Parse `props.params` → `id` (caseId), `did` (document attachment id) → 400 if NaN
- `getCaseDocumentById(did)` → 404 if null or `existing.case_id !== caseId`
- `removeCaseDocument(did)` — removes case_documents row only
- If `existing.file_path` AND `existing.document_id === null` — delete file from disk (non-critical, try/catch):
  ```ts
  try { fs.unlinkSync(existing.file_path); } catch (e) { console.warn("Failed to delete file:", e); }
  ```
  Note: If `document_id` is set, the file belongs to the documents library — do NOT delete it from disk.
- `logAction("case_document", did, "deleted", JSON.stringify({ caseId }))`
- Return `NextResponse.json({ data: { id: did } })`

**Imports needed:**
- `{ auth }` from "@/auth"
- `{ ensureDb }` from "@/lib/server-utils"
- `{ getCaseDocumentById, removeCaseDocument }` from "@/lib/db-imports"
- `{ logAction }` from "@/lib/audit-imports"
- `fs` from "fs"

---

### 7. `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts` — GET (new file)

**Pattern:** Mirrors `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` exactly, adapted for case documents.

**GET handler:**
- `auth()` → 401 if no session
- `ensureDb()`
- try/catch (err: unknown) pattern
- Parse `props.params` → `id` (caseId), `did` → 400 if NaN
- `getCaseDocumentById(did)` → 404 if null or `doc.case_id !== caseId`
- **If linked library document** (`doc.document_id` is set): redirect to `/api/documents/${doc.document_id}/download`
- **If uploaded file**: serve directly from `doc.file_path`
  - Path traversal check: `path.resolve(doc.file_path)` must start with `path.resolve(DOCUMENTS_DIR)`
  - `fs.access(resolvedPath)` → 404 if file missing
  - Read file, detect MIME from extension
  - Return `new NextResponse(fileBuffer, { headers: { "Content-Type": contentType, "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"` } })`

**MIME_TYPES constant:**
```ts
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
```

**Imports needed:**
- `{ auth }` from "@/auth"
- `{ ensureDb }` from "@/lib/server-utils"
- `{ getCaseDocumentById }` from "@/lib/db-imports"
- `{ DOCUMENTS_DIR }` from "@/lib/paths-imports"
- `fs/promises`, `path`

---

### 8. `src/components/legal-hub/case-documents-tab.tsx` — new file

**"use client"** component.

**Props:** `{ caseId: number }`

**State:**
- `documents: CaseDocument[]` (extended with `linked_document_name: string | null`, `linked_document_path: string | null`)
- `loading: boolean`
- `dialogOpen: boolean`
- `deletingDocId: number | null`
- `categoryFilter: string` (default: `""` = all)

**Data fetch:**
- `fetchDocuments()` via `useCallback`: `GET /api/legal-hub/cases/[caseId]/documents` → `setDocuments(data.data || [])`
- `useEffect` on mount

**Category filter:**
- Computed `filteredDocuments = categoryFilter ? documents.filter(d => d.document_category === categoryFilter) : documents`

**Render structure:**

1. **Header row**: "Documents" title + "Add Document" button (Plus icon)

2. **Category filter bar** (only when documents.length > 0):
   - "All" chip (active when filter === "")
   - One chip per category that has at least one document
   - Uses `CASE_DOCUMENT_CATEGORY_COLORS` for active chip styling
   - Pattern: small `px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer` buttons

3. **Document list / empty state:**
   - Empty state (no documents at all): centered `<FileText>` icon + "No documents attached." text + "Upload or link a document to get started." subtext + "Add Document" button
   - Empty state (filtered, no matches): "No documents in this category."
   - Document rows: same card pattern as `ContractDocumentsSection`
     - Category badge (from `CASE_DOCUMENT_CATEGORY_COLORS`)
     - File name / linked document name
     - Label if present
     - Metadata row: `date_filed` if set, `filing_reference` if set, "Linked from library" vs "Uploaded", `added_at` date
     - Download link (`/api/legal-hub/cases/[caseId]/documents/[doc.id]/download`)
     - Download icon: `FileText` for linked docs, `Download` for uploaded
     - Delete button (Trash2 icon) → sets `deletingDocId`

4. **`AddCaseDocumentDialog`** component (inline below the list)

5. **`AlertDialog`** for delete confirmation — same pattern as `ContractDocumentsSection`

---

### 9. `src/components/legal-hub/add-case-document-dialog.tsx` — new file

**"use client"** component.

**Props:** `{ caseId: number; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }`

**State:**
- `saving: boolean`
- `activeTab: "upload" | "link"` (default "upload")
- `documentCategory: string` (default "other")
- `label: string`
- `dateFiled: string`
- `filingReference: string`
- `fileRef: RefObject<HTMLInputElement>`
- `libraryDocs: LibraryDocument[]`
- `libraryLoading: boolean`
- `searchQuery: string`
- `selectedDocId: number | null`
- `processEmbeddings: boolean` (default true — checkbox for "Make searchable in chat")

**Pattern:** Mirrors `AddContractDocumentDialog` exactly. Key differences:
- Uses `CASE_DOCUMENT_CATEGORIES` select for category (not document type)
- Additional optional fields: `date_filed` (date input), `filing_reference` (text input)
- "Make searchable in chat" checkbox (upload tab only) — controls `process_embeddings` field in form data (but since the API always processes PDF/DOCX, this checkbox is cosmetic in v1 — note in impl.md)
- Submit POSTs to `/api/legal-hub/cases/[caseId]/documents`

**Fetch library docs:** `GET /api/documents` — same as `AddContractDocumentDialog`

**Reset on close:** clear all form state.

---

### 10. `src/components/legal-hub/case-detail-page.tsx` — modify Documents tab

**Change:** Replace the Documents tab "Coming soon" placeholder with `<CaseDocumentsTab caseId={caseId} />`.

Specifically, change:
```tsx
{activeTab === "documents" && (
  <div className="py-12 text-center text-muted-foreground text-sm">
    Coming soon — implemented in a future task.
  </div>
)}
```
to:
```tsx
{activeTab === "documents" && (
  <CaseDocumentsTab caseId={caseId} />
)}
```

Add import: `import { CaseDocumentsTab } from "./case-documents-tab";`

---

## Success Criteria Verification

| Criterion | Implementation |
|---|---|
| Documents tab shows empty state with upload prompt when no documents exist | `CaseDocumentsTab` renders empty state with "Add Document" button when `documents.length === 0` |
| Upload a PDF → file saved, appears in list under selected category | POST with mode=upload → file written to `DOCUMENTS_DIR/case-attachments/[caseId]/` → `addCaseDocument` → `getCaseDocumentById` → returned in list |
| Link an existing library document → appears in list with link to original | POST with mode=link → `addCaseDocument({ documentId: ... })` → list shows "Linked from library" with download pointing to library document |
| Category filter shows only matching documents | `categoryFilter` state drives client-side `filteredDocuments` computed from fetched list |
| Download button returns the file | GET `/api/legal-hub/cases/[id]/documents/[did]/download` → serves file or redirects to library download |
| Uploading a PDF triggers text extraction | Upload handler calls `addDocument(...)` + fire-and-forget `fetch("/api/documents/[docId]/process")` |
| Removing from case does NOT delete from document library | `removeCaseDocument` only DELETEs from `case_documents`; file deleted from disk only when `document_id IS NULL` (uploaded, not linked) |

---

## Risks and Trade-offs

1. **Processing pipeline trigger**: The POST handler fires `/api/documents/[docId]/process` as fire-and-forget. This means processing (embeddings) happens asynchronously. The upload response returns immediately without waiting. This is the correct pattern — processing can take several seconds.

2. **`addDocument` for uploaded case files**: Uploaded PDFs/DOCX files get added to the main `documents` table (so they become searchable via chunks/embeddings for the case chat in Task 5). The `case_documents` row links to this `documents` record via `document_id`. This means the document appears in the document library, which is intentional — it becomes a first-class document in the system.

3. **File-only uploads (no processing)**: For future cases where a user uploads a file but does NOT want it in the document library (just stored as a case attachment), the `case_documents` row can have `file_path` set and `document_id = NULL`. The current implementation always adds to the `documents` table for PDF/DOCX. This is the documented behavior per the README plan.

4. **`removeCaseDocument` vs file deletion**: DELETE only removes the `case_documents` row. If the uploaded file was added to `documents` table (has `document_id`), we do NOT delete the physical file or the `documents` row — the document lives in the library. The physical file is only deleted from disk when `document_id IS NULL` (a true upload-only attachment not in the library).

5. **Path traversal**: The download endpoint validates that the resolved file path is under `DOCUMENTS_DIR` — mirrors the contract document download pattern exactly.

6. **`DOCUMENTS_DIR` usage**: `paths.js` exports `DOCUMENTS_DIR` = `{DATA_DIR}/documents`. The case attachments directory is `DOCUMENTS_DIR/case-attachments/[caseId]/`. This is consistent with `CONTRACT_ATTACHMENTS_DIR = DOCUMENTS_DIR/contract-attachments`. No change to `paths.js` needed.

7. **No `ensureDirectories()` call needed**: `fs.mkdirSync(caseDir, { recursive: true })` in the upload handler creates the directory on demand. This is the same approach used in the contract documents upload route.

8. **Tasks 3 and 4 run in parallel**: Both add helpers to `lib/db.js` and `src/lib/db-imports.ts`. There is no function name collision: Task 3 adds `getCaseDocuments`/`addCaseDocument`/`getCaseDocumentById`/`removeCaseDocument`; Task 4 adds template/generated-doc helpers. Both append to the end of their respective sections.

---

## Dependency Notes

- Task 5 (chat) requires `getCaseDocuments(caseId)` to retrieve `document_id` values for vector search — this helper is defined here.
- The `addDocument` + process pipeline integration ensures uploaded files have `full_text` and `chunks` indexed before Task 5 is used.
- `case-detail-page.tsx` is modified minimally (one import + one JSX replacement) — no risk of breaking the Overview tab.
