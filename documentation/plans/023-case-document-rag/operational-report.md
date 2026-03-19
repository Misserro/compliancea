# Operational Report — Plan 023: Case Document RAG

**Date:** 2026-03-19
**Plan:** Case Document RAG: Grounded Retrieval & Citation Chat
**Outcome:** SUCCESS — all 5 tasks completed, 0 stalls, 0 alerts raised
**Final Gate:** PASSED — 65 tests, 0 failures, tsc clean, build clean (53 pages)

---

## Executive Summary

Plan 023 implemented a production-grade, citation-aware retrieval pipeline for the Legal Hub case chat. All five tasks were completed with pipeline spawning used to eliminate idle time between dependent tasks. The concurrency limit of 2 was respected throughout. No stalls, failures, or rate-limit events were observed.

---

## Task Timeline

| Task | Name | Started | Completed | Duration | Pipeline Mode |
|------|------|---------|-----------|----------|---------------|
| task-1 | Page-Aware Ingestion Pipeline | 00:01 | 00:06 | 5 min | No |
| task-2 | Hybrid Retrieval Service | 00:05 (planning), 00:06 (impl) | 00:09 | 4 min active | Yes (planning overlap) |
| task-3 | Grounded Answer Generation | 00:08 (planning), 00:09 (impl) | 00:12 | 4 min active | Yes (planning overlap) |
| task-4 | Citation Hover Card UI | 00:10 (planning), 00:12 (impl) | 00:16 | 6 min active | Yes (planning overlap) |
| task-5 | Tests & Processing Status | 00:12 | 00:15 | 3 min | No (normal spawn) |

**Total wall-clock duration:** ~16 minutes (00:01 → 00:16)

---

## Concurrency Usage

The pipeline ran at maximum concurrency (2/2) during the following windows:

| Window | Slot 1 | Slot 2 |
|--------|--------|--------|
| 00:05–00:06 | task-1 (review) | task-2 (planning) |
| 00:08–00:09 | task-2 (review) | task-3 (planning) |
| 00:10–00:12 | task-3 (impl/review) | task-4 (planning) |
| 00:12–00:15 | task-4 (impl/review) | task-5 (planning/impl/review) |
| 00:15–00:16 | task-4 (review) | — (task-5 done) |

Pipeline spawning was applied to tasks 2, 3, and 4 — each began planning while its predecessor was in review, eliminating planning idle time for ~3 tasks.

---

## Stage Progression

```
task-1: spawned → planning → implementation → review → completed (00:01–00:06)
task-2: pipeline-spawn → planning | approved-impl → implementation → review → completed (00:05–00:09)
task-3: pipeline-spawn → planning | approved-impl → implementation → review → completed (00:08–00:12)
task-4: pipeline-spawn → planning | approved-impl → implementation → review → completed (00:10–00:16)
task-5: spawned → planning → review → completed (00:12–00:15)
```

---

## Implementation Summary

### Task 1 — Page-Aware Ingestion Pipeline
- Added `page_number`, `char_offset_start`, `char_offset_end`, `section_title`, `sentences_json` columns to `chunks` table
- FTS5 virtual table (`chunks_fts`) with INSERT/DELETE/UPDATE triggers
- `chunkTextByPages()` using `\f` page separator (executor discovery — simpler than pagerender callback)
- `insertChunkWithMeta` helper with `saveDb()` call; reprocessing guard via `content_hash`
- `getCaseDocumentIndexingStatus` helper
- Verified: `document_id` already set at upload time — no fix needed

### Task 2 — Hybrid Retrieval Service
- `lib/case-retrieval.js` with 6-stage pipeline: case-scope filter → FTS5 BM25 (negated rank) → vector cosine → RRF merge (k=60) → Voyage rerank-2 → adaptive expansion at <0.35
- Cross-case isolation structurally enforced via JOIN filter
- Graceful reranker fallback to RRF score on API error

### Task 3 — Grounded Answer Generation
- `prompts/case-chat-grounded.md` strict grounded system prompt
- `lib/citation-assembler.js`: `buildEvidencePrompt`, `parseCitationResponse` (fabrication guard), `isHighRiskQuery`
- Case chat route rewritten to return `StructuredAnswer` JSON
- Two-tier confidence (`high`/`low`) — simplified from planned three-tier; executor-4 restored three-tier for frontend type compatibility

### Task 4 — Citation Hover Card UI
- `citation-hover-card.tsx`: Radix HoverCard with Portal/asChild, sentenceBefore/Hit/After context
- `annotated-answer.tsx`: character-span annotation renderer
- `case-chat-panel.tsx`: backward-compat JSON detection; `SourceCard` kept (not removed) for backward compat
- `@radix-ui/react-hover-card` installed (was not in package.json despite plan assumption)

### Task 5 — Tests & Processing Status
- 65 unit tests across `chunker`, `citation-assembler`, `case-retrieval`
- New endpoint: `GET /api/legal-hub/cases/[id]/documents/status`
- `IndexingBadge` component with polling in `CaseDocumentsTab`

---

## Decisions Made During Execution

| Decision | Outcome |
|----------|---------|
| FTS5 UPDATE trigger second INSERT syntax | Fixed: `(rowid, content)` not `(chunks_fts, rowid, content)` — caught at Lead plan review |
| Page splitting method | Used `\f` separator (simpler than pagerender async callback) — executor-1 discovery |
| document_id fix | Not needed — already set at upload time (executor-1 verified) |
| Confidence tiers | Two-tier simplified; three-tier restored by executor-4 for frontend type compat |
| SourceCard removal | Kept for backward compat — pragmatic decision by executor-4 |
| @radix-ui/react-hover-card | Installed (was not pre-installed despite plan assumption) |

---

## Files Created/Modified

| File | Change |
|------|--------|
| `lib/chunker.js` + `lib/chunker.d.ts` | Extended |
| `lib/db.js` + `lib/db.d.ts` | Extended |
| `lib/case-retrieval.js` + `lib/case-retrieval.d.ts` | New |
| `lib/citation-assembler.js` + `lib/citation-assembler.d.ts` | New |
| `prompts/case-chat-grounded.md` | New |
| `src/app/api/documents/[id]/process/route.ts` | Extended |
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | Rewritten |
| `src/app/api/legal-hub/cases/[id]/documents/status/route.ts` | New |
| `src/components/legal-hub/citation-hover-card.tsx` | New |
| `src/components/legal-hub/annotated-answer.tsx` | New |
| `src/components/legal-hub/case-chat-panel.tsx` | Extended |
| `src/components/legal-hub/case-documents-tab.tsx` | Extended |
| `src/lib/db-imports.ts`, `chunker-imports.ts`, `case-retrieval-imports.ts`, `citation-assembler-imports.ts` | Extended/New |
| `tests/unit/chunker.test.ts` | New |
| `tests/unit/citation-assembler.test.ts` | New |
| `tests/unit/case-retrieval.test.ts` | New |
| `package.json` | Added `@radix-ui/react-hover-card` |

---

## Alerts & Incidents

**Stalls detected:** 0
**Rate-limit events:** 0
**Failed tasks:** 0
**Re-spawns required:** 0

No alerts were sent to the Lead during execution.

---

## Follow-up Items

1. **Existing chunks** (pre-plan 023) have NULL `page_number` — a reprocessing trigger is needed for existing case documents to gain citation support
2. **OCR not implemented** — pdf-parse only handles text-layer PDFs; scanned PDFs produce empty pages
3. **SearchService abstraction** allows future migration to PostgreSQL + pgvector without rewriting retrieval logic

---

## Final State

| Metric | Value |
|--------|-------|
| Total tasks | 5 |
| Completed | 5 |
| Failed | 0 |
| Tests | 65 passed, 0 failed |
| TypeScript | Clean |
| Build | Clean (53 pages) |
| Active teams at close | 0 |
| Watchdog PID | 4688 |
| Dashboard location | `documentation/plans/023-case-document-rag/status/` |
