import crypto from "crypto";
import { query } from "./db.js";

/**
 * Compute SHA-256 hash of raw file bytes
 * @param {Buffer} buffer - Raw file content
 * @returns {string} - Hex-encoded SHA-256 hash
 */
export function computeFileHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Compute SHA-256 hash of normalized extracted text
 * Normalizes whitespace and lowercases for content-based deduplication
 * @param {string} text - Extracted document text
 * @returns {string} - Hex-encoded SHA-256 hash
 */
export function computeContentHash(text) {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Find exact duplicate documents by content hash or file hash
 * @param {string} contentHash - SHA-256 of normalized text
 * @param {string} fileHash - SHA-256 of raw file bytes
 * @param {number} excludeId - Document ID to exclude (self)
 * @returns {{contentMatches: Object[], fileMatches: Object[]}}
 */
export function findDuplicates(contentHash, fileHash, excludeId = null) {
  const excludeClause = excludeId ? " AND id != ?" : "";
  const params = excludeId ? [excludeId] : [];

  const contentMatches = contentHash
    ? query(
        `SELECT id, name, path, source, content_hash FROM documents WHERE content_hash = ?${excludeClause}`,
        [contentHash, ...params]
      )
    : [];

  const fileMatches = fileHash
    ? query(
        `SELECT id, name, path, source, file_hash FROM documents WHERE file_hash = ?${excludeClause}`,
        [fileHash, ...params]
      )
    : [];

  return { contentMatches, fileMatches };
}

/**
 * Find near-duplicate documents using average embedding similarity
 * Computes average chunk embedding for the given document and compares
 * against all other processed documents
 * @param {number} documentId - Document to check
 * @param {number} threshold - Cosine similarity threshold (default 0.92)
 * @returns {Promise<{documentId: number, documentName: string, similarity: number}[]>}
 */
export function findNearDuplicates(documentId, threshold = 0.92) {
  // Get chunks for the target document
  const targetChunks = query(
    `SELECT embedding FROM chunks WHERE document_id = ? AND embedding IS NOT NULL`,
    [documentId]
  );

  if (targetChunks.length === 0) return [];

  // Compute average embedding for target document
  const targetAvg = computeAverageEmbedding(targetChunks);
  if (!targetAvg) return [];

  // Get all other processed documents
  const otherDocs = query(
    `SELECT DISTINCT d.id, d.name FROM documents d
     JOIN chunks c ON c.document_id = d.id
     WHERE d.id != ? AND c.embedding IS NOT NULL AND d.processed = 1`,
    [documentId]
  );

  const nearDuplicates = [];

  for (const doc of otherDocs) {
    const docChunks = query(
      `SELECT embedding FROM chunks WHERE document_id = ? AND embedding IS NOT NULL`,
      [doc.id]
    );

    const docAvg = computeAverageEmbedding(docChunks);
    if (!docAvg) continue;

    const similarity = cosineSimilarity(targetAvg, docAvg);
    if (similarity >= threshold) {
      nearDuplicates.push({
        documentId: doc.id,
        documentName: doc.name,
        similarity: Math.round(similarity * 1000) / 1000,
      });
    }
  }

  return nearDuplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Compute average embedding from an array of chunk rows
 * @param {Object[]} chunks - Array of chunk rows with embedding BLOBs
 * @returns {number[]|null}
 */
function computeAverageEmbedding(chunks) {
  if (chunks.length === 0) return null;

  let dim = 0;
  let sum = null;

  for (const chunk of chunks) {
    const buf = chunk.embedding;
    if (!buf) continue;

    const floats = new Float32Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    );

    if (!sum) {
      dim = floats.length;
      sum = new Float64Array(dim);
    }

    for (let i = 0; i < dim; i++) {
      sum[i] += floats[i];
    }
  }

  if (!sum) return null;

  const avg = new Array(dim);
  for (let i = 0; i < dim; i++) {
    avg[i] = sum[i] / chunks.length;
  }
  return avg;
}

/**
 * Cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}
