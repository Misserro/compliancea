/**
 * Process-local session context cache for Legal Hub case chat.
 *
 * Stores assembled case context (priming text + chunk data) so that
 * follow-up turns can skip the full BM25+vector+Voyage rerank pipeline
 * and instead inject a stable priming prefix for Anthropic prompt cache hits.
 *
 * Key: `${userId}:${caseId}`. TTL: 5 minutes (matches Anthropic ephemeral window).
 */

export interface RetrievalChunk {
  chunkId: number;
  documentId: number;
  documentName: string;
  pageNumber: number | null;
  content: string;
  sectionTitle: string | null;
  sentences: Array<{ text: string; charStart: number; charEnd: number }> | null;
  score: number;
  bm25Rank: number | null;
  vectorRank: number | null;
  rrfScore: number;
  rerankScore: number | null;
}

export interface SessionContext {
  primedContext: string;
  chunkIds: Set<number>;
  primingChunks: RetrievalChunk[];
  firstUserMessage: string;
  expiresAt: number;
}

const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

const sessionCache = new Map<string, SessionContext>();

function cacheKey(userId: string, caseId: string): string {
  return `${userId}:${caseId}`;
}

export function getSessionContext(
  userId: string,
  caseId: string
): SessionContext | null {
  const key = cacheKey(userId, caseId);
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(key);
    return null;
  }
  return entry;
}

export function setSessionContext(
  userId: string,
  caseId: string,
  primedContext: string,
  chunkIds: Set<number>,
  primingChunks: RetrievalChunk[],
  firstUserMessage: string
): void {
  const key = cacheKey(userId, caseId);
  sessionCache.set(key, {
    primedContext,
    chunkIds,
    primingChunks,
    firstUserMessage,
    expiresAt: Date.now() + SESSION_TTL,
  });
}

export function clearSessionContext(
  userId: string,
  caseId: string
): void {
  const key = cacheKey(userId, caseId);
  sessionCache.delete(key);
}
