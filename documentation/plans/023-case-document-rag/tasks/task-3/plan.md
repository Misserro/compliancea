# Task 3 — Grounded Answer Generation: Implementation Plan

**Status:** Planning
**Depends on:** Task 2 (Hybrid Retrieval Service) — implemented, in review
**Blocks:** Task 4 (Citation Hover Card UI)

---

## Overview

Replace the current case chat generation pipeline with a citation-grounded system that:
1. Uses `CaseRetrievalService` (Task 2) for hybrid retrieval
2. Formats retrieved chunks as tagged evidence blocks for Claude
3. Forces Claude to output structured JSON with inline `[cit:X]` markers
4. Validates citations against the actual retrieved set (fabrication guard)
5. Maps citation markers to character-level annotation spans

---

## Files to Create/Modify

### 1. `prompts/case-chat-grounded.md` (NEW)

Strict grounded system prompt replacing `prompts/case-chat.md` for RAG flow.

**Key instructions to Claude:**
- Answer ONLY from evidence blocks tagged `[CHUNK:chunkId|DOC:docId|PAGE:N]`
- Insert `[cit:chunkId]` after every sentence that uses information from a chunk
- If evidence is insufficient: state clearly in Polish ("Na podstawie dostepnych dokumentow sprawy nie moge odpowiedziec na to pytanie.")
- Never fabricate citations or cite documents not in the evidence
- Output ONLY a JSON object: `{"answerText": "...[cit:X]...", "citations": {"chunkId": {"documentId", "documentName", "page", "sentenceHit", "sentenceBefore", "sentenceAfter"}}}`
- Keep answers concise: 1-3 sentences for simple questions, bullet lists for enumerations
- Language: Polish

**Design decisions:**
- The prompt will instruct Claude to put `[cit:X]` markers inline in answerText (not separate). This allows `parseCitationResponse` to find them and compute character offsets after stripping markers.
- Citations object is keyed by chunkId for easy lookup during validation.
- sentenceBefore/sentenceAfter are requested from Claude as "best effort" — the assembler will override them with actual sentence neighbors from chunk data if available.

### 2. `lib/citation-assembler.js` (NEW)

Pure utility module with no side effects. Four exported functions:

#### `buildEvidencePrompt(chunks: RetrievalResult[]) → string`
- Iterates `chunks`, for each produces:
  ```
  [CHUNK:{chunkId}|DOC:{documentId}|PAGE:{pageNumber ?? '?'}]
  {content}
  ```
- Joins blocks with `\n\n`
- No truncation — the retrieval service already limits to top 20-30 chunks

#### `parseCitationResponse(rawText: string, retrievedChunks: RetrievalResult[]) → StructuredAnswer`
1. Strip markdown code fences if present (````json ... ````)
2. `JSON.parse(rawText)` → raw object
3. Extract `answerText` and `citations` from raw object
4. **Fabrication guard:** Build a Set of valid chunkIds from `retrievedChunks`. For each key in `citations{}`, if not in the set → delete it. For each `[cit:X]` in answerText, if X not in valid set → strip the marker.
5. **Resolve neighbor sentences:** For each valid citation, call `resolveNeighborSentences(chunk, sentenceHit)` using the chunk's `sentences` array. Override sentenceBefore/sentenceAfter with resolved values.
6. **Compute annotations:** Find all `[cit:X]` markers in answerText, record their positions, then strip them. Produce `annotations[]` array: `{start, end, citationIds}` where start/end are character offsets in the *cleaned* answerText.
7. **Build usedDocuments:** Deduplicate `{id, name}` from valid citations.
8. **Determine confidence:** Default "high". If only 1 citation and rerankScore < 0.5 → "medium". Caller can override to "low" based on retrieval's `lowConfidence`.
9. Return `StructuredAnswer`: `{answerText, annotations, citations, usedDocuments, confidence, needsDisambiguation: false}`

**Error handling:** If JSON.parse fails, return a degraded response: `{answerText: rawText, annotations: [], citations: [], usedDocuments: [], confidence: "low", needsDisambiguation: false}`

#### `resolveNeighborSentences(chunk, sentenceHit) → {sentenceBefore, sentenceAfter}`
- If `chunk.sentences` is null/empty → return `{sentenceBefore: "", sentenceAfter: ""}`
- Find `sentenceHit` in `chunk.sentences` by substring match (trim + includes, since Claude may paraphrase slightly — use best match by Levenshtein-like overlap if exact match fails)
- Simple approach: find the sentence in `sentences[]` whose `.text` is closest to `sentenceHit` (contains or is contained by). Return the previous and next sentence's `.text`, or `""` at boundaries.

#### `isHighRiskQuery(query) → boolean`
- Regex match (case-insensitive) for patterns indicating broad retrieval need:
  - English: `list all`, `summarize`, `all deadlines`, `all references`, `every`, `complete list`
  - Polish: `wymień wszystk`, `podsumuj`, `wszystkie terminy`, `wszystkie odniesienia`, `pełna lista`, `zestawienie`
- Returns `true` if any pattern matches

### 3. `lib/citation-assembler.d.ts` (NEW)

TypeScript declarations matching the JS exports:

```typescript
import { RetrievalResult } from "./case-retrieval";

export interface CitationRecord {
  chunkId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  sentenceHit: string;
  sentenceBefore: string;
  sentenceAfter: string;
}

export interface Annotation {
  start: number;
  end: number;
  citationIds: number[];
}

export interface StructuredAnswer {
  answerText: string;
  annotations: Annotation[];
  citations: CitationRecord[];
  usedDocuments: Array<{ id: number; name: string }>;
  confidence: "high" | "medium" | "low";
  needsDisambiguation: boolean;
}

export function buildEvidencePrompt(chunks: RetrievalResult[]): string;
export function parseCitationResponse(rawText: string, retrievedChunks: RetrievalResult[]): StructuredAnswer;
export function resolveNeighborSentences(chunk: RetrievalResult, sentenceHit: string): { sentenceBefore: string; sentenceAfter: string };
export function isHighRiskQuery(query: string): boolean;
```

### 4. `src/lib/citation-assembler-imports.ts` (NEW)

Next.js import bridge (same pattern as other `-imports.ts` files):

```typescript
export { buildEvidencePrompt, parseCitationResponse, isHighRiskQuery } from "../../lib/citation-assembler.js";
```

### 5. `src/app/api/legal-hub/cases/[id]/chat/route.ts` (REWRITE)

**Current structure:** Intent classifier → context retrieval by intent → Claude generation → plain text response.

**New structure:**
1. Auth + parse request (keep existing)
2. Get caseId, validate case exists (keep existing)
3. Parse `{message, history}` from body (keep existing)
4. `const highRisk = isHighRiskQuery(message)`
5. Determine intent: keep the Haiku classifier for `case_info`, `party_lookup`, `deadline_query` intents — these don't need RAG and should continue to work as before
6. For `document_search` and `summarize` intents → use the new grounded pipeline:
   a. `const retrieval = await new CaseRetrievalService().search(message, caseId, highRisk ? { bm25Limit: 80, vectorLimit: 80, rerankTopK: 30 } : {})`
   b. If `retrieval.results.length === 0` → return low-confidence insufficient-evidence response
   c. `const evidencePrompt = buildEvidencePrompt(retrieval.results)`
   d. Read grounded system prompt from `prompts/case-chat-grounded.md`
   e. Build messages: history (last 6 turns) + user message with evidence appended
   f. Call Claude (Sonnet) with grounded system prompt
   g. `const structured = parseCitationResponse(rawText, retrieval.results)`
   h. If `retrieval.lowConfidence` → `structured.confidence = "low"`
   i. Return `NextResponse.json(structured)`
7. For `case_info`, `party_lookup`, `deadline_query` → keep existing logic but wrap response in StructuredAnswer format for consistency:
   `{answerText, annotations: [], citations: [], usedDocuments: [], confidence: "high", needsDisambiguation: false}`
8. For `unknown` with disambiguation → keep existing behavior but add StructuredAnswer wrapper

**Key design choice:** We preserve the intent classifier. It efficiently routes non-document queries (case metadata, parties, deadlines) without burning retrieval + reranking costs. Only `document_search` and `summarize` intents use the full RAG pipeline.

**Claude API call for grounded generation:**
- Use assistant prefill `{"` to encourage JSON output start
- `max_tokens: 4096` (structured JSON is larger than plain text)
- No streaming (we need full response for JSON parsing)

---

## Data Flow

```
User message
    │
    ▼
Haiku classifier → intent
    │
    ├── case_info/party_lookup/deadline_query → existing context → simple answer → StructuredAnswer wrapper
    │
    └── document_search/summarize
            │
            ▼
        isHighRiskQuery(message) → highRisk flag
            │
            ▼
        CaseRetrievalService.search(message, caseId, {highRisk options})
            │
            ▼
        buildEvidencePrompt(retrieval.results)
            │
            ▼
        Claude Sonnet + grounded system prompt + evidence
            │
            ▼
        parseCitationResponse(rawText, retrieval.results)
            │
            ├── fabrication guard (strip invalid cit IDs)
            ├── resolveNeighborSentences for each citation
            ├── compute annotation spans
            │
            ▼
        StructuredAnswer JSON response
```

---

## Edge Cases & Error Handling

1. **Claude returns invalid JSON:** `parseCitationResponse` catches parse error → returns degraded `{answerText: rawText, annotations: [], citations: [], confidence: "low"}`
2. **Claude fabricates a citation:** Fabrication guard strips any `[cit:X]` where X is not in the retrieved chunk set
3. **No retrieval results:** Return immediately with insufficient-evidence message, confidence "low"
4. **Claude returns markdown-wrapped JSON:** Strip `\`\`\`json ... \`\`\`` before parsing
5. **sentenceHit not found in chunk.sentences:** `resolveNeighborSentences` returns empty strings for before/after (graceful degradation)
6. **Multiple [cit:X] markers adjacent:** Each gets its own annotation; frontend can merge them if desired
7. **Retrieval lowConfidence + valid citations:** Set confidence to "low" even if citations validate — user should know evidence was sparse

---

## Backward Compatibility

- The route response shape changes from `{answer, sources, needsDisambiguation}` to `StructuredAnswer`. The frontend (case-chat-panel.tsx) will need updating in Task 4 to handle both formats during transition.
- For non-document intents, we wrap the old-style answer in StructuredAnswer format, so the new frontend can handle all responses uniformly.

---

## Implementation Order

1. Create `prompts/case-chat-grounded.md`
2. Create `lib/citation-assembler.js` + `lib/citation-assembler.d.ts`
3. Create `src/lib/citation-assembler-imports.ts`
4. Rewrite `src/app/api/legal-hub/cases/[id]/chat/route.ts`
5. Manual smoke test: verify JSON response shape

---

## Open Questions

- Should we use Claude's tool_use/function calling for structured output instead of system prompt JSON instruction? (Simpler approach: system prompt + prefill is sufficient for this use case and avoids schema overhead.)
- Should the `summarize` intent also use full-text docs (current behavior) or switch to RAG chunks? (Plan: use RAG for consistency, but with highRisk=true for broader retrieval.)
