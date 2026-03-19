# Task 4 — Citation Hover Card UI — Implementation Plan

## Overview

Update the case chat frontend to parse structured JSON responses (StructuredAnswer from Task 3) and render annotated answer text with professional hover cards showing document name, page, and sentence context.

## Prerequisites

- Task 3 completed: `lib/citation-assembler.js` exports `StructuredAnswer` type, chat route returns structured JSON
- `@radix-ui/react-hover-card` must be installed (NOT currently in package.json)

## Pre-Implementation Step: Install Dependency

```bash
npm install @radix-ui/react-hover-card
```

## Type Definitions

The StructuredAnswer type from Task 3 (lib/citation-assembler.js) is expected to be:

```typescript
interface CitationRecord {
  id: string;          // chunkId as string
  documentId: number;
  documentName: string;
  page: number | null;
  sentenceBefore: string;
  sentenceHit: string;
  sentenceAfter: string;
  chunkId: number;
}

interface Annotation {
  start: number;       // char offset in answerText
  end: number;         // char offset in answerText
  citationIds: string[];
}

interface StructuredAnswer {
  answerText: string;
  annotations: Annotation[];
  citations: CitationRecord[];
  usedDocuments: { id: number; name: string }[];
  confidence: "high" | "medium" | "low";
  needsDisambiguation: boolean;
}
```

These types will be defined locally in the frontend files (duplicated from backend) since lib/ files are server-only JS. If a shared types file emerges from Task 3, we'll import from there instead.

**Note on `citations` shape:** The plan README shows `citations[]` as an array, but the knowledge agent suggests `Record<string, CitationRecord>` (keyed by chunkId). Implementation must check what Task 3 actually produces and adapt. The annotation lookup `answer.citations[citationId]` works naturally with a Record; if it's an array, use `.find(c => c.id === citationId)` instead.

## File 1: `src/components/legal-hub/citation-hover-card.tsx` (NEW)

### Purpose
Radix HoverCard wrapper that shows citation context on hover.

### Design Decisions
- Use `@radix-ui/react-hover-card` directly (not via a shadcn/ui wrapper — no hover-card.tsx exists in ui/)
- Follow the same Radix pattern as tooltip.tsx: import primitives, wrap with className styling
- openDelay: 300ms (responsive feel without accidental triggers; Radix default is 700ms)
- closeDelay: 150ms (prevents card from vanishing when moving mouse to it)
- Max width 320px, z-50, subtle border, bg-popover styling consistent with project

### Component Structure
```
HoverCardPrimitive.Root (openDelay=300, closeDelay=150)
  HoverCardPrimitive.Trigger (asChild)
    {children}  ← the annotated text span
  HoverCardPrimitive.Portal
    HoverCardPrimitive.Content (side="top", sideOffset=4, max-w-[320px])
      ┌─────────────────────────────┐
      │ Document Name (bold)  p. N  │  ← header row
      │─────────────────────────────│
      │ sentenceBefore (muted)      │  ← context before
      │ sentenceHit (highlighted)   │  ← evidence sentence
      │ sentenceAfter (muted)       │  ← context after
      │─────────────────────────────│
      │ [Open document]             │  ← link button
      └─────────────────────────────┘
```

### Props
```typescript
interface CitationHoverCardProps {
  citation: CitationRecord;
  children: React.ReactNode;
}
```

### Key Details
- "Open document" link href: `/api/documents/${citation.documentId}/download`
  - Uses the GLOBAL document download route (not the case-specific one)
  - Reason: `citation.documentId` is the global `document_id` from the chunks table, NOT `case_documents.id`
  - The case-specific route expects `case_documents.id` which is a different FK
  - Opens in new tab (target="_blank")
- Page badge: only shown when citation.page is not null
- sentenceBefore/sentenceAfter: only shown when non-empty strings
- Styling: bg-popover, border, rounded-md, shadow-md, text-sm
- sentenceHit highlight: bg-yellow-50 dark:bg-yellow-900/20, slightly bolder (font-medium)
- All text in Polish context but component labels in English (matching existing codebase pattern)
- `asChild` on Trigger is REQUIRED — without it Radix renders a `<button>`, invalid inside `<p>` elements
- Portal is REQUIRED — without it the card renders inside the chat message container and gets clipped by `overflow: hidden`
- Content area: add `max-h-[200px] overflow-y-auto` to handle very long sentence context

## File 2: `src/components/legal-hub/annotated-answer.tsx` (NEW)

### Purpose
Takes a StructuredAnswer and renders the answerText with citation-annotated spans wrapped in CitationHoverCard components.

### Algorithm
1. Receive `answer: StructuredAnswer` as props
2. If `answer.annotations` is empty or undefined, render `answerText` as a plain `<p>` (fallback)
3. Sort annotations by `start` offset ascending
4. Walk through `answerText`, splitting into segments:
   - Plain text segments (between annotations): render as `<span>{text}</span>`
   - Annotated segments: look up first citationId in `answer.citations[]`, wrap in:
     ```
     <CitationHoverCard citation={matchedCitation}>
       <span className="border-b border-dotted border-muted-foreground/50 cursor-help">
         {text}
       </span>
     </CitationHoverCard>
     ```
5. Handle edge cases:
   - Overlapping annotations: should not occur (Task 3 produces non-overlapping spans), but if they do, use the first one encountered
   - citationId not found in citations array: render as plain text (defensive)
   - Empty answerText: render nothing

### Marker Style
- `border-bottom: 1px dotted` via Tailwind `border-b border-dotted`
- `border-muted-foreground/50` — subtle, not distracting
- `cursor-help` — indicates interactive element
- No bold, no color highlight on the text itself
- On hover, the HoverCard opens (handled by Radix)

### Props
```typescript
interface AnnotatedAnswerProps {
  answer: StructuredAnswer;
}
```

## File 3: `src/components/legal-hub/case-chat-panel.tsx` (MODIFY)

### Changes

#### 3a. Add StructuredAnswer type and parsing logic

Update the ChatMessage interface to support both plain text and structured responses:

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
  structuredAnswer?: StructuredAnswer | null;  // NEW
}
```

#### 3b. Parse API response

In the `sendMessage` function, after receiving `data` from the API:

```typescript
// Try to detect structured response from Task 3
let structuredAnswer: StructuredAnswer | null = null;
if (data.answerText && data.annotations && data.citations) {
  // New structured format from grounded answer generation
  structuredAnswer = data as StructuredAnswer;
}

setMessages([
  ...newMessages,
  {
    role: "assistant",
    content: structuredAnswer ? structuredAnswer.answerText : (data.answer || ""),
    sources: structuredAnswer ? [] : (data.sources ?? []),
    structuredAnswer,
  },
]);
```

**Backward compatibility**: If the API returns `{answer, sources}` (old format), `structuredAnswer` will be null and the existing rendering path is used unchanged.

#### 3c. Update message rendering

In the message rendering section, for assistant messages:

- If `msg.structuredAnswer` exists: render `<AnnotatedAnswer answer={msg.structuredAnswer} />`
- If `msg.structuredAnswer` is null/undefined: keep existing plain text + SourceCard rendering (backward compat)

The SourceCard component and its rendering block are kept but only used for non-structured responses. We do NOT remove SourceCard entirely — it serves as fallback for old-format responses.

#### 3d. Indexing status banner

Add a banner at the top of the message list area that shows when documents are still being indexed.

- Call `GET /api/legal-hub/cases/${caseId}/documents/status` on mount
- If any document has status "processing", show: "X dokument(ów) jest w trakcie indeksowania" (yellow/amber banner)
- Poll every 10 seconds while any document is processing; stop when all are indexed/failed
- Banner position: above the message list, below the header, as a fixed info bar
- This endpoint is created by Task 5. If it doesn't exist yet (404), silently skip the banner (no error)

### Imports to Add
```typescript
import { AnnotatedAnswer } from "./annotated-answer";
```

## Rendering Decision Tree

```
Assistant message received
├── msg.error? → render error span (unchanged)
├── msg.structuredAnswer?
│   ├── YES → <AnnotatedAnswer answer={structuredAnswer} />
│   └── NO → existing plain text rendering
│       ├── msg.content → <p>{content}</p>
│       └── msg.sources?.length > 0 → SourceCard list
```

## Edge Cases & Defensive Coding

1. **Task 3 not deployed yet**: API still returns `{answer, sources}` → structuredAnswer is null → old rendering works
2. **API returns malformed JSON**: catch block already handles this → error message shown
3. **StructuredAnswer with 0 annotations**: AnnotatedAnswer renders plain text paragraph
4. **Status endpoint 404**: silently ignore, no banner shown
5. **Citation references document user can't access**: download link will return 401/404 from existing auth middleware
6. **Very long sentenceHit**: hover card content scrolls within max-height (add max-h-[200px] overflow-y-auto to content area)

## Testing Strategy (manual, no automated tests in this task)

1. With Task 3 deployed: send a chat message, verify hover cards appear on citation markers
2. Without Task 3: verify old-format responses still render correctly (backward compat)
3. Hover card: verify document name, page, sentence context all display
4. "Open document" link: verify it opens/downloads the correct document
5. Empty annotations: verify answer renders as plain text
6. Mobile/narrow viewport: verify hover card doesn't overflow viewport (Radix handles this with collision detection)

## File Dependency Order

1. Install `@radix-ui/react-hover-card` (npm install)
2. Create `citation-hover-card.tsx` (no project dependencies)
3. Create `annotated-answer.tsx` (depends on citation-hover-card)
4. Modify `case-chat-panel.tsx` (depends on annotated-answer)
