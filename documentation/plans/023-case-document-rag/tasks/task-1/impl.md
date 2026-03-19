# Task 1 — Implementation Notes

## Files Changed

### 1. `lib/db.js`
- Added 5 new columns to `chunks` table via try/catch ALTER TABLE migrations: `page_number`, `char_offset_start`, `char_offset_end`, `section_title`, `sentences_json`
- Created FTS5 virtual table `chunks_fts` as content table backed by `chunks`
- Added 3 triggers: `chunks_fts_ai` (insert), `chunks_fts_ad` (delete), `chunks_fts_au` (update of content)
- Added FTS5 backfill via `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')` to index existing chunks
- Added `insertChunkWithMeta()` — inserts chunk with all page-aware columns; FTS trigger fires automatically
- Added `getChunksByCaseId(caseId)` — returns chunks with page metadata for case-linked documents via JOIN through case_documents
- Added `getCaseDocumentIndexingStatus(caseId)` — returns per-document indexing status (processed flag + chunk count)

### 2. `lib/db.d.ts`
- Added type declarations for 3 new exported functions

### 3. `lib/chunker.js`
- Added `chunkTextByPages(pages)` — takes `[{pageNumber, text}]`, produces page-aware chunks with sentence arrays
- Uses existing `chunkText()` internally for each page, then enriches with page metadata
- Short pages (< 20 words) still produce a single chunk (not filtered out)
- `detectSectionTitle()` — detects headings (all-caps or colon-ending short lines)
- `buildSentences()` — builds `[{text, charStart, charEnd}]` array with character offsets relative to chunk content
- No chunk spans across pages

### 4. `lib/chunker.d.ts`
- Added type declaration for `chunkTextByPages`

### 5. `src/lib/db-imports.ts`
- Re-exported: `insertChunkWithMeta`, `getChunksByCaseId`, `getCaseDocumentIndexingStatus`

### 6. `src/lib/chunker-imports.ts`
- Re-exported: `chunkTextByPages`

### 7. `src/app/api/documents/[id]/process/route.ts`
- Added imports: `pdfParse`, `guessType`, `insertChunkWithMeta`, `chunkTextByPages`
- Standard pipeline now branches on file type:
  - **PDF:** reads file buffer, calls `pdfParse`, splits text by `\f` (form feed), builds pages array, calls `chunkTextByPages`, inserts via `insertChunkWithMeta` with full page metadata
  - **Non-PDF:** falls back to existing `chunkText`, inserts via `insertChunkWithMeta` with null page metadata
- Replaced `addChunksBatch` with per-chunk `insertChunkWithMeta` calls (triggers FTS5 indexing)
- Replaced `chunks.length` references with `totalChunks` variable

## Design Decisions

1. **`\f` page splitting** — pdf-parse inserts form feed characters between pages by default. Simpler than the `pagerender` callback approach and sufficient for standard PDFs. Empty strings from trailing `\f` are filtered out.

2. **No change to case documents route** — `document_id` is already set at upload time in the existing code (line 156-159 of the route). The plan's concern about a NULL gap was unfounded.

3. **FTS5 backfill on every init** — The `rebuild` command is safe to run on both empty and populated tables. This ensures existing chunks are indexed after the migration.

4. **saveDb() handled automatically** — The existing `run()` function calls `saveDb()` after every write, so `insertChunkWithMeta` inherits this behavior.

## Backward Compatibility

- All new columns are nullable — existing chunks without page data continue to work
- Existing `getCaseChunks`, `getChunksByDocumentIds`, `getAllChunksWithEmbeddings` are unaffected
- Contract processing pipeline (non-chunked) is unaffected
- Non-PDF documents get null page metadata but still go through the same `insertChunkWithMeta` path
