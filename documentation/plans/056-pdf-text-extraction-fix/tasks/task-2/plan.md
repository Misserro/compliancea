# Task 2: Add Tesseract.js OCR Fallback to extractTextFromBuffer

## Target File
`src/lib/server-utils.ts`

## Overview
When `pdf-parse` returns empty text for a PDF (scanned/image-only), fall back to Tesseract.js OCR. All logic lives inside `extractTextFromBuffer` so all callers automatically benefit.

## New Dependencies
```
npm install tesseract.js pdfjs-dist @napi-rs/canvas
```

## Implementation Plan

### 1. New imports at top of server-utils.ts
```typescript
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
```

Set `GlobalWorkerOptions.workerSrc = ''` immediately after import to disable browser worker.

### 2. New private helper: `extractTextViaOcr(pdfBuffer: Buffer): Promise<string>`

**Steps:**
1. Load PDF via `getDocument({ data: new Uint8Array(pdfBuffer) })`
2. For each page (1..numPages):
   a. Get page: `pdfDoc.getPage(pageNum)`
   b. Create viewport: `page.getViewport({ scale: 2.0 })` (scale 2 for OCR quality)
   c. Create canvas: `createCanvas(viewport.width, viewport.height)` from @napi-rs/canvas
   d. Get context: `canvas.getContext('2d')`
   e. Render: `await page.render({ canvasContext: ctx, viewport }).promise`
   f. Export PNG: `canvas.toBuffer('image/png')`
   g. Collect image buffer; if any step fails for a page, log warning and skip
3. Create Tesseract worker: `await createWorker(['pol', 'eng'])`
4. For each page image: `await worker.recognize(imageBuffer)` -> collect text
5. `await worker.terminate()` in finally block (ALWAYS terminate)
6. Return all page texts joined with `'\n\n'`

**Error handling:**
- Per-page errors: log and skip, continue with remaining pages
- If all pages fail: return `''`
- Worker termination in `finally` block ensures no leak

### 3. Modify `extractTextFromBuffer` PDF branch

Current code (lines 39-42):
```typescript
if (fileType === "pdf") {
    const parsed = await pdfParse(buffer);
    return (parsed.text || "").trim();
}
```

New code:
```typescript
if (fileType === "pdf") {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length > 0) return text; // fast path

    // Fallback: OCR for scanned PDFs
    console.warn('[OCR fallback] pdf-parse returned empty text — running Tesseract OCR');
    const ocrText = await extractTextViaOcr(buffer);
    return ocrText;
}
```

## Success Criteria
- Scanned PDF -> OCR extracts text successfully
- Text-layer PDF -> fast pdf-parse path (no OCR invoked)
- Console warning logged when OCR fallback triggered
- Empty string returned if both paths fail (no throw)
- Tesseract worker always terminated (no leak)
- `npm run build` passes

## Risk Mitigations
- pdfjs-dist legacy build used for Node.js compatibility
- Scale 2.0 for viewport gives good OCR resolution
- Per-page error handling prevents one bad page from failing entire document
- try/finally on worker ensures cleanup
