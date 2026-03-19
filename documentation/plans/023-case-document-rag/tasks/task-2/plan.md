# Task 2 — Hybrid Retrieval Service: Implementation Plan

## Overview

Create `lib/case-retrieval.js` implementing `CaseRetrievalService` with a 6-stage hybrid retrieval pipeline: case-scope filter, BM25 via FTS5, vector cosine similarity, RRF merge, Voyage rerank-2, and adaptive expansion.

## File to Create

**`lib/case-retrieval.js`** — single new file, no modifications to existing files needed.

### Dependencies (all already available)

| Import | Source | Purpose |
|--------|--------|---------|
| `query` | `./db.js` | Run FTS5 MATCH queries for BM25 retrieval |
| `getChunksByCaseId` | `./db.js` | Load case chunks with embeddings for vector search |
| `getEmbedding` | `./embeddings.js` | Embed the query text via Voyage voyage-3-lite |
| `bufferToEmbedding` | `./embeddings.js` | Deserialize stored Float32Array embeddings |
| `cosineSimilarity` | `./search.js` | Already exported — compute vector similarity |

Note: `lib/search.js` already exports `cosineSimilarity` (confirmed in lead notes). No changes to `lib/search.js` needed.

## Implementation Stages

### Stage 1 — Case Scope Filter

```js
getCaseDocumentIds(caseId)
```

- Query: `SELECT document_id FROM case_documents WHERE case_id = ? AND document_id IS NOT NULL`
- Returns array of document_id integers
- If empty → return `{ results: [], lowConfidence: true }` immediately (no documents to search)

### Stage 2 — BM25 Retrieval via FTS5

```js
getBm25Candidates(queryText, documentIds, limit = 40)
```

- Sanitize query for FTS5: strip special characters (`*`, `"`, `(`, `)`, `:`), collapse whitespace, wrap remaining words as space-separated tokens (FTS5 implicit AND)
- Query using `query()` from db.js:
  ```sql
  SELECT c.id, c.content, c.document_id, c.chunk_index, c.page_number,
         c.section_title, c.sentences_json, fts.rank
  FROM chunks_fts fts
  JOIN chunks c ON c.id = fts.rowid
  WHERE chunks_fts MATCH ?
    AND c.document_id IN (<<placeholders>>)
  ORDER BY fts.rank
  LIMIT ?
  ```
- **CRITICAL**: FTS5 `rank` is NEGATIVE (more negative = better match). `ORDER BY fts.rank` already sorts best-first (most negative first).
- After fetching, assign `bm25Rank = 1, 2, 3...` positionally (1 = best match)
- Store raw `rank` value on each result for diagnostics

### Stage 3 — Vector Retrieval

```js
getVectorCandidates(queryText, caseId, limit = 40)
```

- Call `getEmbedding(queryText)` to get query vector (1024-dim voyage-3-lite)
- Call `getChunksByCaseId(caseId)` to load all case chunks with embeddings
- For each chunk: `bufferToEmbedding(chunk.embedding)` → compute `cosineSimilarity(queryVec, chunkVec)`
- Sort descending by similarity score, take top `limit`
- Assign `vectorRank = 1, 2, 3...` (1 = best match)

### Stage 4 — RRF Merge (k=60)

```js
rrfMerge(bm25Results, vectorResults, k = 60, topN = 60)
```

- Build a Map keyed by `chunk.id`
- For each chunk appearing in BM25 results: `rrfScore += 1 / (k + bm25Rank)`
- For each chunk appearing in vector results: `rrfScore += 1 / (k + vectorRank)`
- Chunks appearing in both lists get summed scores from both
- Deduplicate by chunk id (store full chunk record from whichever source has it)
- Sort by `rrfScore` descending, keep top `topN`

### Stage 5 — Voyage Rerank-2

```js
voyageRerank(query, candidates, topK = 20)
```

- POST to `https://api.voyageai.com/v1/rerank`
- Headers: `Authorization: Bearer ${process.env.VOYAGE_API_KEY}`, `Content-Type: application/json`
- Body:
  ```json
  {
    "model": "voyage-rerank-2",
    "query": "<query text>",
    "documents": ["<chunk1 content>", "<chunk2 content>", ...],
    "top_k": 20,
    "truncation": true
  }
  ```
- Response format:
  ```json
  {
    "results": [
      { "index": 0, "relevance_score": 0.94 },
      { "index": 5, "relevance_score": 0.87 },
      ...
    ],
    "total_tokens": 1234
  }
  ```
- Map each `results[i].index` back to `candidates[index]` to recover the chunk record
- Store `relevance_score` as `rerankScore` on each result
- **Error handling**: If Voyage rerank API fails (network error, 5xx, rate limit), fall back to RRF-ordered results (top `topK` by rrfScore). Log warning. Do not crash.

### Stage 6 — Adaptive Expansion

```js
// Inside search() method
```

- After initial rerank: check `Math.max(...reranked.map(r => r.rerankScore))`
- If max score < 0.35:
  - Re-run Stage 2 with `limit = 80`, Stage 3 with `limit = 80`
  - Re-run Stage 4 with the expanded candidates
  - Re-run Stage 5 with `topK = 30`
  - Set `lowConfidence = true` in result
- If max score >= 0.35: `lowConfidence = false`

## Class API

```js
class CaseRetrievalService {
  /**
   * @param {string} query - User's search query
   * @param {number} caseId - Case ID to scope retrieval to
   * @param {Object} [options]
   * @param {number} [options.bm25Limit=40] - BM25 candidate count
   * @param {number} [options.vectorLimit=40] - Vector candidate count
   * @param {number} [options.rrfK=60] - RRF k parameter
   * @param {number} [options.rerankTopK=20] - Rerank top_k
   * @param {number} [options.expansionThreshold=0.35] - Rerank score threshold for expansion
   * @returns {Promise<{results: RetrievalResult[], lowConfidence: boolean}>}
   */
  async search(query, caseId, options = {}) { ... }
}
```

### RetrievalResult Type (JSDoc typedef)

```js
/**
 * @typedef {Object} RetrievalResult
 * @property {number} chunkId
 * @property {number} documentId
 * @property {string} documentName
 * @property {number|null} pageNumber
 * @property {string} content
 * @property {string|null} sectionTitle
 * @property {Array<{text: string, charStart: number, charEnd: number}>|null} sentences
 * @property {number} score - Final score (rerankScore if available, else rrfScore)
 * @property {number|null} bm25Rank - Position in BM25 results (null if not in BM25 set)
 * @property {number|null} vectorRank - Position in vector results (null if not in vector set)
 * @property {number} rrfScore - RRF merged score
 * @property {number|null} rerankScore - Voyage rerank-2 relevance score (0-1)
 */
```

## FTS5 Query Sanitization

FTS5 has special syntax characters that can cause parse errors. The sanitizer will:
1. Remove `"`, `*`, `(`, `)`, `:`, `{`, `}`, `[`, `]` characters
2. Collapse multiple whitespace to single space
3. Trim leading/trailing whitespace
4. If result is empty after sanitization, return empty BM25 results (no crash)

This produces an implicit AND query — FTS5 default behavior when words are space-separated.

## Error Handling Strategy

| Failure | Behavior |
|---------|----------|
| No documents for case | Return `{ results: [], lowConfidence: true }` |
| FTS5 MATCH query fails | Log warning, proceed with vector-only results |
| `getEmbedding()` fails | Throw — caller handles (embedding API is critical path) |
| Voyage rerank API error | Log warning, fall back to RRF ordering (top_k by rrfScore) |
| Zero results after merge | Return `{ results: [], lowConfidence: true }` |

## Exported API

```js
// Default singleton export
module.exports = { CaseRetrievalService };
```

The file uses CommonJS (`require`/`module.exports`) to match the existing `lib/*.js` convention (db.js, search.js, embeddings.js all use ESM exports but are consumed as CJS in some paths). Actually — checking the codebase, `lib/db.js`, `lib/search.js`, and `lib/embeddings.js` all use ESM `export` syntax. So `lib/case-retrieval.js` will also use ESM exports:

```js
export class CaseRetrievalService { ... }
```

A TypeScript re-export bridge `src/lib/case-retrieval-imports.ts` will also be needed for Next.js API routes to consume this module (following the existing `*-imports.ts` pattern).

## Files to Create

1. **`lib/case-retrieval.js`** — Main implementation (ESM, ~200 lines)
2. **`lib/case-retrieval.d.ts`** — TypeScript declarations for the class and types
3. **`src/lib/case-retrieval-imports.ts`** — Re-export bridge for Next.js

## Verification Checklist

- [ ] BM25 retrieves chunks containing exact keyword matches even when vector similarity is low
- [ ] Vector retrieves semantically similar chunks even without keyword overlap
- [ ] RRF merge correctly combines scores and deduplicates
- [ ] Rerank orders by relevance and returns top_k
- [ ] Adaptive expansion triggers when max rerank score < 0.35
- [ ] All results are scoped to the queried case's documents only
- [ ] FTS5 query sanitization prevents crashes on special characters
- [ ] Voyage rerank API failure gracefully falls back to RRF ordering
