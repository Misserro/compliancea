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
  parseError?: boolean;
}

export function buildEvidencePrompt(chunks: RetrievalResult[]): string;
export function parseCitationResponse(
  rawText: string,
  retrievedChunks: RetrievalResult[]
): StructuredAnswer;
export function resolveNeighborSentences(
  chunk: RetrievalResult,
  sentenceHit: string
): { sentenceBefore: string; sentenceAfter: string };
export function isHighRiskQuery(query: string): boolean;
