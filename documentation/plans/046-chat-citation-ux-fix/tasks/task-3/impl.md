## Task 3 Complete — Hover card scrollbar fix

- Modified: `src/components/legal-hub/citation-hover-card.tsx` (lines 88-95)
  - Removed the `<div className="max-h-[400px] overflow-y-auto">` wrapper div
  - Citations now render directly inside `HoverCard.Content` without a scroll container
- No other files changed
- TypeScript type check passes with no errors
- Radix `avoidCollisions` on `HoverCard.Content` handles viewport boundary positioning
