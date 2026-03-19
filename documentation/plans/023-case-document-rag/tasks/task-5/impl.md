# Task 5 — Tests & Processing Status: Implementation Notes

**Status:** Implemented
**Tests:** 65 passing (4 files), 0 failures
**TypeScript:** Passes (zero errors)

---

## Files Created

### 1. `tests/unit/chunker.test.ts`
Tests for `chunkTextByPages` from `lib/chunker.js`:
- Single-page document: all chunks have `pageNumber = 1`
- Multi-page document: no chunk crosses page boundary, verified page 1 chunks don't contain page 2 content
- Sentence correctness: every `sentences[].text` is substring of `content`, charStart/charEnd are valid numbers
- Short page (< 20 words): produces 1 chunk, not filtered out
- Empty page: handled gracefully (no crash, 0 chunks)
- Mixed pages: empty page between content pages doesn't disrupt numbering
- charOffsetStart/charOffsetEnd are non-negative
- Null/undefined/empty input returns `[]`

### 2. `tests/unit/citation-assembler.test.ts`
Tests for `parseCitationResponse`, `resolveNeighborSentences`, `isHighRiskQuery`:
- Valid `[cit:X]` markers map to correct character offsets in cleaned answerText
- Invalid `[cit:X]` (chunk not in retrieved set) is stripped — fabrication guard works
- Degraded response on invalid JSON: confidence "low", raw text preserved
- Degraded response when answerText missing
- Handles JSON wrapped in markdown code fences
- usedDocuments are deduplicated
- resolveNeighborSentences: middle sentence returns both neighbors; first sentence has empty before; last has empty after; 1-sentence chunk returns both empty; no sentences returns both empty; empty sentenceHit returns both empty
- isHighRiskQuery: English patterns ("list all deadlines" true, "what is the claim value?" false), Polish patterns ("wymien wszystkie terminy" true, "podsumuj" true), null/empty returns false

### 3. `tests/unit/case-retrieval.test.ts`
Tests for `CaseRetrievalService` using subclass strategy (override `_getCaseDocumentIds`, `_getBm25Candidates`, `_getVectorCandidates`, `_voyageRerank`):
- Cross-case isolation: search for caseId=1 never returns caseId=2 documents and vice versa
- Non-existent caseId returns empty results with lowConfidence=true
- Low confidence: all rerank scores < 0.35 -> lowConfidence=true; scores >= 0.35 -> lowConfidence=false
- Reranker fallback: service falls back to RRF scores when _voyageRerank returns candidates without rerankScore
- Real _voyageRerank with missing VOYAGE_API_KEY: falls back to returning candidates as-is

### 4. `src/app/api/legal-hub/cases/[id]/documents/status/route.ts`
New GET endpoint:
- Auth via `auth()` — 401 if no session
- Calls `getCaseDocumentIndexingStatus(caseId)` from db-imports
- Maps rows to status: `processed=0` -> "processing"; `processed=1 AND chunksIndexed > 0` -> "indexed"; `processed=1 AND chunksIndexed = 0` -> "failed"
- Returns JSON array, always 200 (empty array on error or invalid caseId)

### 5. `src/components/legal-hub/case-documents-tab.tsx`
Added indexing status badges:
- `IndexingBadge` component: green "Indexed" / amber pulsing "Indexing..." / red "Failed"
- `fetchIndexingStatus` callback fetches from status endpoint on mount
- Polls every 5s while any document is "processing"; stops when all indexed/failed
- Badge shown per-document next to document name (only for linked documents with document_id)
- Silently skips if status endpoint returns error (no user-visible error)

### 6. `package.json`
Added `"test": "vitest run"` script.

## Design Decisions

1. **Subclass strategy for CaseRetrievalService tests** — Rather than mocking `query()`, `getEmbedding()`, etc., tests subclass `CaseRetrievalService` and override private methods. This tests the orchestration logic (RRF merge, adaptive expansion, result building) without requiring a real database or network.

2. **Polling with useRef** — Used `useRef` for the interval ID to avoid stale closure issues in the cleanup function.

3. **IndexingBadge as local component** — Defined inside the same file rather than a separate component, since it's small and only used here.

4. **Dark mode support** — Badge colors include `dark:` variants for consistency with the existing design system.
