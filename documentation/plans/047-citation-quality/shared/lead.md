# Plan 047 — Lead Notes

## Plan Overview
Fix two citation quality bugs: (1) PDF page numbers always stored as 1 due to missing \f characters in pdfData.text, (2) Claude cites section header for all list items instead of specific chunk per item. Also adds a Reprocess button in the document card UI to let users fix existing documents.

## Concurrency Decision
3 tasks, all independent. Run all 3 concurrently.

## Task Dependency Graph
- Task 1: no dependencies
- Task 2: no dependencies (functionally useful after Task 1, but code changes are independent)
- Task 3: no dependencies

## Key Architectural Constraints
- pdf-parse `pagerender` callback receives a PDF.js `PDFPageProxy` object; `pageData.pageNumber` is the 1-based page number; `pageData.getTextContent()` returns `{items: {str: string}[]}` — join with ' '
- The content-hash skip check in process/route.ts prevents reprocessing unchanged docs — must be bypassed by `?force=true`
- Document card `onProcess` prop only used for unprocessed docs; `onReprocess` is a NEW prop for the processed branch
- i18n for documents is nested: `documents.card.{key}` in messages/en.json and messages/pl.json
- prompts/case-chat-grounded.md is read at runtime — changes take effect immediately, no rebuild needed
- citation-assembler.js is NOT modified in this plan — it already handles multi-chunk annotations correctly
- The processingIds state in page.tsx tracks loading state — reprocess should reuse it

## Critical Files
- src/app/api/documents/[id]/process/route.ts — PDF pipeline (Task 1 + Task 2)
- src/components/documents/document-card.tsx — UI button (Task 2)
- src/app/(app)/documents/page.tsx — handler (Task 2)
- messages/en.json, messages/pl.json — i18n (Task 2)
- prompts/case-chat-grounded.md — system prompt (Task 3)

## Tests
- tests/unit/citation-assembler.test.ts — must pass after Task 3

## Execution Complete

**Plan:** 047-citation-quality
**Tasks:** 3 completed, 0 skipped, 0 escalated

### Tasks Completed
- task-1: Replaced \f-split with pdf-parse pagerender callback in process/route.ts — accurate per-page page numbers for newly indexed PDFs
- task-2: Added RefreshCw reprocess button to processed document cards; ?force=true param bypasses content-hash skip; prop drilled through document-list.tsx; i18n in en.json + pl.json
- task-3: Added per-item list citation rule to prompts/case-chat-grounded.md — instructs Claude to cite each list item with its specific chunk

### Files Modified
- `src/app/api/documents/[id]/process/route.ts` — pagerender callback (task 1) + ?force=true param (task 2)
- `src/components/documents/document-card.tsx` — RefreshCw button + onReprocess prop
- `src/components/documents/document-list.tsx` — onReprocess prop threading through all levels
- `src/app/(app)/documents/page.tsx` — handleReprocess handler
- `messages/en.json` — reprocessDocument + reprocessSuccess keys
- `messages/pl.json` — reprocessDocument + reprocessSuccess keys
- `prompts/case-chat-grounded.md` — per-item list citation rule

### Test Results
- Final gate (full suite): 890/891 — 1 pre-existing failure in court-fee.test.ts (known since Plan 042, unrelated)
- TypeScript: clean (no errors)

### Follow-up Items
- Existing indexed PDFs still have wrong page numbers — users need to click "Reprocess" on each document to fix
- The per-item citation fix works only when items are in different chunks; items that fit in one chunk (short lists on one page) will still share one citation
