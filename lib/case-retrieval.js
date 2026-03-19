import { query } from "./db.js";
import { getChunksByCaseId } from "./db.js";
import { getEmbedding, bufferToEmbedding } from "./embeddings.js";
import { cosineSimilarity } from "./search.js";

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";

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
 * @property {number|null} bm25Rank
 * @property {number|null} vectorRank
 * @property {number} rrfScore
 * @property {number|null} rerankScore
 */

/**
 * Sanitize query text for FTS5 MATCH syntax.
 * Strips special characters that would cause parse errors.
 * @param {string} text
 * @returns {string}
 */
function sanitizeFts5Query(text) {
  return text
    .replace(/["*():{}\[\]^~!@#$%&\\|<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse sentences_json from a chunk row.
 * @param {string|null} json
 * @returns {Array<{text: string, charStart: number, charEnd: number}>|null}
 */
function parseSentences(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Build a normalized chunk record from a DB row.
 * @param {Object} row
 * @returns {Object}
 */
function normalizeChunk(row) {
  return {
    chunkId: row.id,
    documentId: row.document_id,
    documentName: row.document_name || "",
    pageNumber: row.page_number ?? null,
    content: row.content,
    sectionTitle: row.section_title ?? null,
    sentences: parseSentences(row.sentences_json),
  };
}

export class CaseRetrievalService {
  /**
   * Hybrid retrieval: BM25 + vector + RRF + Voyage rerank-2 + adaptive expansion.
   * @param {string} queryText
   * @param {number} caseId
   * @param {Object} [options]
   * @param {number} [options.bm25Limit=40]
   * @param {number} [options.vectorLimit=40]
   * @param {number} [options.rrfK=60]
   * @param {number} [options.rerankTopK=20]
   * @param {number} [options.expansionThreshold=0.35]
   * @returns {Promise<{results: RetrievalResult[], lowConfidence: boolean}>}
   */
  async search(queryText, caseId, options = {}) {
    const {
      bm25Limit = 40,
      vectorLimit = 40,
      rrfK = 60,
      rerankTopK = 20,
      expansionThreshold = 0.35,
    } = options;

    // Stage 1 — Case scope filter
    const documentIds = this._getCaseDocumentIds(caseId);
    if (documentIds.length === 0) {
      return { results: [], lowConfidence: true };
    }

    // Stage 2+3 — BM25 and vector retrieval (parallel)
    const [bm25Results, vectorResults] = await Promise.all([
      this._getBm25Candidates(queryText, documentIds, bm25Limit),
      this._getVectorCandidates(queryText, caseId, vectorLimit),
    ]);

    // Stage 4 — RRF merge
    const merged = this._rrfMerge(bm25Results, vectorResults, rrfK, 60);

    if (merged.length === 0) {
      return { results: [], lowConfidence: true };
    }

    // Stage 5 — Voyage rerank
    let reranked = await this._voyageRerank(queryText, merged, rerankTopK);

    // Stage 6 — Adaptive expansion
    const maxRerankScore = Math.max(...reranked.map((r) => r.rerankScore ?? 0));
    let lowConfidence = false;

    if (maxRerankScore < expansionThreshold) {
      // Expand retrieval
      const [expandedBm25, expandedVector] = await Promise.all([
        this._getBm25Candidates(queryText, documentIds, 80),
        this._getVectorCandidates(queryText, caseId, 80),
      ]);
      const expandedMerged = this._rrfMerge(expandedBm25, expandedVector, rrfK, 80);

      if (expandedMerged.length > 0) {
        reranked = await this._voyageRerank(queryText, expandedMerged, 30);
      }
      lowConfidence = true;
    }

    // Build final results
    const results = reranked.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentName: r.documentName,
      pageNumber: r.pageNumber,
      content: r.content,
      sectionTitle: r.sectionTitle,
      sentences: r.sentences,
      score: r.rerankScore ?? r.rrfScore,
      bm25Rank: r.bm25Rank ?? null,
      vectorRank: r.vectorRank ?? null,
      rrfScore: r.rrfScore,
      rerankScore: r.rerankScore ?? null,
    }));

    return { results, lowConfidence };
  }

  /**
   * Get document IDs linked to a case.
   * @param {number} caseId
   * @returns {number[]}
   */
  _getCaseDocumentIds(caseId) {
    const rows = query(
      `SELECT document_id FROM case_documents WHERE case_id = ? AND document_id IS NOT NULL`,
      [caseId]
    );
    return rows.map((r) => r.document_id);
  }

  /**
   * BM25 retrieval via FTS5.
   * @param {string} queryText
   * @param {number[]} documentIds
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async _getBm25Candidates(queryText, documentIds, limit) {
    const sanitized = sanitizeFts5Query(queryText);
    if (!sanitized) return [];

    try {
      const placeholders = documentIds.map(() => "?").join(",");
      const rows = query(
        `SELECT c.id, c.content, c.document_id, c.chunk_index, c.page_number,
                c.section_title, c.sentences_json, fts.rank,
                d.name as document_name
         FROM chunks_fts fts
         JOIN chunks c ON c.id = fts.rowid
         JOIN documents d ON c.document_id = d.id
         WHERE chunks_fts MATCH ?
           AND c.document_id IN (${placeholders})
         ORDER BY fts.rank
         LIMIT ?`,
        [sanitized, ...documentIds, limit]
      );

      return rows.map((row, index) => ({
        ...normalizeChunk(row),
        bm25Rank: index + 1,
        bm25RawRank: row.rank,
        vectorRank: null,
        rrfScore: 0,
        rerankScore: null,
      }));
    } catch (err) {
      console.warn("FTS5 BM25 retrieval failed, continuing with vector-only:", err.message);
      return [];
    }
  }

  /**
   * Vector retrieval via cosine similarity.
   * @param {string} queryText
   * @param {number} caseId
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async _getVectorCandidates(queryText, caseId, limit) {
    const queryEmbedding = await getEmbedding(queryText);
    const chunks = getChunksByCaseId(caseId);

    if (!chunks || chunks.length === 0) return [];

    const scored = chunks.map((chunk) => {
      const chunkEmbedding = bufferToEmbedding(chunk.embedding);
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        ...normalizeChunk(chunk),
        vectorScore: score,
        bm25Rank: null,
        vectorRank: 0, // assigned below
        rrfScore: 0,
        rerankScore: null,
      };
    });

    scored.sort((a, b) => b.vectorScore - a.vectorScore);
    const top = scored.slice(0, limit);
    top.forEach((item, index) => {
      item.vectorRank = index + 1;
    });

    return top;
  }

  /**
   * Reciprocal Rank Fusion merge.
   * @param {Object[]} bm25Results
   * @param {Object[]} vectorResults
   * @param {number} k - RRF constant (default 60)
   * @param {number} topN - Max results to return
   * @returns {Object[]}
   */
  _rrfMerge(bm25Results, vectorResults, k, topN) {
    const merged = new Map();

    for (const item of bm25Results) {
      const existing = merged.get(item.chunkId);
      if (existing) {
        existing.bm25Rank = item.bm25Rank;
        existing.rrfScore += 1 / (k + item.bm25Rank);
      } else {
        merged.set(item.chunkId, {
          ...item,
          rrfScore: 1 / (k + item.bm25Rank),
        });
      }
    }

    for (const item of vectorResults) {
      const existing = merged.get(item.chunkId);
      if (existing) {
        existing.vectorRank = item.vectorRank;
        existing.rrfScore += 1 / (k + item.vectorRank);
      } else {
        merged.set(item.chunkId, {
          ...item,
          rrfScore: 1 / (k + item.vectorRank),
        });
      }
    }

    const results = Array.from(merged.values());
    results.sort((a, b) => b.rrfScore - a.rrfScore);
    return results.slice(0, topN);
  }

  /**
   * Rerank candidates using Voyage rerank-2.
   * Falls back to RRF ordering on API failure.
   * @param {string} queryText
   * @param {Object[]} candidates
   * @param {number} topK
   * @returns {Promise<Object[]>}
   */
  async _voyageRerank(queryText, candidates, topK) {
    if (!process.env.VOYAGE_API_KEY) {
      console.warn("VOYAGE_API_KEY not set, falling back to RRF ordering");
      return candidates.slice(0, topK);
    }

    try {
      const documents = candidates.map((c) => c.content);

      const response = await fetch(VOYAGE_RERANK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "voyage-rerank-2",
          query: queryText,
          documents,
          top_k: topK,
          truncation: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Voyage rerank API error: ${response.status} - ${errorText}`);
        return candidates.slice(0, topK);
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        console.warn("Voyage rerank: unexpected response format");
        return candidates.slice(0, topK);
      }

      return data.results.map((item) => ({
        ...candidates[item.index],
        rerankScore: item.relevance_score,
      }));
    } catch (err) {
      console.warn("Voyage rerank failed, falling back to RRF ordering:", err.message);
      return candidates.slice(0, topK);
    }
  }
}
