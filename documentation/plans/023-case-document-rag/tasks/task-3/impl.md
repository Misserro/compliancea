# Task 3 — Grounded Answer Generation: Implementation Notes

**Status:** Implemented
**TypeScript check:** Passes (zero errors)

---

## Files Created

1. **`prompts/case-chat-grounded.md`** — Strict grounded system prompt in Polish. Instructs Claude to answer only from tagged evidence blocks, insert `[cit:chunkId]` markers, output pure JSON `{answerText, citations}`, and refuse to hallucinate.

2. **`lib/citation-assembler.js`** — Four exported functions:
   - `buildEvidencePrompt(chunks)` — formats RetrievalResult[] as `[CHUNK:id|DOC:id|PAGE:n]\ncontent` blocks
   - `parseCitationResponse(rawText, retrievedChunks)` — parses Claude JSON, runs fabrication guard (strips citations referencing chunks not in retrieved set), resolves neighbor sentences from chunk.sentences, computes character-level annotation spans by stripping `[cit:X]` markers and mapping positions
   - `resolveNeighborSentences(chunk, sentenceHit)` — finds best-matching sentence in chunk.sentences[] (exact match, then containment, then prefix overlap), returns adjacent sentences
   - `isHighRiskQuery(query)` — regex patterns for broad queries in English and Polish

3. **`lib/citation-assembler.d.ts`** — TypeScript declarations: `CitationRecord`, `Annotation`, `StructuredAnswer` interfaces + function signatures

4. **`src/lib/citation-assembler-imports.ts`** — Next.js import bridge re-exporting from `../../lib/citation-assembler.js`

## Files Modified

5. **`src/app/api/legal-hub/cases/[id]/chat/route.ts`** — Rewritten:
   - Removed: direct imports of `getDocumentById`, `getCaseChunks`, `getEmbedding`, `bufferToEmbedding`, `cosineSimilarity`; old `Source`/`DocumentRow`/`ChunkRow` types; inline vector search logic; `MAX_WORDS_PER_DOC`/`SIMILARITY_THRESHOLD`/`TOP_K` constants
   - Added: imports of `CaseRetrievalService`, `buildEvidencePrompt`, `parseCitationResponse`, `isHighRiskQuery`
   - Intent routing preserved: case_info/party_lookup/deadline_query use simple context path via `respondWithSimpleContext()` (reads `prompts/case-chat.md`)
   - document_search/summarize now use grounded RAG pipeline:
     1. `isHighRiskQuery(message)` → determines expanded retrieval params
     2. `CaseRetrievalService.search()` with case-scoped hybrid retrieval
     3. `buildEvidencePrompt()` → tagged evidence blocks
     4. Claude call with grounded system prompt + assistant prefill `{"`  to encourage JSON
     5. `parseCitationResponse()` → validated StructuredAnswer
     6. If `retrieval.lowConfidence` → override confidence to "low"
   - All responses now use StructuredAnswer shape: `{answerText, annotations, citations, usedDocuments, confidence, needsDisambiguation}`
   - Old `{answer, sources, needsDisambiguation}` shape is no longer returned

## Key Design Decisions

- **Assistant prefill `{"` on the Claude call** forces JSON output start, reducing preamble/markdown risk
- **Fabrication guard** validates every `[cit:X]` chunkId against the retrieved set before returning
- **Sentence neighbor resolution** overrides Claude's best-effort sentenceBefore/sentenceAfter with actual chunk sentence data
- **Annotation spans** map to the cleaned answerText (all `[cit:X]` markers stripped), with start/end pointing to the sentence that was cited
- **Graceful degradation** on JSON parse failure: returns raw text with confidence "low" and empty citations

## Simplifications from Plan

- **Confidence is two-tier (high/low), not three-tier.** The plan mentioned "medium" for single low-score citations, but the implementation uses only "high" (default from `parseCitationResponse`) and "low" (overridden by caller when `retrieval.lowConfidence` is true). This is sufficient for the Task 4 UI.
- **stop_reason guard added.** If Claude's response is truncated (`stop_reason === "max_tokens"`), the route returns a degraded response immediately instead of attempting to parse incomplete JSON.

## Response Shape (StructuredAnswer)

```json
{
  "answerText": "Cleaned answer text without [cit:X] markers",
  "annotations": [{"start": 0, "end": 45, "citationIds": [123]}],
  "citations": [{"chunkId": 123, "documentId": 1, "documentName": "...", "page": 3, "sentenceHit": "...", "sentenceBefore": "...", "sentenceAfter": "..."}],
  "usedDocuments": [{"id": 1, "name": "..."}],
  "confidence": "high",
  "needsDisambiguation": false
}
```
