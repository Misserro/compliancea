# Plan: PDF Text Extraction Fix — Scanned PDFs + OCR + Storage-Backend-Aware Processing

> **Execute:** `/uc:plan-execution 056`
> Created: 2026-04-09
> Status: Draft
> Source: Debug Mode (Plan 055 regression investigation)

## Objective

Fix two issues in `src/app/api/documents/[id]/process/route.ts` exposed by the Plan 055 Shared Drive fix, and add OCR as a fallback for scanned PDFs:

1. **S3 storage-backend blind spot** — The process route reads files using `fs.access` and `fs.readFile` directly, bypassing storage-backend routing. Documents stored in S3 (`storage_backend = 'org_s3'` or `'platform_s3'`) cannot be processed. The correct pattern (used in the download route) is `getFile(orgId, storage_backend, storage_key, path)`.

2. **OCR fallback for scanned PDFs** — When `pdf-parse` returns empty text (image-only PDF, no text layer), fall back to Tesseract.js OCR: render each PDF page to an image via `pdfjs-dist` + `@napi-rs/canvas`, then OCR the image. This makes scanned contracts processable without any manual intervention.

## Context

- **Root cause investigation:** Debug Mode triggered by "Could not extract text from document" error on GDrive PDFs after Plan 055 deploy
- **Why Plan 055 exposed this:** Plan 055 added `supportsAllDrives: true` to GDrive downloads, enabling Shared Drive files to be downloaded for the first time. These files are scanned PDFs (no text layer). Before Plan 055, they failed at download and never reached text extraction.
- **Architecture:** `documentation/technology/architecture/data-flow.md` (storage-backend rule, pdf-parse limitation — updated during Plan 056 Stage 4 Step 1)
- **Evidence file:** `src/app/api/documents/[id]/download/route.ts` — uses `getFile()` correctly; process route must follow the same pattern

## Tech Stack

- Next.js 15 — App Router, route handlers
- SQLite (`lib/db.js`) — `documents.storage_backend`, `documents.storage_key`, `documents.path`
- `@/lib/storage-imports` — `getFile(orgId, backend, storageKey, localPath)`
- `src/lib/server-utils.ts` — `extractTextFromBuffer`, `guessType`
- `pdf-parse` v1.1.1 — text-layer PDFs only; returns empty text for scanned PDFs
- `tesseract.js` — pure JavaScript OCR (new dependency)
- `pdfjs-dist` — PDF page renderer; used to convert PDF pages to images for OCR (new direct dependency — already used internally by pdf-parse but needs to be imported directly)
- `@napi-rs/canvas` — Node.js canvas implementation for `pdfjs-dist` page rendering (new dependency)

## Scope

### In Scope

- Replace `fs.access`/`fs.readFile` in process route with `getFile()` for all file reads
- Call `extractTextFromBuffer(buffer, kind)` directly (bypassing `extractTextFromPath` which uses `fs.readFile` internally)
- Add OCR fallback inside `extractTextFromBuffer` in `src/lib/server-utils.ts`: when pdf-parse returns empty text, convert PDF pages to PNG images via pdfjs-dist + @napi-rs/canvas and OCR with Tesseract.js
- OCR uses Polish + English language packs (`pol+eng`) matching the app's target market
- Log a warning when falling back to OCR (slow path, useful for observability)

### Out of Scope

- Fixing `lib/maintenance.js` S3 storage routing (maintenance cycle writes GDrive files locally via `fs.writeFileSync` — always `storage_backend = 'local'`, not affected)
- Changing how GDrive files are stored
- OCR worker pooling / caching (each request creates and terminates its own Tesseract worker — acceptable for this usage pattern)
- Handwriting recognition

## Success Criteria

- [ ] A scanned GDrive PDF is processed successfully: OCR extracts text, document is tagged and chunked normally
- [ ] `POST /api/documents/:id/process` on an S3-backed document (`storage_backend = 'org_s3'`) reads the file successfully via `getFile()` and processes it
- [ ] `POST /api/documents/:id/process` on a local-backend document continues to work as before (no regression)
- [ ] When OCR is used, a server-side warning is logged: `"[OCR fallback] pdf-parse returned empty text for {docName} — running Tesseract OCR"`
- [ ] If both pdf-parse and OCR return empty text (truly unreadable document), the response is: `"Could not extract text — the document appears to be a scanned image with unreadable content."`
- [ ] `npm run build` passes

## Task List

> Every task gets the full pipeline: planning -> impl -> review -> test.

### Task 1: Fix process route — storage-aware file reading

- **Description:** Replace all direct filesystem calls in `src/app/api/documents/[id]/process/route.ts` with storage-backend-aware equivalents:

  **File read (lines 63-66, 81, and the `extractTextFromPath` call at line 70):**
  - Import `getFile` from `@/lib/storage-imports` (same import used in the download route)
  - Import `extractTextFromBuffer` and `guessType` from `@/lib/server-utils` (in addition to or replacing `extractTextFromPath`)
  - Replace the `fs.access(document.path)` existence check with a try/catch around the `getFile` call
  - Call `getFile(orgId, document.storage_backend || 'local', document.storage_key, document.path)` to get the file buffer
  - Call `extractTextFromBuffer(buffer, guessType(document.name) || guessType(document.path))` directly using the already-read buffer (Task 2 adds the OCR fallback inside `extractTextFromBuffer`, so this call automatically benefits from OCR after Task 2)
  - Reuse the same buffer for the file hash computation at line 81 (no second `fs.readFile` needed)

  **Error type (line 64-66):**
  - The old `fs.access` failure returned `"Document file not found on disk"` (404). After the change, if `getFile` throws (file not found in any backend), return `"Document file not accessible"` (404) to preserve the same semantics.

- **Files:** `src/app/api/documents/[id]/process/route.ts`
- **Patterns:** `src/app/api/documents/[id]/download/route.ts` (correct `getFile` usage pattern), `documentation/technology/architecture/data-flow.md` (storage-backend rule)
- **Success criteria:**
  - `getFile` is used instead of `fs.access`/`fs.readFile` for the existence check and buffer read
  - `extractTextFromBuffer` is called with the already-read buffer (no double file read)
  - S3-backed documents can be read and processed
  - Local-backed documents continue to work
  - `npm run build` passes
- **Dependencies:** None

### Task 2: Add Tesseract.js OCR fallback to extractTextFromBuffer

- **Description:** When `pdf-parse` returns empty text for a PDF, fall back to Tesseract OCR. All logic lives inside `extractTextFromBuffer` in `src/lib/server-utils.ts` so all callers (process route, case document ingestion, maintenance cycle) automatically benefit.

  **Install new dependencies:**
  ```
  npm install tesseract.js pdfjs-dist @napi-rs/canvas
  ```

  **OCR flow inside `extractTextFromBuffer` (PDF branch):**
  ```
  1. parsed = await pdfParse(buffer)
  2. text = (parsed.text || '').trim()
  3. if (text.length > 0) return text   ← fast path, no change
  4. // Fallback: OCR
  5. console.warn('[OCR fallback] pdf-parse returned empty text — running Tesseract OCR')
  6. ocrText = await extractTextViaOcr(buffer)
  7. return ocrText   ← may be empty string if OCR also finds nothing
  ```

  **`extractTextViaOcr(pdfBuffer: Buffer): Promise<string>` — new private helper in server-utils.ts:**
  ```
  1. Load PDF document via pdfjs-dist legacy Node build
     (import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs' — or .js depending on version)
  2. For each page (1..numPages):
     a. page = await pdfDoc.getPage(pageNum)
     b. viewport = page.getViewport({ scale: 2.0 })   ← scale 2 for better OCR resolution
     c. canvas = createCanvas(viewport.width, viewport.height)  from @napi-rs/canvas
     d. ctx = canvas.getContext('2d')
     e. await page.render({ canvasContext: ctx, viewport }).promise
     f. imageBuffer = canvas.toBuffer('image/png')
     g. Append imageBuffer to page images array
  3. Create Tesseract worker: createWorker(['pol', 'eng'])
  4. For each page image: { data: { text } } = await worker.recognize(imageBuffer)
  5. await worker.terminate()
  6. Return all page texts joined with '\n\n'
  ```

  **pdfjs-dist Node.js setup:**
  - Use `pdfjs-dist/legacy/build/pdf.mjs` (or `.js`) — the legacy build works in Node.js without a browser worker
  - Set `GlobalWorkerOptions.workerSrc = ''` to disable the browser worker requirement
  - Pass `{ data: pdfBuffer }` to `getDocument()`

  **Error handling:**
  - If `pdfjs-dist` or Tesseract throws on any page: log the error, skip that page, continue with others
  - If all pages fail: return `''` (caller handles empty text)
  - Tesseract worker must always be terminated (use try/finally)

- **Files:** `src/lib/server-utils.ts`, `package.json`
- **Patterns:** `documentation/technology/architecture/data-flow.md` (OCR fallback rule added in Stage 4 Step 1)
- **Success criteria:**
  - A scanned PDF buffer passed to `extractTextFromBuffer('pdf')` returns non-empty text extracted via OCR
  - A text-layer PDF continues to use the fast pdf-parse path (no OCR invoked)
  - OCR warning is logged to console when fallback is triggered
  - If both paths return empty, `''` is returned (no throw)
  - Tesseract worker is always terminated (no worker leak)
  - `npm run build` passes
- **Dependencies:** None (Task 1 and Task 2 are independent — both modify different files)

## Documentation Changes

Updated during Stage 4 Step 1 (already on disk):

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/data-flow.md` | Updated | Added storage-backend rule: all file reads must use `getFile()`; added pdf-parse limitation and OCR fallback description |

Additional update needed (executor updates during implementation):

| File | Needed Change |
|------|---------------|
| `documentation/technology/architecture/data-flow.md` | Update the "OCR not implemented" note (from Plan 023 context) to document the Tesseract.js OCR fallback added in Plan 056 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking local-backend document processing | Low | High | `getFile` with `'local'` calls `fs.readFile` internally — same behavior |
| `getFile` signature mismatch | Low | Medium | Copy exact import and call from `download/route.ts` which already uses it correctly |
| pdfjs-dist Node.js compatibility | Medium | Medium | Use the `legacy/build` entry point — designed for Node.js environments without browser APIs |
| Tesseract OCR is slow (10–60s/page) | High | Medium | Expected behavior; log warning so operators can observe; no timeout added (contract PDFs are typically 1–20 pages) |
| `@napi-rs/canvas` native binary not available on Railway | Low | High | `@napi-rs/canvas` provides prebuilt binaries for Linux x64 (Railway's target platform); verify at install time |
| OCR language pack size (~50MB for pol+eng) | High | Low | Bundle size increase is acceptable; language data is downloaded at Tesseract worker creation time, not bundled into Next.js |
