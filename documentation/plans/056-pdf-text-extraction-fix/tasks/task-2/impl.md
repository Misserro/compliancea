# Task 2: Implementation Notes

## Changes Made

### 1. `src/lib/server-utils.ts`

**New private helper `extractTextViaOcr(pdfBuffer: Buffer): Promise<string>` (lines 38-78):**
- Dynamic imports of `pdfjs-dist/legacy/build/pdf.mjs`, `@napi-rs/canvas`, and `tesseract.js` to avoid webpack bundling native binaries
- Sets `GlobalWorkerOptions.workerSrc = ""` to disable browser worker requirement
- Renders each PDF page to PNG at scale 2.0 via pdfjs-dist + @napi-rs/canvas
- Per-page error handling: logs warning and skips failed pages
- Creates Tesseract worker with `['pol', 'eng']` languages
- OCR each page image, collecting text
- Worker terminated in `finally` block (no leak possible)
- Returns page texts joined with `'\n\n'`, or `''` if all pages fail

**Modified `extractTextFromBuffer` PDF branch (lines 80-89):**
- pdf-parse fast path preserved: if text is non-empty, return immediately
- When pdf-parse returns empty text, logs warning and falls back to `extractTextViaOcr()`
- Warning message: `[OCR fallback] pdf-parse returned empty text — running Tesseract OCR`
- Returns OCR text (may be empty string if OCR finds nothing)

### 2. `next.config.mjs`

Added webpack externals for OCR dependencies to prevent webpack from trying to bundle native `.node` binaries:
- `@napi-rs/canvas` -> `commonjs @napi-rs/canvas`
- `pdfjs-dist/legacy/build/pdf.mjs` -> `commonjs pdfjs-dist/legacy/build/pdf.mjs`
- `tesseract.js` -> `commonjs tesseract.js`

### 3. `package.json`

New dependencies installed:
- `tesseract.js` v7.0.0
- `pdfjs-dist` v5.6.205
- `@napi-rs/canvas` (latest)

## Build Status

`npm run build` passes successfully.

## Key Decisions

- **Dynamic imports instead of top-level:** Required because `@napi-rs/canvas` includes a native `.node` binary that webpack cannot parse. Dynamic `import()` alone wasn't sufficient — webpack still traces the dependency. Adding webpack externals in `next.config.mjs` was the correct solution.
- **Scale 2.0 for viewport:** Higher resolution gives better OCR quality for scanned documents.
- **Per-page error handling:** One bad page doesn't fail the entire document.
- **`@ts-expect-error` for canvas context:** pdfjs-dist types expect a browser `CanvasRenderingContext2D` but @napi-rs/canvas provides a compatible Node.js implementation.
