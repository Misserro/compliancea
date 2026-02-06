import { getChunksByDocumentIds, getAllChunksWithEmbeddings, query as dbQuery } from "./db.js";
import { getEmbedding, bufferToEmbedding } from "./embeddings.js";

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} - Similarity score between -1 and 1
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Search documents for relevant chunks based on query
 *
 * Refactored to use an options object for extensibility.
 * Backward-compatible: also accepts (query, documentIds, topK) signature.
 *
 * @param {string} queryText - Search query
 * @param {Object|number[]} [optionsOrDocIds] - Options object or legacy documentIds array
 * @param {number} [legacyTopK] - Legacy topK parameter (ignored if options object used)
 *
 * Options object:
 * @param {number[]} [options.documentIds] - Array of document IDs to search (empty = all)
 * @param {number} [options.topK=5] - Number of top results to return
 * @param {string[]} [options.statusFilter] - Only include docs with these statuses (e.g. ['approved'])
 * @param {string[]} [options.excludeStatuses] - Exclude docs with these statuses
 * @param {Object} [options.metadataFilters] - Filter by document metadata fields
 *   Example: { doc_type: 'contract', jurisdiction: 'EU', client: 'Acme' }
 * @param {boolean} [options.legalHoldOnly] - Only include documents under legal hold
 *
 * @returns {Promise<{content: string, documentName: string, documentId: number, score: number, chunkIndex: number}[]>}
 */
export async function searchDocuments(queryText, optionsOrDocIds = {}, legacyTopK = undefined) {
  // Backward compatibility: detect if called with old (query, docIds, topK) signature
  let options;
  if (Array.isArray(optionsOrDocIds)) {
    options = {
      documentIds: optionsOrDocIds,
      topK: legacyTopK || 5,
    };
  } else {
    options = optionsOrDocIds;
  }

  const {
    documentIds = [],
    topK = 5,
    statusFilter = null,
    excludeStatuses = null,
    metadataFilters = null,
    legalHoldOnly = false,
  } = options;

  // Get query embedding
  const queryEmbedding = await getEmbedding(queryText);

  // Get chunks to search
  let chunks;

  // If metadata filters are specified, use filtered query
  if (statusFilter || excludeStatuses || metadataFilters || legalHoldOnly) {
    chunks = getChunksFiltered({
      documentIds,
      statusFilter,
      excludeStatuses,
      metadataFilters,
      legalHoldOnly,
    });
  } else if (documentIds && documentIds.length > 0) {
    chunks = getChunksByDocumentIds(documentIds);
  } else {
    chunks = getAllChunksWithEmbeddings();
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Calculate similarity scores
  const scored = chunks.map((chunk) => {
    const chunkEmbedding = bufferToEmbedding(chunk.embedding);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);

    return {
      content: chunk.content,
      documentName: chunk.document_name,
      documentId: chunk.document_id,
      chunkIndex: chunk.chunk_index,
      score,
    };
  });

  // Sort by score descending and return top K
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

/**
 * Get chunks filtered by document metadata
 * Joins documents table to apply metadata-level filters before similarity search
 * @param {Object} filters
 * @returns {Object[]} - Chunk rows with document info
 */
function getChunksFiltered(filters) {
  const conditions = ["c.embedding IS NOT NULL"];
  const params = [];

  // Filter by specific document IDs
  if (filters.documentIds && filters.documentIds.length > 0) {
    const placeholders = filters.documentIds.map(() => "?").join(",");
    conditions.push(`c.document_id IN (${placeholders})`);
    params.push(...filters.documentIds);
  }

  // Filter by allowed statuses
  if (filters.statusFilter && filters.statusFilter.length > 0) {
    const placeholders = filters.statusFilter.map(() => "?").join(",");
    conditions.push(`(d.status IN (${placeholders}) OR d.status IS NULL)`);
    params.push(...filters.statusFilter);
  }

  // Exclude certain statuses
  if (filters.excludeStatuses && filters.excludeStatuses.length > 0) {
    const placeholders = filters.excludeStatuses.map(() => "?").join(",");
    conditions.push(`(d.status NOT IN (${placeholders}) OR d.status IS NULL)`);
    params.push(...filters.excludeStatuses);
  }

  // Legal hold only
  if (filters.legalHoldOnly) {
    conditions.push("d.legal_hold = 1");
  }

  // Metadata filters (simple field=value matching)
  if (filters.metadataFilters) {
    for (const [field, value] of Object.entries(filters.metadataFilters)) {
      if (value === null || value === undefined) continue;

      const allowedMetadataFields = [
        "doc_type", "client", "jurisdiction", "category", "source",
      ];
      if (allowedMetadataFields.includes(field)) {
        conditions.push(`d.${field} = ?`);
        params.push(value);
      }
    }
  }

  const whereClause = conditions.join(" AND ");

  return dbQuery(
    `SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE ${whereClause}
     ORDER BY c.document_id, c.chunk_index`,
    params
  );
}

/**
 * Format search results for display or use in prompts
 * @param {Array} results - Search results from searchDocuments
 * @returns {string} - Formatted string
 */
export function formatSearchResults(results) {
  if (!results || results.length === 0) {
    return "No relevant content found.";
  }

  return results
    .map((r, i) => {
      const scorePercent = (r.score * 100).toFixed(1);
      return `[${i + 1}] From "${r.documentName}" (relevance: ${scorePercent}%):\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Get unique document sources from search results
 * @param {Array} results - Search results
 * @returns {{documentId: number, documentName: string, maxScore: number}[]}
 */
export function getSourceDocuments(results) {
  const sources = new Map();

  for (const result of results) {
    if (!sources.has(result.documentId)) {
      sources.set(result.documentId, {
        documentId: result.documentId,
        documentName: result.documentName,
        maxScore: result.score,
      });
    } else {
      const existing = sources.get(result.documentId);
      if (result.score > existing.maxScore) {
        existing.maxScore = result.score;
      }
    }
  }

  return Array.from(sources.values()).sort((a, b) => b.maxScore - a.maxScore);
}
