# Lead Notes — Plan 023: Case Document RAG

## Plan Overview

Implement a production-grade, recall-first, citation-aware retrieval pipeline for Legal Hub case chat. The system processes case documents at upload time into page-aware, sentence-segmented chunks, retrieves via hybrid BM25+vector search with Voyage reranking, and returns structured JSON responses with character-level annotation spans for hover-card citation UI.

## Concurrency Decision

Max 2 concurrent task-teams. Tasks 1→2→3→4 are sequential (each depends on the previous). Task 5 can be pipeline-spawned alongside Tasks 1-3 since it writes tests for them. Task 4 can be pipeline-spawned while Task 3 is in review/test.

## Task Dependency Graph

- Task 1: Page-Aware Ingestion Pipeline — no dependencies
- Task 2: Hybrid Retrieval Service — depends on Task 1 (needs new chunk columns + FTS5 in DB)
- Task 3: Grounded Answer Generation — depends on Task 2 (needs RetrievalResult type)
- Task 4: Citation Hover Card UI — depends on Task 3 (needs StructuredAnswer type), can pipeline with Task 3
- Task 5: Tests & Processing Status — depends on Tasks 1+2+3 for test subjects; can pipeline alongside

## Key Architectural Constraints

1. **SQLite only** — No new database. Extend chunks table with ALTER TABLE migrations. FTS5 via sql.js v1.10.0 (FTS5 is included).
2. **Extend, don't replace** — lib/embeddings.js, lib/search.js (cosineSimilarity), lib/db.js patterns are all reusable.
3. **Voyage AI** — Same API key covers voyage-3-lite (embeddings) AND voyage-rerank-2 (reranker). No new vendor.
4. **Page + sentence context** — pdf-parse gives page-separated text. Pixel-level bounding boxes are NOT in scope.
5. **Case-scoped retrieval** — Every retrieval query must filter by case_id via case_documents JOIN. Cross-case contamination is a correctness bug, not just a UX issue.
6. **Fabrication guard** — parseCitationResponse must validate every [cit:X] against the actually-retrieved chunk set. Strip unverified citations before returning to client.
7. **Backward compat** — Old chunks (no page_number) must not break existing ask/ or contracts chat routes.

## Critical Decisions

- Sentence storage: JSON array on chunks.sentences_json (no separate sentences table)
- Answer format: Structured JSON {answerText, annotations[], citations[]} from Claude
- Hover card: Radix HoverCard (already installed: @radix-ui/react-hover-card)
- No OCR — scanned PDFs produce empty pages; acceptable for now
- Threshold for adaptive expansion: rerank score < 0.35 → expand to top 80 candidates

## File Location Notes

- Processing pipeline is likely in server.js (Express monolith) OR src/app/api/documents/[id]/process/route.ts — executor must verify
- lib/db.js uses try/catch for all ALTER TABLE migrations (idempotent pattern)
- lib/search.js cosineSimilarity is currently local-only — needs named export for Task 2

## Critical Technical Notes (from Knowledge Agent)

- **FTS5 rank is NEGATIVE** — lower (more negative) = better match. Must negate when computing RRF rank order in Task 2. RRF formula should use abs(rank) or negate rank for proper ordering.
- **lib/search.js already exports cosineSimilarity** — no change needed to lib/search.js for Task 2 (corrects plan assumption).
- **pdf-parse pagerender callback**: use `pageData.pageNumber` (1-indexed) and `pageData.getTextContent()`. Executor must call this async, push {pageNumber, text} to array before returning text.
- **FTS5 triggers pattern** — DELETE trigger requires `INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content)` (special delete syntax).
- **sql.js saveDb()** — must be called after all mutations to persist to disk. Executor must not forget this in insertChunkWithMeta.
- **Voyage rerank-2 scores**: 0-1, higher = more relevant. ~0.94 = highly relevant, ~0.26 = tangential. Adaptive expansion threshold 0.35 is confirmed correct.
- **Document processing location**: likely in `src/app/api/documents/upload/route.ts` or scan route — executor-1 must verify before modifying.

## Execution Log

## Execution Complete

**Plan:** 023-case-document-rag
**Tasks:** 5 completed, 0 skipped, 0 escalated
**Final Gate:** PASSED — 65 tests, 0 failures, tsc clean, build clean (53 pages)

### Tasks Completed
- **Task 1 — Page-Aware Ingestion Pipeline:** Added page_number/char_offset_start/char_offset_end/section_title/sentences_json columns to chunks table; FTS5 virtual table with INSERT/DELETE/UPDATE triggers; chunkTextByPages() using \f page separator; insertChunkWithMeta helper; reprocessing guard via content_hash; getCaseDocumentIndexingStatus helper.
- **Task 2 — Hybrid Retrieval Service:** lib/case-retrieval.js with 6-stage pipeline: case-scope filter → FTS5 BM25 (negated rank) → vector cosine → RRF merge (k=60) → Voyage rerank-2 → adaptive expansion at <0.35; cross-case isolation structurally enforced; graceful reranker fallback.
- **Task 3 — Grounded Answer Generation:** prompts/case-chat-grounded.md strict system prompt; lib/citation-assembler.js with buildEvidencePrompt, parseCitationResponse (fabrication guard), isHighRiskQuery; case chat route rewritten to return StructuredAnswer JSON; two-tier confidence (high/low).
- **Task 4 — Citation Hover Card UI:** citation-hover-card.tsx (Radix HoverCard with Portal/asChild, sentenceBefore/Hit/After); annotated-answer.tsx (character-span annotation renderer); case-chat-panel.tsx updated with backward-compat JSON detection; @radix-ui/react-hover-card added.
- **Task 5 — Tests & Processing Status:** 65 unit tests across chunker/citation-assembler/case-retrieval; status endpoint GET /api/legal-hub/cases/[id]/documents/status; IndexingBadge component with polling in CaseDocumentsTab.

### Files Modified/Created
- `lib/chunker.js` + `lib/chunker.d.ts` — extended
- `lib/db.js` + `lib/db.d.ts` — extended
- `lib/case-retrieval.js` + `lib/case-retrieval.d.ts` — new
- `lib/citation-assembler.js` + `lib/citation-assembler.d.ts` — new
- `prompts/case-chat-grounded.md` — new
- `src/app/api/documents/[id]/process/route.ts` — extended
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — rewritten
- `src/app/api/legal-hub/cases/[id]/documents/status/route.ts` — new
- `src/components/legal-hub/citation-hover-card.tsx` — new
- `src/components/legal-hub/annotated-answer.tsx` — new
- `src/components/legal-hub/case-chat-panel.tsx` — extended
- `src/components/legal-hub/case-documents-tab.tsx` — extended
- `src/lib/db-imports.ts`, `src/lib/chunker-imports.ts`, `src/lib/case-retrieval-imports.ts`, `src/lib/citation-assembler-imports.ts` — extended/new
- `tests/unit/chunker.test.ts` — new
- `tests/unit/citation-assembler.test.ts` — new
- `tests/unit/case-retrieval.test.ts` — new
- `package.json` — added @radix-ui/react-hover-card

### Decisions Made During Execution
- FTS5 UPDATE trigger second INSERT fixed: `(rowid, content)` not `(chunks_fts, rowid, content)` — caught at Lead plan review
- Page splitting via `\f` separator (simpler than pagerender callback) — executor-1 discovery
- document_id already set at upload time — no fix needed (executor-1 verified)
- Two-tier confidence (high/low) vs. three-tier — executor-3 simplification; executor-4 restored three-tier for frontend type compatibility
- Fabrication guard validates chunk IDs against retrieved set before returning to client
- SourceCard kept for backward compat (not removed) — pragmatic decision by executor-4
- @radix-ui/react-hover-card installed (was not in package.json despite plan assumption)

### Test Results
- Per-task tests: all passed (reviewer + tester PASS for each task)
- Final gate: PASSED — 65 tests, 0 failures, tsc clean, build clean

### Follow-up Items
- Existing chunks (pre-plan 023) have NULL page_number — reprocessing trigger needed for existing case documents to gain citation support
- OCR for scanned PDFs not implemented — pdf-parse only handles text PDFs
- SearchService abstraction allows future migration to PostgreSQL + pgvector without rewriting retrieval logic
