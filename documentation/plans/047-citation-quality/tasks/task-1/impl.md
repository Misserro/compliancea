# Task 1 — Fix PDF Page Number Extraction — Implementation Notes

## Changes

- **Modified:** `src/app/api/documents/[id]/process/route.ts` (lines 380-397)
  - Replaced 3-line `\f`-split approach with `pagerender` callback approach (17 lines)
  - `pdfData` variable removed — it was only used for `pdfData.text` which is no longer needed
  - `pageTexts` array is populated by the `renderPage` callback during `pdfParse()` execution
  - Each callback receives a PDF.js `PDFPageProxy` with `.pageNumber` (1-based) and `.getTextContent()`
  - Pages are defensively sorted by `pageNumber` and filtered for non-empty text
  - `chunkTextByPages(pages)` call unchanged — already accepts `{pageNumber, text}[]`

## Technical Details

- `pdf-parse` v1.1.4 uses `pdfjs-dist` v1.10.100 internally
- `PDFPageProxy.pageNumber` getter returns `pageIndex + 1` (confirmed in source: `node_modules/pdf-parse/lib/pdf.js/v1.10.100/`)
- The `pagerender` callback is called sequentially in a `for` loop inside `pdf-parse`, so ordering is naturally correct. The sort is defensive.
- Text extraction joins `textContent.items[].str` with spaces. The default render_page uses Y-coordinate checking for newlines, but our chunker normalizes whitespace anyway (`text.replace(/\s+/g, " ")` in `chunkText`).

## Verification

- TypeScript: `npx tsc --noEmit` passes with no errors
- No other files modified

## INTEGRATION

- Task 2 (force-reprocess button) is independent but functionally useful after this fix — existing documents need reprocessing to get correct page numbers
- `chunkTextByPages` in `lib/chunker.js` is unchanged and works with the new page format
