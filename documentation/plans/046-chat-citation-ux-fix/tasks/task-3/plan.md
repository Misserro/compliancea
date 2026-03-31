# Task 3 — Hover Card Scrollbar Fix

## Summary
Remove the `max-h-[400px] overflow-y-auto` wrapper div inside `CitationHoverCard` so citations render directly inside `HoverCard.Content` without a scroll container.

## Files to modify
- `src/components/legal-hub/citation-hover-card.tsx` (lines 88-95) — remove the wrapper `<div className="max-h-[400px] overflow-y-auto">` and its closing `</div>`, keeping the `citations.map(...)` block and `HoverCard.Arrow` as direct children of `HoverCard.Content`.

## Change detail

**Before (lines 87-96):**
```tsx
<HoverCard.Content ...>
  <div className="max-h-[400px] overflow-y-auto">
    {citations.map((c, i) => (
      <div key={c.chunkId}>
        {i > 0 && <Separator className="my-3" />}
        <CitationEntry citation={c} />
      </div>
    ))}
  </div>
  <HoverCard.Arrow className="fill-border" />
</HoverCard.Content>
```

**After:**
```tsx
<HoverCard.Content ...>
  {citations.map((c, i) => (
    <div key={c.chunkId}>
      {i > 0 && <Separator className="my-3" />}
      <CitationEntry citation={c} />
    </div>
  ))}
  <HoverCard.Arrow className="fill-border" />
</HoverCard.Content>
```

## Success criteria
- Hover card displays without a scrollbar
- Hover card height fits citation content naturally
- Multiple citations with Separator are all visible without scrolling
- No regressions in citation rendering

## Risks
- Low: Removing max-height could cause tall hover cards for many citations. Mitigated by Radix `avoidCollisions` and Task 1 reducing citation count to 3-5.
