# Task 1 — Page-Aware Ingestion Pipeline — Implementation Plan

## Overview

Extend the document processing pipeline to produce page-numbered, sentence-aware chunks with FTS5 lexical index support. Four files modified, zero new files.

---

## File Changes

### 1. `lib/chunker.js` — Add `chunkTextByPages(pages)`

**Input:** `[{pageNumber, text}]` (from pdf-parse per-page extraction)
**Output:** `[{content, pageNumber, charOffsetStart, charOffsetEnd, sectionTitle, sentences}]`

Logic:
- Iterate each page independently (no chunk spans across pages)
- For each page, normalize whitespace, split into paragraphs then sentences using existing `splitIntoSentences` logic
- Build chunks up to `targetWords` (500) with overlap (50) within a page
- For each chunk, compute `charOffsetStart`/`charOffsetEnd` relative to the original page text
- Detect `sectionTitle`: if first sentence looks like a heading (short line, all caps, or ends with colon without period), store it
- Build `sentences` array: `[{text, charStart, charEnd}]` with char offsets relative to the chunk content
- Short pages (< 20 words) produce a single chunk (not filtered out, since they might be the only content on that page)
- Export `chunkTextByPages` as named export alongside existing `chunkText`

### 2. `lib/db.js` — Schema migration + new helpers

**Schema migrations (try/catch pattern):**
```sql
ALTER TABLE chunks ADD COLUMN page_number INTEGER
ALTER TABLE chunks ADD COLUMN char_offset_start INTEGER
ALTER TABLE chunks ADD COLUMN char_offset_end INTEGER
ALTER TABLE chunks ADD COLUMN section_title TEXT
ALTER TABLE chunks ADD COLUMN sentences_json TEXT
```

**FTS5 virtual table:**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, content='chunks', content_rowid='id')
```

**Triggers for FTS5 sync:**
```sql
-- INSERT trigger: after inserting a chunk, add to FTS
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

-- DELETE trigger: after deleting a chunk, remove from FTS
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

-- UPDATE trigger: after updating a chunk, update FTS
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
```

**Note on sql.js:** sql.js executes SQL via `db.run()` which runs synchronous SQLite statements. FTS5 is included in sql.js v1.10.0+. Triggers use the standard SQLite trigger syntax. Since sql.js wraps SQLite's C implementation, these work identically to native SQLite.

**New helper functions:**

1. `insertChunkWithMeta({documentId, content, chunkIndex, embedding, pageNumber, charOffsetStart, charOffsetEnd, sectionTitle, sentencesJson})` — INSERT into chunks with all new columns
2. `getChunksByCaseId(caseId)` — SELECT chunks.*, documents.name as document_name FROM chunks JOIN documents JOIN case_documents WHERE case_documents.case_id = ? AND chunks.embedding IS NOT NULL
3. `getCaseDocumentIndexingStatus(caseId)` — Returns [{documentId, documentName, processed, chunksIndexed}] for all docs in a case

Also update `db-imports.ts` to export the 3 new functions.

### 3. `src/app/api/documents/[id]/process/route.ts` — Page-aware PDF processing

In the "STANDARD DOCUMENT PIPELINE" section (line ~337), before chunking:

- Import `pdfParse` from `pdf-parse` (already available via `@/lib/server-utils` but we need raw access for page callback)
- For PDF files: read the file buffer, call pdf-parse with a custom `pagerender` callback that captures per-page text
- Call `chunkTextByPages(pages)` instead of `chunkText(text)`
- Use `insertChunkWithMeta` instead of `addChunksBatch` to store page metadata
- For non-PDF files: keep existing `chunkText` flow, call `insertChunkWithMeta` with null page metadata

**Page extraction approach:**
```js
const pdfData = await pdfParse(fileBuffer, {
  // pdf-parse returns pages via numpages and text per page
});
// pdf-parse exposes pdfData.numpages and page-level text via internal pdf.js rendering
// Alternative: use pdfData.text split by form-feed characters (\f) which pdf-parse inserts between pages
```

Actually, pdf-parse inserts `\f` (form feed) between pages by default. So the simplest approach:
- `const pageTexts = pdfData.text.split('\f').filter(t => t.trim().length > 0)` (filter empty strings from trailing `\f`)
- Map to `[{pageNumber: i+1, text: pageTexts[i]}]`
- This avoids needing a custom pagerender callback

**Content hash check:** The existing `computeContentHash` + duplicate detection already handles reprocessing skip. The `content_hash` is checked against existing documents. If the same file is re-uploaded, `findDuplicates` detects it and logs it. For case documents specifically, the document is still created in the `documents` table but the processing pipeline uses the hash to detect duplicates.

### 4. `src/app/api/legal-hub/cases/[id]/documents/route.ts` — document_id writeback

Looking at the current code (line 156-159), `document_id` is already being set correctly:
```ts
const docId = addDocument(safeName, filePath, "case-attachments", null);
const newId = addCaseDocument({ caseId, documentId: docId, ... });
```

The `document_id` is passed as `docId` to `addCaseDocument` and stored immediately. The plan says to "fix the NULL gap where document_id stays NULL until processing completes" but the current code already sets it at upload time, before processing triggers. **No change needed here** — the document_id is written correctly.

### 5. `src/lib/chunker-imports.ts` — Re-export new function

Add `chunkTextByPages` to the export list.

---

## Implementation Order

1. `lib/db.js` — migrations + helpers (foundation)
2. `src/lib/db-imports.ts` — re-export new functions
3. `lib/chunker.js` — `chunkTextByPages`
4. `src/lib/chunker-imports.ts` — re-export
5. `src/app/api/documents/[id]/process/route.ts` — wire it together
6. Verify no breaking changes to existing flows

---

## Risk Assessment

- **FTS5 in sql.js:** sql.js v1.10.0+ includes FTS5. If the version is older, the CREATE VIRTUAL TABLE will fail. Mitigation: wrap in try/catch.
- **Page splitting via \f:** pdf-parse uses `\f` as page separator by default. If a PDF has no page breaks, all text lands on "page 1" which is acceptable.
- **Backward compat:** Existing chunks without page_number continue to work. All new columns are nullable. Existing `getCaseChunks`, `getChunksByDocumentIds`, etc. are unaffected.
- **Trigger on existing data:** FTS5 content table starts empty. Existing chunks won't be in FTS until reprocessed. This is acceptable — only newly processed documents get FTS coverage.
