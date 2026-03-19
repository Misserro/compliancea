# Plan 025 — Citation UI: Fix Citations Pipeline + Multi-Document Hover Cards

**Status:** Draft
**Module:** Legal Hub — Case Chat Citation UI
**Depends on:** Plans 023 (RAG pipeline) and 024 (unified retrieval)

---

## Problem Statement

Citations are completely non-functional. The hover cards never appear because upstream bugs cause `annotations` to always be empty:

1. **System prompt template confusion** — `case-chat-grounded.md` uses the literal placeholder string `"chunkId"` as the citations dict key in the JSON example. Claude copies this literally, outputting `"chunkId"` as the key instead of the actual number. The fabrication guard rejects `"chunkId"` as it's not in the retrieved chunk set — all citations are silently dropped.

2. **Parser brittle to Claude output format** — `parseCitationResponse` uses `Object.entries(citations)` which assumes a dict. If Claude outputs citations as an array of objects (a common LLM tendency), the array index keys (`"0"`, `"1"`) fail the fabrication guard.

3. **UI silently drops multi-citation** — Even when citations are present, `annotated-answer.tsx` only uses `citationIds[0]`, losing all but the first citation for multi-document spans.

4. **"Open document" has no page jump** — The link goes to the raw download endpoint without `#page=N`, so users land at page 1.

---

## Goal

1. Fix the system prompt to use a concrete example that Claude can reliably follow
2. Make `parseCitationResponse` robust to both dict and array citation formats
3. Fix `annotated-answer.tsx` to pass ALL citations per span to the hover card
4. Fix `citation-hover-card.tsx` to render a vertical list for multiple citations
5. Fix "Open document" URL to include `#page=N`

---

## Implementation Tasks

### Task 1 — Fix System Prompt + Parser Robustness

**Scope:** Fix the two bugs that prevent any citations from appearing.

**Files to modify:**

**`prompts/case-chat-grounded.md`** — Replace the JSON example section with a concrete, unambiguous example:

The current example:
```json
"citations": { "chunkId": { "documentId": "id dokumentu", ... } }
```

Replace with a concrete numbered example that makes clear the key is the actual chunk ID number as a string:
```json
Przykładowy format (klucze to rzeczywiste numery chunków z nagłówków [CHUNK:N|...]):
{
  "answerText": "Umowa wygasa 14 marca 2026 r.[cit:42] Termin wypowiedzenia wynosi 30 dni.[cit:42][cit:51]",
  "citations": {
    "42": {
      "documentId": 3,
      "documentName": "Umowa_najmu.pdf",
      "page": 4,
      "sentenceHit": "Umowa wygasa 14 marca 2026 r.",
      "sentenceBefore": "Strony zawarły umowę na czas określony.",
      "sentenceAfter": "Po upływie terminu umowa nie ulega przedłużeniu."
    },
    "51": {
      "documentId": 5,
      "documentName": "Aneks_nr2.pdf",
      "page": 2,
      "sentenceHit": "Termin wypowiedzenia wynosi 30 dni.",
      "sentenceBefore": "",
      "sentenceAfter": "Wypowiedzenie wymaga formy pisemnej."
    }
  }
}
```

Also add explicit rule: "Kluczem w obiekcie citations musi być dokładna liczba (jako string) z nagłówka [CHUNK:N|...]. Na przykład dla [CHUNK:42|DOC:3|PAGE:4] kluczem jest \"42\"."

**`lib/citation-assembler.js`** — Add array-format fallback in `parseCitationResponse`:

After `const rawCitations = parsed.citations || {};`, add normalization:
```js
// Normalize: if Claude outputs citations as an array [{"chunkId": 42, ...}],
// convert to dict {"42": {...}} format
let citationsDict = rawCitations;
if (Array.isArray(rawCitations)) {
  citationsDict = {};
  for (const item of rawCitations) {
    const key = item.chunkId != null ? String(item.chunkId) : null;
    if (key) citationsDict[key] = item;
  }
}
// Then iterate citationsDict instead of rawCitations
```

**Success criteria:**
- When the backend returns a chat answer that references a retrieved document chunk, `parseCitationResponse` produces non-empty `annotations[]` and `citations[]`
- The `isStructuredAnswer` guard passes and `AnnotatedAnswer` is rendered
- Even if Claude outputs citations as an array format, the parser handles it gracefully

---

### Task 2 — Fix AnnotatedAnswer + CitationHoverCard for Multi-Citation + Page Jump

**Scope:** Fix the UI to show all citations per span and navigate to the right page.

**Files to modify:**

**`src/components/legal-hub/annotated-answer.tsx`**:

1. Change `splitIntoSegments` to collect ALL matching `CitationRecord[]`:
   ```ts
   const matchedCitations = annotation.citationIds
     .map(id => answer.citations.find(c => c.chunkId === id))
     .filter((c): c is CitationRecord => c !== undefined);
   if (matchedCitations.length === 0) { /* render plain text, skip */ }
   ```
2. Pass `citations={matchedCitations}` (plural array) to `<CitationHoverCard>`
3. Add annotation validation: skip if `start >= end`, `start < 0`, `end > answerText.length`, or no matching citations
4. Wrap segment computation in `useMemo`

**`src/components/legal-hub/citation-hover-card.tsx`**:

Change prop from `citation: CitationRecord` to `citations: CitationRecord[]`.

Single citation layout (unchanged visual):
```
┌─────────────────────────────────────┐
│ DocumentName.pdf              p. 3  │
├─────────────────────────────────────┤
│ sentenceBefore (muted text)         │
│ sentenceHit (font-medium, bg tint)  │
│ sentenceAfter (muted text)          │
├─────────────────────────────────────┤
│ ↗ Open document                     │
└─────────────────────────────────────┘
```

Multiple citations — vertical list with Separator between each:
```
┌─────────────────────────────────────┐
│ DocumentA.pdf                 p. 3  │
│ sentenceBefore (muted)              │
│ sentenceHit (highlighted)           │
│ sentenceAfter (muted)               │
│ ↗ Open DocumentA                    │
├─ separator ─────────────────────────┤
│ DocumentB.pdf                 p. 7  │
│ ...                                 │
│ ↗ Open DocumentB                    │
└─────────────────────────────────────┘
```

Max card: `max-w-[360px]`, `max-h-[400px] overflow-y-auto` when multiple citations.

**Fix "Open document" URL:**
```ts
href={`/api/documents/${citation.documentId}/download${citation.page ? `#page=${citation.page}` : ''}`}
```

**Trigger span styling:**
- `underline decoration-dotted decoration-muted-foreground/50 cursor-help`
- Hover/focus: `hover:decoration-foreground/70 focus:decoration-foreground/70`
- `tabIndex={0}` for keyboard access
- `aria-describedby={popoverId}` pointing to the HoverCard.Content

**Success criteria:**
- Hover or Tab to a cited span opens the citation card
- Card shows: document name, page badge, sentenceBefore (muted), sentenceHit (highlighted), sentenceAfter (muted), "Open document" link
- When span has two citations from different documents: both appear in the card separated by a divider
- Clicking "Open document" opens PDF in a new tab and jumps to the cited page (browser native `#page=N`)
- Pressing Escape closes the card
- Malformed annotations (bad offsets, missing citations) render as plain text, no crash

---

## Task Dependencies

Task 2 depends on Task 1 (fixes must land before UI is testable end-to-end).

---

## Key Files Changed

| File | Change |
|---|---|
| `prompts/case-chat-grounded.md` | Fix JSON example to use concrete chunk IDs |
| `lib/citation-assembler.js` | Add array-format fallback for citations normalization |
| `src/components/legal-hub/annotated-answer.tsx` | Pass all citationIds, add validation |
| `src/components/legal-hub/citation-hover-card.tsx` | Accept citations[], render vertical list, fix page URL |

---

- [ ] Task 1: Fix System Prompt + Parser Robustness
- [ ] Task 2: Fix AnnotatedAnswer + CitationHoverCard for Multi-Citation + Page Jump
