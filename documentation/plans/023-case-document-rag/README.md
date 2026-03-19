# Plan 023 — Case Document RAG: Grounded Retrieval & Citation Chat

**Status:** Draft
**Module:** Legal Hub — Case Management
**Audience:** Law firm practitioners (lawyers, paralegals)

---

## Problem Statement

The current Legal Hub case chat (`/api/legal-hub/cases/[id]/chat`) retrieves chunks from case-linked documents using pure in-memory vector similarity. It has no BM25 fallback, no page numbers stored on chunks, no sentence-level context, no structured citation format, and no hover-card UI. The chat can reference document names but cannot point to a specific page or passage — making its outputs unsuitable for professional legal use where source traceability is non-negotiable.

---

## Goal

Implement a production-grade, recall-first, citation-aware retrieval pipeline for Legal Hub case chat that:

1. Processes case documents at upload time into page-aware, sentence-segmented, dual-indexed (vector + BM25) chunks
2. Retrieves across multiple case documents using hybrid search (FTS5 BM25 + Voyage vector cosine) merged via RRF, then reranked with Voyage rerank-2
3. Generates answers strictly grounded in retrieved evidence with a structured JSON response carrying character-level annotation spans and citation metadata
4. Renders annotated answer text in the frontend with professional hover cards (document name, page, sentence-before, evidence sentence, sentence-after)

---

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | SQLite (stay, design for migration) | No infrastructure change; abstract SearchService interface for future swap to Postgres+pgvector |
| Lexical search | SQLite FTS5 content table over `chunks.content` | Zero extra storage, BM25 built-in, no new service |
| Reranker | Voyage AI `voyage-rerank-2` | Same vendor/API key as embeddings; purpose-built, low latency |
| Citation granularity | Page + sentence context | pdf-parse gives page boundaries; pixel highlighting deferred |
| Sentence storage | JSON array on `chunks.sentences_json` | No separate sentences table; keeps schema minimal |
| Answer format | Structured JSON `{answerText, annotations[], citations[]}` | Enables frontend character-span rendering without client-side NLP |
| Tenancy model | Single-firm, case-scoped | All queries filtered by `case_id`; enforced at retrieval layer |

---

## Documentation Updates (Stage 4 Step 1)

The following existing documentation files require updates before implementation:

| File | Update Required |
|---|---|
| `documentation/technology/architecture/database-schema.md` | Add new `chunks` columns (`page_number`, `char_offset_start`, `char_offset_end`, `section_title`, `sentences_json`); add `chunks_fts` FTS5 virtual table entry |
| `documentation/technology/architecture/data-flow.md` | Add new mermaid sequence diagram: Case Document RAG flow (upload → hierarchical index → hybrid retrieve → rerank → ground answer → annotate) |
| `documentation/product/requirements/features.md` | Add grounded case chat feature entry under Legal Hub section |

---

## Implementation Tasks

### Task 1 — Page-Aware Ingestion Pipeline

**Scope:** Extend the document processing pipeline to produce page-numbered, sentence-aware chunks with FTS5 lexical index support.

**Files to create or modify:**
- `lib/chunker.js` — add `chunkTextByPages(pages: {pageNumber, text}[])` variant that produces `{content, pageNumber, charOffsetStart, charOffsetEnd, sectionTitle, sentences}` per chunk; sentences as `{text, charStart, charEnd}[]`
- `lib/db.js` — add schema migration (ALTER TABLE `chunks` ADD COLUMN) for: `page_number INTEGER`, `char_offset_start INTEGER`, `char_offset_end INTEGER`, `section_title TEXT`, `sentences_json TEXT`; create `chunks_fts` FTS5 virtual table as a content table over `chunks(content)`; add FTS5 insert/delete triggers; add `getChunksByCaseId(caseId)` with case-scope filter; add `insertChunkWithMeta(...)` helper accepting new fields; add `getCaseDocumentIndexingStatus(caseId)` to return per-document `{documentId, documentName, processed, chunksIndexed}[]`
- `src/app/api/documents/[id]/process/route.ts` (or equivalent processing endpoint) — update to call `chunkTextByPages` when pdf-parse page data is available; fall back to existing `chunkText` for non-PDF; populate new columns on insert
- `src/app/api/legal-hub/cases/[id]/documents/route.ts` — after upload triggers processing, ensure `document_id` is written back to `case_documents` once processing completes (fix the NULL gap)

**Success criteria (user-visible):**
- After uploading a PDF to a case, the processed chunks in the DB have non-null `page_number` values
- Uploading a document and immediately viewing case document status shows "indexing" then "ready"
- Re-uploading the same file (same content hash) does not reprocess
- The `chunks_fts` table returns BM25 matches for terms in the document text

---

### Task 2 — Hybrid Retrieval Service

**Scope:** Create an abstract `SearchService` and implement `CaseRetrievalService` with hybrid BM25+vector retrieval, RRF merging, Voyage reranking, and adaptive expansion.

**Files to create or modify:**
- `lib/case-retrieval.js` — new file implementing:
  - `interface SearchService` (JSDoc typedef): `search(query, caseId, options) → Promise<RetrievalResult[]>`
  - `CaseRetrievalService` class implementing `SearchService`:
    - **Stage 1 — metadata filter:** build `document_ids` set from `case_documents` for given `case_id`; validate all docs are processed
    - **Stage 2 — BM25 retrieval:** `SELECT chunks.*, rank FROM chunks_fts JOIN chunks WHERE chunks_fts MATCH ? AND document_id IN (...)` returning top 40 candidates with FTS5 `rank` score
    - **Stage 3 — vector retrieval:** call `getEmbedding(query)` then cosine similarity on case chunks (reuse `lib/search.js` `cosineSimilarity`), top 40 candidates
    - **Stage 4 — RRF merge:** `score = 1/(k + rank_bm25) + 1/(k + rank_vector)` with `k=60`; deduplicate by `chunk_id`; keep top 60
    - **Stage 5 — Voyage rerank-2:** POST `https://api.voyageai.com/v1/rerank` with `{model:"voyage-rerank-2", query, documents: merged.map(c=>c.content), top_k: 20}`; map back to chunk records
    - **Stage 6 — adaptive expansion:** if max rerank score < 0.35, expand retrieval to top 80 BM25 + top 80 vector and rerank again with `top_k: 30`; flag `lowConfidence: true` in result
    - Returns `RetrievalResult[]`: `{chunkId, documentId, documentName, pageNumber, content, sectionTitle, sentences, score, bm25Score, vectorScore, rerankScore}`
- `lib/search.js` — export `cosineSimilarity` for reuse (it is currently local; add named export)

**Success criteria (user-visible):**
- A query about a term that appears exactly once in a PDF (lexical match, low semantic similarity) is retrieved by BM25 even if vector score is low
- A query with synonyms/paraphrasing retrieves semantically similar chunks even without keyword match
- A query with sparse matching (< 0.35 rerank score) triggers expansion and the answer notes uncertainty
- All retrieved chunks belong only to the queried case's documents (cross-case contamination is impossible)

---

### Task 3 — Grounded Answer Generation

**Scope:** Replace the current case chat generation with a citation-grounded pipeline that produces structured JSON with character-level annotation spans and citation metadata.

**Files to create or modify:**
- `prompts/case-chat-grounded.md` — new system prompt (replaces `case-chat.md` for this flow):
  - You answer ONLY from the retrieved evidence blocks provided. Do not use external knowledge.
  - Each evidence block is tagged `[CHUNK:chunkId|DOC:docId|PAGE:N]` before its text.
  - When your answer uses information from a chunk, insert a citation marker `[cit:chunkId]` immediately after the relevant sentence in your answer.
  - If evidence is insufficient, state that clearly. Never fabricate citations.
  - Output format: JSON object `{answerText, citations}` where `answerText` is the answer with `[cit:X]` markers inline, and `citations` maps chunk IDs to `{documentId, documentName, page, sentenceHit, sentenceBefore, sentenceAfter}`
- `lib/citation-assembler.js` — new file:
  - `buildEvidencePrompt(chunks: RetrievalResult[]) → string` — formats chunks for system prompt injection with `[CHUNK:id|DOC:id|PAGE:N]` prefixes
  - `parseCitationResponse(rawJson: string, chunks: RetrievalResult[]) → StructuredAnswer` — parses model output, validates that every `cit:X` refers to a chunk actually in the retrieved set (fabrication guard), resolves sentence neighbors from `chunk.sentences`, maps `[cit:X]` markers to character offsets in `answerText` to produce `annotations[]`
  - `resolveNeighborSentences(chunk, sentenceHit) → {sentenceBefore, sentenceAfter}` — finds adjacent sentences in `chunk.sentences[]`
  - `StructuredAnswer` type: `{answerText, annotations: {start, end, citationIds[]}[], citations: CitationRecord[], usedDocuments: {id, name}[], confidence: "high"|"medium"|"low", needsDisambiguation: boolean}`
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — update to:
  - Call `CaseRetrievalService.search(query, caseId, {highRisk: isHighRiskQuery(query)})`
  - Use `buildEvidencePrompt(chunks)` to build context
  - Use new grounded system prompt
  - Parse Claude output with `parseCitationResponse`
  - Return `StructuredAnswer` JSON instead of current plain text + sources array
  - Add `isHighRiskQuery(query)` classifier: regex/keyword match for "list all", "summarize", "all deadlines", "all references to X" → sets broader `topK` in retrieval

**Success criteria (user-visible):**
- Asking "what is the claim value?" returns a JSON with `answerText` containing the answer and a `[cit:X]` marker, plus `citations[0]` with `documentName`, `page`, `sentenceHit`, `sentenceBefore`, `sentenceAfter`
- Asking about something not in the documents returns `confidence: "low"` and `answerText` clearly stating evidence is insufficient — not a hallucinated answer
- Asking "list all deadlines" triggers high-risk expansion (broader retrieval) and returns multi-citation answer
- No citation refers to a page or chunk not actually in the retrieved set

---

### Task 4 — Citation Hover Card UI

**Scope:** Update the case chat frontend to parse the structured JSON response and render annotated answer text with professional hover cards.

**Files to create or modify:**
- `src/components/legal-hub/citation-hover-card.tsx` — new component:
  - Props: `citation: CitationRecord`
  - Renders a Radix UI `HoverCard` (already in dependencies) with:
    - Document name (bold) + page number badge
    - `sentenceBefore` (muted gray)
    - `sentenceHit` (highlighted, slightly bolder)
    - `sentenceAfter` (muted gray)
    - "Open document" button (links to document detail or download)
  - Design: compact, no more than 320px wide, professional sans-serif, no emoji, no color noise
- `src/components/legal-hub/annotated-answer.tsx` — new component:
  - Props: `answer: StructuredAnswer`
  - Splits `answerText` by annotation spans using `annotations[]` character offsets
  - Renders non-annotated spans as plain text
  - Renders annotated spans as `<span>` with a subtle underline dot indicator, wrapped in `CitationHoverCard`
  - Multiple citations on same span render as a single hover card with multiple evidence entries
- `src/components/legal-hub/case-chat-panel.tsx` — update:
  - Parse API response as `StructuredAnswer` (handle both old plain-text format for backward compat and new JSON format)
  - Replace current `ReactMarkdown` answer rendering with `AnnotatedAnswer` when structured response is present
  - Remove old `SourceCard` component below the answer (citation info is now in hover cards)
  - Keep error state and loading spinner unchanged
  - Add processing status section: if case has unprocessed documents, show a banner "Some documents are still being indexed" with count

**Success criteria (user-visible):**
- Chat answer renders as readable text with subtle citation markers on evidenced sentences
- Hovering a citation marker shows the hover card with document name, page, and 3-sentence context
- Clicking "Open document" navigates to the document (or triggers download)
- If structured response is missing (fallback/error), answer still renders as plain text without breaking
- Unprocessed document banner appears and accurately reflects indexing state

---

### Task 5 — Tests & Processing Status

**Scope:** Add Vitest unit tests for core retrieval/citation logic and a processing status indicator in the case document UI.

**Files to create or modify:**
- `tests/unit/chunker.test.ts` — tests for `chunkTextByPages`:
  - Single-page document produces chunks with `pageNumber = 1`
  - Multi-page document preserves page boundaries (no chunk spans across pages unless overlap)
  - Sentence boundaries are correct (each sentence in `sentences[]` is present in `content`)
  - Short pages (< 20 words) are not discarded if they are the only content on that page
- `tests/unit/citation-assembler.test.ts` — tests for `parseCitationResponse`:
  - Valid `[cit:X]` markers map to correct character offsets in `answerText`
  - A `[cit:X]` where X is not in the retrieved chunk set is stripped (fabrication guard)
  - `resolveNeighborSentences` returns empty string when chunk has only 1 sentence
  - `confidence` is `"low"` when `lowConfidence: true` from retrieval
- `tests/unit/case-retrieval.test.ts` — tests for `CaseRetrievalService`:
  - Retrieval query for `caseId=A` never returns chunks from documents belonging only to `caseId=B`
  - When all rerank scores < 0.35, `lowConfidence: true` in result
  - When Voyage reranker returns error, service falls back to RRF score ranking (no crash)
- `src/components/legal-hub/case-documents-tab.tsx` — add indexing status:
  - Call `GET /api/legal-hub/cases/{id}/documents/status` (new lightweight endpoint returning `{documentId, status: "processing"|"indexed"|"failed"}[]`)
  - Show per-document badge: green "Indexed" / yellow "Indexing..." / red "Failed"
  - Poll every 5 seconds while any document is in "processing" state; stop polling when all indexed
- `src/app/api/legal-hub/cases/[id]/documents/status/route.ts` — new endpoint using `getCaseDocumentIndexingStatus(caseId)` from DB

**Success criteria (user-visible):**
- `npm test` passes all new tests with zero failures
- Uploading a document to a case shows "Indexing..." badge, then changes to "Indexed" within processing time
- A document stuck in "Failed" state shows a red badge (no silent failures)
- Cross-case contamination test confirms isolation

---

## Task Dependencies

```
Task 1 (Ingestion)
    └─→ Task 2 (Retrieval) — needs new chunk columns + FTS5
           └─→ Task 3 (Answer Generation) — needs RetrievalResult type from Task 2
                  └─→ Task 4 (Frontend UI) — needs StructuredAnswer type from Task 3
Task 1 (Ingestion) ──────────────────────────────────→ Task 5 (Tests) — tests chunker
Task 2 (Retrieval) ──────────────────────────────────→ Task 5 (Tests) — tests retrieval
Task 3 (Answer) ─────────────────────────────────────→ Task 5 (Tests) — tests citation assembler
```

Tasks 1–3 are sequential. Task 4 can proceed in parallel with Task 3 (API contract is defined by StructuredAnswer type). Task 5 is written alongside Tasks 1–3.

---

## Key Files Changed (Summary)

| File | Change Type |
|---|---|
| `lib/chunker.js` | Extend — add `chunkTextByPages()` |
| `lib/db.js` | Extend — new columns on `chunks`, FTS5 table, new helpers |
| `lib/case-retrieval.js` | New — `CaseRetrievalService` with hybrid search + reranking |
| `lib/citation-assembler.js` | New — evidence prompt builder + citation parser + annotation mapper |
| `lib/search.js` | Minor — export `cosineSimilarity` |
| `prompts/case-chat-grounded.md` | New — strict grounded system prompt |
| `src/app/api/documents/[id]/process/route.ts` | Extend — page-aware processing |
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | Rewrite — new retrieval + grounded generation |
| `src/app/api/legal-hub/cases/[id]/documents/route.ts` | Fix — write back `document_id` after processing |
| `src/app/api/legal-hub/cases/[id]/documents/status/route.ts` | New — indexing status endpoint |
| `src/components/legal-hub/citation-hover-card.tsx` | New — hover card component |
| `src/components/legal-hub/annotated-answer.tsx` | New — annotation span renderer |
| `src/components/legal-hub/case-chat-panel.tsx` | Extend — parse structured response, render annotations |
| `src/components/legal-hub/case-documents-tab.tsx` | Extend — indexing status badges |
| `tests/unit/chunker.test.ts` | New |
| `tests/unit/citation-assembler.test.ts` | New |
| `tests/unit/case-retrieval.test.ts` | New |

---

## Assumptions

1. The document processing endpoint (`/api/documents/[id]/process`) or equivalent exists and can be extended. If it doesn't exist as a Next.js route, the same logic lives in `server.js` and will be extended there.
2. `pdf-parse` with the `pagerender` callback option returns per-page text objects — this is the standard `pdf-parse` behavior and is already used elsewhere.
3. Voyage AI API key (`VOYAGE_API_KEY`) is already set in the environment and covers `voyage-rerank-2` (same account as `voyage-3-lite`).
4. The `Radix UI HoverCard` component is available (`@radix-ui/react-hover-card`) — it is already installed per package.json.
5. SQLite FTS5 is compiled into the `sql.js` build being used — standard `sql.js` v1.10.0 includes FTS5.
6. Existing chunks (without page numbers) continue to work for legacy retrieval paths; case chat will handle mixed `page_number IS NULL` gracefully.

---

## How Citation Accuracy is Ensured

1. **Grounding enforcement** — System prompt explicitly forbids external knowledge and requires `[cit:X]` markers for every factual claim
2. **Fabrication guard** — `parseCitationResponse` validates every cited chunk ID against the actually-retrieved set; any `[cit:X]` not in that set is stripped before the response is returned
3. **Sentence-level sourcing** — Hover card shows the literal sentence from the document, not a paraphrase; users can verify the source directly
4. **Reranking precision** — Voyage rerank-2 filters out low-relevance chunks before they reach the model; the model receives only the 20 most relevant passages
5. **Adaptive expansion** — Low-confidence queries expand retrieval before giving up; the system prefers "I found insufficient evidence" over a weak answer from 2 irrelevant chunks
6. **Case-scope enforcement** — Retrieval always filters by `case_id`; cross-case chunk contamination is structurally impossible at the DB query level

---

- [ ] Task 1: Page-Aware Ingestion Pipeline
- [ ] Task 2: Hybrid Retrieval Service
- [ ] Task 3: Grounded Answer Generation
- [ ] Task 4: Citation Hover Card UI
- [ ] Task 5: Tests & Processing Status
