export interface RetrievalResult {
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

export interface SearchResult {
  results: RetrievalResult[];
  lowConfidence: boolean;
}

export interface SearchOptions {
  bm25Limit?: number;
  vectorLimit?: number;
  rrfK?: number;
  rerankTopK?: number;
  expansionThreshold?: number;
}

export class CaseRetrievalService {
  search(query: string, caseId: number, options?: SearchOptions): Promise<SearchResult>;
}
