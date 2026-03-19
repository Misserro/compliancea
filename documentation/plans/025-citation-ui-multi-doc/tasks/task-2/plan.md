# Task 2 — Fix AnnotatedAnswer + CitationHoverCard for Multi-Citation

## Summary

Two files need changes to support multiple citations per annotated span and fix the "Open document" page jump URL.

---

## File 1: `src/components/legal-hub/annotated-answer.tsx`

### Change 1: Update Segment type to hold multiple citations

**Current (line 20-23):**
```ts
interface Segment {
  text: string;
  citation: CitationRecord | null;
}
```

**New:**
```ts
interface Segment {
  text: string;
  citations: CitationRecord[];
}
```

### Change 2: Add annotation validation and collect all citations in `splitIntoSegments`

**Current (line 38-59):** Takes only `citationIds[0]`, no validation on annotation bounds.

**New logic:**
```ts
function splitIntoSegments(
  text: string,
  annotations: Annotation[],
  citations: CitationRecord[]
): Segment[] {
  if (!annotations || annotations.length === 0) {
    return [{ text, citations: [] }];
  }

  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const ann of sorted) {
    // Validate annotation bounds
    if (ann.start < 0 || ann.end > text.length || ann.start >= ann.end) continue;
    // Skip overlapping
    if (ann.start < cursor) continue;

    // Plain text before this annotation
    if (ann.start > cursor) {
      segments.push({ text: text.slice(cursor, ann.start), citations: [] });
    }

    // Collect ALL matching citations
    const matchedCitations = (ann.citationIds ?? [])
      .map(id => citations.find(c => c.chunkId === id))
      .filter((c): c is CitationRecord => c !== undefined);

    if (matchedCitations.length === 0) {
      // No valid citations — render as plain text
      segments.push({ text: text.slice(ann.start, ann.end), citations: [] });
    } else {
      segments.push({
        text: text.slice(ann.start, ann.end),
        citations: matchedCitations,
      });
    }

    cursor = ann.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), citations: [] });
  }

  return segments;
}
```

### Change 3: Wrap segment computation in `useMemo`

**Current (line 79-83):** Computed inline on every render.

**New:**
```ts
import { useMemo } from "react";

// Inside AnnotatedAnswer:
const segments = useMemo(
  () => splitIntoSegments(answer.answerText, answer.annotations, answer.citations),
  [answer.answerText, answer.annotations, answer.citations]
);
```

### Change 4: Update JSX to use `citations` (plural) and pass array to CitationHoverCard

**Current (line 87-98):** Checks `segment.citation` (singular), passes single citation.

**New:**
```tsx
{segments.map((segment, i) => {
  if (segment.citations.length === 0) {
    return <span key={i}>{segment.text}</span>;
  }

  return (
    <CitationHoverCard key={i} citations={segment.citations}>
      <span
        className="underline decoration-dotted decoration-muted-foreground/50 cursor-help hover:decoration-foreground/70 focus:decoration-foreground/70"
        tabIndex={0}
      >
        {segment.text}
      </span>
    </CitationHoverCard>
  );
})}
```

---

## File 2: `src/components/legal-hub/citation-hover-card.tsx`

### Change 1: Update props from single citation to array

**Current (line 16-19):**
```ts
interface CitationHoverCardProps {
  citation: CitationRecord;
  children: React.ReactNode;
}
```

**New:**
```ts
interface CitationHoverCardProps {
  citations: CitationRecord[];
  children: React.ReactNode;
}
```

### Change 2: Extract a single-citation renderer

Create a `CitationEntry` component to render one citation's content (doc name + page, 3-sentence context, open link). This avoids duplication when mapping over the array.

### Change 3: Render vertical list with Separator

**Current (line 36):** Single citation content in a `max-h-[200px]` div.

**New:**
- Widen card: `max-w-[360px]`
- Conditional scroll: `max-h-[400px] overflow-y-auto` when `citations.length > 1`
- Map over `citations` array, render `<CitationEntry>` for each
- Insert `<Separator className="my-3" />` between entries (not after last)
- Import `Separator` from `@/components/ui/separator`

### Change 4: Fix "Open document" URL with page jump

**Current (line 69):**
```ts
href={`/api/documents/${citation.documentId}/download`}
```

**New:**
```ts
href={`/api/documents/${c.documentId}/download${c.page ? `#page=${c.page}` : ''}`}
```

---

## Validation & Error Handling

- Annotations with `start >= end`, `start < 0`, or `end > text.length` are skipped (rendered as plain text gap is filled by next segment or trailing text)
- Annotations with no matching citations render as plain text (no hover card)
- Empty `citations` array on a segment = plain text span, no crash

## Testing Checklist

- [ ] Single citation span shows hover card with document info
- [ ] Multi-citation span shows vertical list with Separator
- [ ] "Open document" link includes `#page=N`
- [ ] Malformed annotations render as plain text
- [ ] `npm test` passes
- [ ] `tsc` clean
