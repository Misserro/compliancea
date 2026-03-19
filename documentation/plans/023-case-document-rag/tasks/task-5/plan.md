# Task 5 — Tests & Processing Status: Plan

## Overview

Add unit tests for chunker, citation-assembler, and case-retrieval modules. Create a status API endpoint and add indexing status badges to the case documents tab.

## Deliverables

### 1. `tests/unit/chunker.test.ts`

Tests for `chunkTextByPages` from `lib/chunker.js`:

- **Single-page document**: chunks all have `pageNumber = 1`
- **Multi-page document**: no chunk has `pageNumber` crossing a page boundary
- **Sentence correctness**: every `sentences[].text` is a substring of `content`
- **Short page (< 20 words)**: produces 1 chunk, not filtered out
- **Empty page**: handled gracefully (0 or 1 chunk, no crash)
- **Empty/null input**: returns `[]`

Pattern: import from `../../lib/chunker.js` with `@ts-ignore` (same as templateEngine.test.ts).

### 2. `tests/unit/citation-assembler.test.ts`

Tests for `parseCitationResponse`, `resolveNeighborSentences`, `isHighRiskQuery`:

- **Valid [cit:X] markers**: map to correct character offsets in cleaned `answerText`
- **Invalid [cit:X]**: where X is not in retrieved chunks, marker is stripped (fabrication guard)
- **resolveNeighborSentences with 1-sentence chunk**: returns empty before/after
- **isHighRiskQuery**: "list all deadlines" -> true, "what is the claim value?" -> false, Polish "wymien wszystkie terminy" -> true

No external dependencies — pure function tests with mock chunk data.

### 3. `tests/unit/case-retrieval.test.ts`

Tests for `CaseRetrievalService`:

- **Cross-case isolation**: mock `_getCaseDocumentIds` and `getChunksByCaseId` for two cases; verify search(query, caseA) never returns chunks with document_id belonging to caseB
- **Low confidence detection**: when reranker returns all scores < 0.35, result has `lowConfidence: true`
- **Reranker fallback**: when Voyage API throws, service falls back to RRF scores without crashing

Strategy: subclass `CaseRetrievalService` to override private methods (`_getCaseDocumentIds`, `_getBm25Candidates`, `_getVectorCandidates`, `_voyageRerank`) with test doubles. This avoids mocking DB/network while testing the orchestration logic.

### 4. `src/app/api/legal-hub/cases/[id]/documents/status/route.ts`

New GET endpoint:

- Auth: `await auth()` — 401 if no session (matches existing pattern)
- Extract `caseId` from params
- Call `getCaseDocumentIndexingStatus(caseId)` from db-imports
- Map each row to status: `processed=0` -> "processing"; `processed=1 AND chunksIndexed > 0` -> "indexed"; `processed=1 AND chunksIndexed = 0` -> "failed"
- Return JSON array `[{documentId, documentName, status}]`
- Always 200 (empty array if no docs)

### 5. `src/components/legal-hub/case-documents-tab.tsx` — Status badges

- Add state: `indexingStatus: Record<number, "processing"|"indexed"|"failed">`
- On mount + after fetchDocuments: fetch `GET /api/legal-hub/cases/{caseId}/documents/status`
- Store status map by documentId
- Poll every 5s while any doc is "processing"; stop when all indexed/failed
- Per-document badge next to name:
  - "Indexed" -> `bg-green-100 text-green-700`
  - "Indexing..." -> `bg-amber-100 text-amber-700` with pulse animation
  - "Failed" -> `bg-red-100 text-red-700`
  - No badge if status not yet loaded
- If status endpoint returns error/404, silently skip (no error shown to user)

## Implementation Order

1. Write the 3 test files (chunker, citation-assembler, case-retrieval)
2. Run `npm test` to verify all pass
3. Create the status API endpoint
4. Modify case-documents-tab.tsx for status badges
5. Run TypeScript check (`npx tsc --noEmit`)
6. Final `npm test` to confirm nothing broke
