# Task 1 — Fix PDF Page Number Extraction — Implementation Plan

## Summary

Replace the `\f`-split approach in the PDF processing branch of `src/app/api/documents/[id]/process/route.ts` with `pdf-parse`'s `pagerender` callback to get accurate per-page text with correct page numbers.

## File Changes

### `src/app/api/documents/[id]/process/route.ts` (modify)

**Lines 380-383 — Replace the PDF text extraction logic:**

Current code:
```ts
const fileBuffer = await fs.readFile(document.path);
const pdfData = await pdfParse(fileBuffer);
const pageTexts = pdfData.text.split("\f").filter((t: string) => t.trim().length > 0);
const pages = pageTexts.map((t: string, i: number) => ({ pageNumber: i + 1, text: t }));
```

New code:
```ts
const fileBuffer = await fs.readFile(document.path);
const pageTexts: { pageNumber: number; text: string }[] = [];

function renderPage(pageData: any): Promise<string> {
  return pageData.getTextContent({ normalizeWhitespace: false })
    .then((tc: any) => {
      const text = tc.items.map((item: any) => item.str).join(' ');
      pageTexts.push({ pageNumber: pageData.pageNumber, text });
      return text;
    });
}

await pdfParse(fileBuffer, { pagerender: renderPage });

const pages = pageTexts
  .sort((a, b) => a.pageNumber - b.pageNumber)
  .filter((p) => p.text.trim().length > 0);
```

**Key observations:**
- `pdfData` (the return value of `pdfParse`) is NOT used for anything else in the PDF branch — only `pdfData.text` was used for the split, which we replace entirely
- `fileBuffer` is already read on line 380 — no change needed there
- The `chunkTextByPages(pages)` call on line 385 remains unchanged — it already accepts `{pageNumber: number, text: string}[]`
- The rest of the PDF branch (lines 386-409) is unchanged

## How Success Criteria Are Met

1. **Correct page numbers**: `pageData.pageNumber` is the 1-based page number from PDF.js, so chunks get the real page number
2. **Sparse pages (1, 3, 7)**: Empty pages are filtered out by `.filter((p) => p.text.trim().length > 0)`, so only pages with content produce chunks
3. **Single-page PDFs**: One pagerender callback fires with pageNumber=1, producing a single page entry
4. **Non-PDF documents**: The `else` branch (lines 410-436) is untouched — non-PDFs still get `pageNumber: null`
5. **TypeScript**: Will verify with `npx tsc --noEmit`

## Risks

- Low: `pagerender` callback API depends on pdf-parse passing the PDFPageProxy object. This is documented behavior and confirmed in the lead notes.
- Defensive sort ensures correctness even if callbacks fire out of order.
