# Operational Report — Plan 025: Citation UI Fix

**Date:** 2026-03-19
**Status:** Complete
**Tasks:** 2/2 completed

---

## Summary

All four root-cause bugs preventing citations from appearing in the Legal Hub case chat have been fixed. The citations pipeline is now functional end-to-end: the system prompt guides Claude to use real chunk IDs as citation keys, the parser handles both dict and array output formats, the UI renders all citations per span (not just the first), and "Open document" links jump to the correct PDF page.

---

## Task 1 — Fix System Prompt + Parser Robustness

**Status:** COMPLETED

### Problem Fixed
The system prompt (`prompts/case-chat-grounded.md`) used the literal string `"chunkId"` as a placeholder key in its JSON example. Claude copied this literally, outputting `{"chunkId": {...}}`. The fabrication guard checked `chunkMap.has("chunkId")` which always returned false — all citations were silently dropped, resulting in `annotations = []` and no hover cards ever appearing.

### Changes
| File | Change |
|------|--------|
| `prompts/case-chat-grounded.md` | Replaced placeholder JSON example with concrete numbered example using real chunk IDs (`"42"`, `"51"`); added explicit rule stating keys must be exact chunk number strings from `[CHUNK:N|...]` headers |
| `lib/citation-assembler.js` | Added array-to-dict normalization in `parseCitationResponse`: if Claude outputs citations as `[{chunkId: 42, ...}]`, converts to `{"42": {...}}` before the fabrication guard runs |

### Verification
- `tsc --noEmit`: clean
- `npm test`: 65/65 tests pass

---

## Task 2 — Fix AnnotatedAnswer + CitationHoverCard

**Status:** COMPLETED

### Problems Fixed
1. `annotated-answer.tsx` only used `citationIds[0]`, losing all but the first citation per span
2. `citation-hover-card.tsx` accepted a single `CitationRecord`, making multi-document spans impossible to display
3. "Open document" URL lacked `#page=N`, always landing users at page 1
4. No bounds validation on annotations — malformed offsets could cause crashes

### Changes
| File | Change |
|------|--------|
| `src/components/legal-hub/annotated-answer.tsx` | Collects ALL matching `CitationRecord[]` per annotation; adds bounds validation (skip if `start < 0`, `end > text.length`, `start >= end`, or no matches); wraps segment computation in `useMemo`; updated trigger span styling with `underline decoration-dotted`, `tabIndex={0}`, keyboard hover support |
| `src/components/legal-hub/citation-hover-card.tsx` | Prop changed from `citation: CitationRecord` to `citations: CitationRecord[]`; extracted `CitationEntry` sub-component; renders vertical list with `<Separator>` between entries; multi-citation wrapper adds `max-h-[400px] overflow-y-auto`; card widened to `max-w-[360px]`; "Open document" URL appends `#page=N` when available |

### Verification
- `tsc --noEmit`: clean
- `npm test`: 65/65 tests pass
- No other consumers of `CitationHoverCard` affected

---

## Pipeline Execution

| Event | Details |
|-------|---------|
| Task 1 spawned | planning → implementation → review → completed |
| Task 2 pipeline-spawned | Began planning in parallel during Task 1 review |
| Task 1 completed | Task 2 unblocked and approved for implementation |
| Task 2 proceeded | implementation → review → completed |

Sequential execution with pipeline pre-planning overlap worked as designed.

---

## Files Changed

| File | Plan Section |
|------|-------------|
| `prompts/case-chat-grounded.md` | Task 1 |
| `lib/citation-assembler.js` | Task 1 |
| `src/components/legal-hub/annotated-answer.tsx` | Task 2 |
| `src/components/legal-hub/citation-hover-card.tsx` | Task 2 |
