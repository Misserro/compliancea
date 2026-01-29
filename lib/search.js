import { getChunksByDocumentIds, getAllChunksWithEmbeddings } from "./db.js";
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
 * @param {string} query - Search query
 * @param {number[]} documentIds - Array of document IDs to search (empty = all documents)
 * @param {number} topK - Number of top results to return
 * @returns {Promise<{content: string, documentName: string, documentId: number, score: number, chunkIndex: number}[]>}
 */
export async function searchDocuments(query, documentIds = [], topK = 5) {
  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Get chunks to search
  let chunks;
  if (documentIds && documentIds.length > 0) {
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
