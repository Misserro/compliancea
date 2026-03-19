# Task 4 — Citation Hover Card UI — Implementation

## Changes Made

### 1. Installed `@radix-ui/react-hover-card` (dependency)
- Added to package.json as `^1.1.15`

### 2. `src/components/legal-hub/citation-hover-card.tsx` (NEW)
- Radix HoverCard component wrapping citation context
- Props: `citation: CitationRecord`, `children: React.ReactNode`
- openDelay=300ms, closeDelay=150ms
- `asChild` on Trigger to avoid `<button>` inside `<p>` (invalid HTML)
- Portal used to escape overflow:hidden on parent containers
- Content: document name (bold) + page badge, 3-sentence context (before=muted, hit=highlighted yellow, after=muted), "Open document" link
- Download link: `/api/documents/${documentId}/download` (global route, since documentId is the global document ID from chunks table)
- documentId > 0 guard on the link (reviewer note #2)
- max-h-[200px] overflow-y-auto for long content
- Arrow component pointing to trigger

### 3. `src/components/legal-hub/annotated-answer.tsx` (NEW)
- Splits `answerText` by annotation character offsets into plain/annotated segments
- Annotations sorted by `start` ascending before splitting
- Overlapping annotations skipped (guard: `ann.start < cursor`)
- Citation lookup: finds CitationRecord by `chunkId` matching `citationIds[0]`; renders as plain text if not found (reviewer note #4)
- Annotated spans: `border-b border-dotted border-muted-foreground/50 cursor-help` — subtle, no bold, no color on text
- Empty annotations or empty answerText: falls back to plain render / returns null

### 4. `src/components/legal-hub/case-chat-panel.tsx` (MODIFIED)
- **Response parsing**: `isStructuredAnswer()` type guard with `Array.isArray` checks on annotations and citations (reviewer note #1)
- **Structured path**: renders `<AnnotatedAnswer>` when structured response detected
- **Plain text fallback**: if response doesn't match StructuredAnswer shape, renders as plain `<p>` (backward compat)
- **Low confidence indicator**: shows Polish-language note when `confidence === "low"`
- **Indexing status banner**: polls `/api/legal-hub/cases/{id}/documents/status` on mount; shows amber banner with count of processing documents; polls every 10s while any document is processing; silently handles 404/errors (Task 5 endpoint may not exist yet)
- **Removed**: `Source` interface, `SourceCard` component, `sources` field on ChatMessage — no longer needed since all responses now use StructuredAnswer format with citations in hover cards
- **Kept unchanged**: error state, loading spinner, example prompts, message history, input handling

## Type Mapping (Frontend ↔ Backend)

| Frontend (TypeScript) | Backend (JSDoc in citation-assembler.js) |
|---|---|
| `CitationRecord.chunkId: number` | `CitationRecord.chunkId: number` |
| `CitationRecord.documentId: number` | `CitationRecord.documentId: number` |
| `CitationRecord.page: number \| null` | `CitationRecord.page: number\|null` |
| `Annotation.citationIds: number[]` | `Annotation.citationIds: number[]` |
| `StructuredAnswer.citations: CitationRecord[]` | `StructuredAnswer.citations: CitationRecord[]` (array) |
| `StructuredAnswer.confidence: "high" \| "low"` | `"high" \| "low"` (two-tier in practice) |

## Files Changed
- `package.json` / `package-lock.json` — new dependency
- `src/components/legal-hub/citation-hover-card.tsx` — NEW
- `src/components/legal-hub/annotated-answer.tsx` — NEW
- `src/components/legal-hub/case-chat-panel.tsx` — MODIFIED
