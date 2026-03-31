# Plan 047 — Citation Quality: Page Numbers + Per-Item List Citations

## Status
- [ ] Task 1 — Fix PDF page number extraction (process pipeline)
- [ ] Task 2 — Add force-reprocess button for already-processed documents
- [ ] Task 3 — Improve system prompt for per-item citations in lists

## Background

After Plans 042–046, the citation system architecture is correct, but two data quality issues remain:

1. **Wrong page numbers in hover cards** — all PDF chunks are stored with `page_number = 1` because the page splitting code relies on `\f` (form feed) characters between pages in `pdfData.text`. Most PDF generators do not emit `\f`, so the entire document is treated as one page. Every chunk gets `pageNumber = i + 1 = 1`.

2. **Per-item citations in lists point to the wrong chunk** — when Claude generates an enumerated list (e.g., "list of evidence"), it cites the section header chunk for every item instead of the specific chunk where each item appears. This results in all list items sharing the same hover card despite coming from different parts of the document.

### Architecture Context

```
PDF upload → POST /api/documents/[id]/process
  ├── pdfParse(fileBuffer) → pdfData.text (concatenated, \f-separated if any)
  ├── pdfData.text.split("\f")  ← BUG: most PDFs have no \f
  │     → single element array → all chunks get pageNumber = 1
  └── chunkTextByPages(pages) → chunks with wrong page_number

Fix: use pdf-parse pagerender callback → correct per-page text + page numbers
```

### Key Files

| File | Role |
|------|------|
| `src/app/api/documents/[id]/process/route.ts` | PDF indexing pipeline |
| `src/components/documents/document-card.tsx` | Document card UI (process button only shown for unprocessed docs) |
| `src/app/(app)/documents/page.tsx` | Documents page — process handler |
| `lib/chunker.js` | `chunkTextByPages` — page-aware chunker (no changes needed) |
| `prompts/case-chat-grounded.md` | System prompt — citation rules |
| `messages/en.json`, `messages/pl.json` | i18n strings |

### Data Types

- **`RetrievalResult`**: `{ chunkId, documentId, documentName, pageNumber: number|null, content, sectionTitle, sentences }` — `pageNumber` flows from DB `page_number` column
- **`CitationRecord`**: `{ chunkId, documentId, documentName, page: number|null, sentenceHit, sentenceBefore, sentenceAfter }` — `page` is set from `chunk.pageNumber`

---

## Tasks

---

### Task 1 — Fix PDF page number extraction

**Goal:** Extract per-page text from PDFs using `pdf-parse`'s `pagerender` callback, which provides the correct page number from the PDF engine instead of inferring it from `\f` character position.

**Files to change:**
- `src/app/api/documents/[id]/process/route.ts`

**What to change:**

Replace the current `\f`-split approach:
```js
// BEFORE (broken)
const pdfData = await pdfParse(fileBuffer);
const pageTexts = pdfData.text.split("\f").filter((t: string) => t.trim().length > 0);
const pages = pageTexts.map((t: string, i: number) => ({ pageNumber: i + 1, text: t }));
```

With the `pagerender` callback approach:
```js
// AFTER (correct)
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

// Sort by pageNumber (pagerender callbacks are ordered but sort is defensive)
const pages = pageTexts
  .sort((a, b) => a.pageNumber - b.pageNumber)
  .filter((p) => p.text.trim().length > 0);
```

The rest of the chunking pipeline is unchanged — `chunkTextByPages(pages)` already handles the `{pageNumber, text}[]` format correctly.

**Note on existing documents:** Documents already processed with wrong page numbers are unaffected by this change. They need to be reprocessed via the UI (see Task 2). The current skip-if-unchanged check must be bypassed for reprocessing — Task 2 handles this.

**Success criteria:**
- After reprocessing a multi-page PDF, chunk `page_number` values in the DB reflect actual PDF page numbers (not all 1s).
- For a PDF with content on pages 1, 3, 7: chunks contain `page_number = 1`, `page_number = 3`, `page_number = 7`.
- Single-page PDFs still work (single chunk, `page_number = 1`).
- Non-PDF documents remain unaffected (`page_number = null`).
- Existing tests pass.

**Dependencies:** none

---

### Task 2 — Add force-reprocess button for already-processed documents

**Goal:** Allow users to trigger reprocessing of already-processed documents (to fix page numbers from Task 1). Currently the Process button is only shown when `!doc.processed`. This task adds a visible "Reprocess" icon button for processed documents and adds a `?force=true` parameter to bypass the content-hash skip check in the route.

**Files to change:**
- `src/app/api/documents/[id]/process/route.ts` — accept `?force=true` query param
- `src/components/documents/document-card.tsx` — add reprocess button for processed docs
- `src/app/(app)/documents/page.tsx` — pass `force=true` to the fetch call for reprocess
- `messages/en.json` — add `documents.card.reprocessDocument` i18n key
- `messages/pl.json` — add Polish equivalent

**What to change:**

**A — Route (`process/route.ts`):**
```ts
// At the start of the POST handler, after parsing documentId:
const url = new URL(request.url);
const force = url.searchParams.get("force") === "true";

// In the content-hash skip check:
if (!force && document.processed === 1 && document.content_hash === contentHash) {
  return NextResponse.json({ ..., skipped: true });
}
```

**B — Document card (`document-card.tsx`):**
In the `{doc.processed ? (...) : ...}` branch, add a "Reprocess" button alongside the existing Download and Retag buttons:
```tsx
{canEdit && (
  <Button
    variant="ghost"
    size="icon"
    className="h-7 w-7"
    onClick={() => onReprocess(doc.id)}
    disabled={processing}
    title={t('card.reprocessDocument')}
  >
    <RefreshCw className="h-3.5 w-3.5" />
  </Button>
)}
```

Add `onReprocess: (id: number) => void` to the component props alongside existing `onProcess`.

**C — Documents page (`page.tsx`):**
Add a `handleReprocess` handler that calls `POST /api/documents/${id}/process?force=true`. Wire it to the new `onReprocess` prop. Reuse the existing `processingIds` state for the loading indicator.

**D — i18n:**
- `en.json`: `"reprocessDocument": "Reprocess document"` under `documents.card`
- `pl.json`: `"reprocessDocument": "Przeindeksuj dokument"` under `documents.card`

**Success criteria:**
- A "Reprocess" (`RefreshCw`) button appears on already-processed document cards (for users with edit permission).
- Clicking it calls `POST /api/documents/{id}/process?force=true`, bypassing the content-hash skip check.
- The button shows a loading state while reprocessing.
- After reprocessing, page numbers in chunks reflect actual PDF pages.
- The existing unprocessed-document "Process" button (Play icon) behavior is unchanged.
- i18n key exists in both en.json and pl.json.
- TypeScript: no errors.

**Dependencies:** none (independent of Task 1, though functionally useful after Task 1)

---

### Task 3 — Improve system prompt for per-item citations in lists

**Goal:** Instruct Claude to cite the most specific chunk for each item in an enumerated list, rather than repeating the section header chunk for all items.

**Files to change:**
- `prompts/case-chat-grounded.md`

**What to change:**

In the `**Zasady cytowania:**` section, add one rule after the "Maksymalnie 1 znacznik na zdanie" line:

```markdown
- W listach enumerowanych każdy element cytuj fragmentem bezpośrednio go zawierającym — jeśli element A pochodzi z [CHUNK:11] a element B z [CHUNK:12], wstaw [cit:11] po A i [cit:12] po B. Nie cytuj nagłówka sekcji jeśli dostępny jest fragment z treścią konkretnego elementu.
```

Translation: "In enumerated lists, cite each item with the chunk that directly contains it — if item A comes from [CHUNK:11] and item B from [CHUNK:12], insert [cit:11] after A and [cit:12] after B. Do not cite the section header if a chunk with the specific item's content is available."

**Success criteria:**
- When Claude returns a list of evidence items sourced from different chunks, each list item carries its own `[cit:X]` marker pointing to the specific chunk where that item appears.
- When all list items genuinely come from the same chunk (e.g., a short list on one page), it's acceptable to cite the same chunk for all — the rule only activates when different chunks are available.
- Existing `citation-assembler.test.ts` tests continue to pass (prompt change does not affect assembler).
- No regression: metadata-only answers (no document chunks) still produce no citation markers.

**Dependencies:** none

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `pagerender` callback not available in the installed `pdf-parse` version | Low | pdf-parse uses pdfjs-dist internally and has supported `pagerender` since v1.x; the callback receives the PDFPageProxy object |
| `pagerender` fires in non-sequential order | Low | Sort `pageTexts` by `pageNumber` before building `pages` array |
| Force-reprocess on large documents causes timeout | Medium | Process route already handles large docs sequentially; `force=true` doesn't change pipeline complexity |
| Prompt addition causes Claude to over-fragment citations on non-list answers | Low | The rule is conditional on "enumerated lists" — won't affect paragraph-form answers |
| Existing documents with correct page_number (if any) are accidentally re-indexed | Not possible | Only changes: (1) new indexing pipeline for new docs, (2) force-reprocess only triggered by explicit user click |

## Out of Scope

- Re-indexing all existing documents automatically (user controls reprocessing per-document)
- Improving chunk granularity for sub-paragraph item resolution
- Streaming citations
- PDF page navigation improvement (the `#page=N` anchor in the download link depends on the browser's PDF viewer; no server-side change needed)
