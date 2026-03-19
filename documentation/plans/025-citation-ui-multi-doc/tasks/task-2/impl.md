# Task 2 Implementation — AnnotatedAnswer + CitationHoverCard Multi-Citation

## Status: Complete

## Files Modified

### `src/components/legal-hub/annotated-answer.tsx`
- Changed `Segment.citation: CitationRecord | null` to `Segment.citations: CitationRecord[]`
- `splitIntoSegments` now collects ALL matching CitationRecords per annotation instead of only `citationIds[0]`
- Added annotation bounds validation: skip if `start < 0`, `end > text.length`, or `start >= end`
- Annotations with no matching citations render as plain text (no crash)
- Wrapped segment computation in `useMemo`
- Updated trigger span styling: `underline decoration-dotted` with `hover:decoration-foreground/70` and `tabIndex={0}` for keyboard access
- Passes `citations` array (plural) to `CitationHoverCard`

### `src/components/legal-hub/citation-hover-card.tsx`
- Changed prop from `citation: CitationRecord` to `citations: CitationRecord[]`
- Extracted `CitationEntry` sub-component for rendering a single citation's layout
- Maps over `citations` array with `<Separator className="my-3" />` between entries
- Multi-citation wrapper: `max-h-[400px] overflow-y-auto` (only when > 1 citation)
- Widened card from `max-w-[320px]` to `max-w-[360px]`
- Fixed "Open document" URL: appends `#page=N` when page is available
- Imported `Separator` from `@/components/ui/separator`

## Verification
- `tsc --noEmit`: clean (no errors)
- `npm test`: 65/65 passed (4 test files)
- No other consumers of `CitationHoverCard` besides `annotated-answer.tsx`
