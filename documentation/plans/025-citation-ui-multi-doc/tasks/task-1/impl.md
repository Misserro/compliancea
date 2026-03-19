# Task 1 — Implementation Notes

## Changes Made

### 1. `prompts/case-chat-grounded.md`

Replaced the JSON format section (lines 29-43) that used literal `"chunkId"` as a placeholder key with:

- Explicit rule stating keys must be exact chunk ID numbers as strings from `[CHUNK:N|...]` headers
- Concrete example with two citations (`"42"` and `"51"`) showing real chunk IDs as keys
- `answerText` demonstrating both single (`[cit:42]`) and multi-citation (`[cit:42][cit:51]`) markers

### 2. `lib/citation-assembler.js`

Added array-to-dict normalization in `parseCitationResponse` (after line 90):

- If `parsed.citations` is an array `[{chunkId: 42, ...}]`, converts to dict `{"42": {...}}`
- Filters out items with null/undefined `chunkId`
- Uses `citationsDict` in the `Object.entries()` loop instead of `rawCitations`

## Verification

- `tsc --noEmit`: clean, no errors
- `npm test`: 65/65 tests pass across 4 test files
- No stale `rawCitations` references after normalization block
