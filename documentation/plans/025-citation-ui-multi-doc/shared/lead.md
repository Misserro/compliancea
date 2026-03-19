# Lead Notes — Plan 025: Citation UI Fix

## Plan Overview

Fix the citation pipeline that is completely broken. Root cause: system prompt uses "chunkId" as a literal placeholder in the JSON example, so Claude outputs {"chunkId": {...}} which fails the fabrication guard. No citations ever reach the frontend. Then fix the UI to support multi-document citations per span.

## Concurrency

2 tasks sequential (Task 2 depends on Task 1). Task 2 can be pipeline-spawned while Task 1 is in review/test.

## Task Dependency Graph
- Task 1: no dependencies — fix prompt + parser
- Task 2: depends on Task 1 — fix UI components

## Critical Technical Notes

### Why citations are broken (root cause)
- `case-chat-grounded.md` shows example JSON with literal key "chunkId" instead of actual number
- Claude copies this literally → outputs {"chunkId": {...}}
- Fabrication guard: chunkMap.has("chunkId") = false → all citations rejected
- annotations = [] → no hover cards ever appear

### Parser fallback needed
- Claude may also output citations as an array [{chunkId: 42, ...}] instead of dict
- Object.entries on array gives integer index keys ("0", "1") → also rejected
- parseCitationResponse must handle both formats

### Annotation computation notes
- buildEvidencePrompt uses: [CHUNK:chunkId|DOC:docId|PAGE:n] tags
- parseCitationResponse expects citations dict keyed by chunkId string
- annotationEnd = character position where [cit:X] marker was in original text
- annotationStart = walk back to last ". " or ".\n" boundary

### UI fix notes
- annotated-answer.tsx uses citationIds[0] only → fix to collect all matching CitationRecord[]
- citation-hover-card.tsx takes single citation → change to citations[] array
- Use Separator component (already in ui/) between multiple citations
- Add #page=N to download URL for browser PDF page jump
- Keep Radix HoverCard with Portal and asChild — these are correct

## Files to Change

Task 1:
- prompts/case-chat-grounded.md — fix JSON example with concrete numbers
- lib/citation-assembler.js — add array-format fallback

Task 2:
- src/components/legal-hub/annotated-answer.tsx — pass all citations
- src/components/legal-hub/citation-hover-card.tsx — accept array, vertical list

## Execution Log

(populated during execution)
