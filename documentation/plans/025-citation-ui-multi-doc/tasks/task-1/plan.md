# Task 1 — Fix System Prompt + Parser Robustness

## Problem

Citations are completely non-functional due to two bugs:

1. **System prompt** (`prompts/case-chat-grounded.md`, line 33-34): The JSON example uses `"chunkId"` as a literal key in the citations dict. Claude copies this literally, producing `{"chunkId": {...}}`. The fabrication guard in `parseCitationResponse` checks `chunkMap.has("chunkId")` which is always `false` — all citations are dropped.

2. **Parser brittleness** (`lib/citation-assembler.js`, line 90-93): `parseCitationResponse` does `Object.entries(rawCitations)` which assumes a dict. If Claude outputs citations as an array `[{chunkId: 42, ...}]`, the keys become `"0"`, `"1"` — also rejected by the fabrication guard.

## Changes

### 1. `prompts/case-chat-grounded.md` — Fix JSON example

Replace lines 30-43 (the entire JSON format section) with a concrete example using real chunk IDs:

- Replace `"chunkId": { "documentId": "id dokumentu", ... }` with two concrete entries: `"42": {...}` and `"51": {...}`
- `answerText` shows `[cit:42]` and `[cit:42][cit:51]` usage
- Add explicit rule: keys must be the exact number from `[CHUNK:N|...]` headers, as a string

### 2. `lib/citation-assembler.js` — Add array-format fallback

After line 90 (`const rawCitations = parsed.citations || {};`), add normalization:

```js
let citationsDict = rawCitations;
if (Array.isArray(rawCitations)) {
  citationsDict = {};
  for (const item of rawCitations) {
    const key = item.chunkId != null ? String(item.chunkId) : null;
    if (key) citationsDict[key] = item;
  }
}
```

Then change line 93 to iterate `citationsDict` instead of `rawCitations`.

## Risk Assessment

- **Low risk**: Both changes are additive/corrective. The prompt fix is the primary fix. The parser fallback is defensive.
- **No breaking changes**: Existing (broken) behavior can only improve.
- **Testable**: Unit tests on `parseCitationResponse` can verify both dict and array input formats.

## Verification

- `npm test` passes
- `tsc` clean (no new type errors)
- `parseCitationResponse` produces non-empty `annotations[]` and `citations[]` when given valid input with concrete chunk IDs
