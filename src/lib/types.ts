export interface Document {
  id: number;
  name: string;
  path: string;
  folder: string | null;
  category: string | null;
  added_at: string;
  processed: number;
  page_count: number | null;
  word_count: number | null;
  content_hash: string | null;
  file_hash: string | null;
  status: string | null;
  doc_type: string | null;
  client: string | null;
  jurisdiction: string | null;
  tags: string | null;
  auto_tags: string | null;
  confirmed_tags: number;
  sensitivity: string | null;
  language: string | null;
  in_force: string | null;
  metadata_json: string | null;
  full_text: string | null;
  retention_label: string | null;
  retention_until: string | null;
  legal_hold: number;
  gdrive_file_id: string | null;
  gdrive_modified_time: string | null;
  sync_status: string | null;
  version: number;
  canonical_id: number | null;
  superseded_by: number | null;
  source: string | null;
  contracting_company: string | null;
  contracting_vendor: string | null;
  signature_date: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
}

export interface Obligation {
  id: number;
  document_id: number;
  obligation_type: string;
  title: string;
  description: string | null;
  clause_reference: string | null;
  due_date: string | null;
  recurrence: string | null;
  notice_period_days: number | null;
  owner: string | null;
  escalation_to: string | null;
  proof_description: string | null;
  evidence_json: string;
  status: string;
  category: string | null;
  activation: string | null;
  summary: string | null;
  details_json: string | null;
  penalties: string | null;
  stage: string | null;
  department: string | null;
  finalization_note: string | null;
  finalization_document_id: number | null;
  document_name?: string;
  document_status?: string;
  contracting_company?: string;
  contracting_vendor?: string;
}

export interface ObligationStats {
  total: number;
  active: number;
  finalized: number;
  met: number;
  overdue: number;
  upcoming: number;
}

export interface Settings {
  useMinimalSchema: boolean;
  optimizeContextFormatting: boolean;
  useHaikuForExtraction: boolean;
  skipTranslationIfSameLanguage: boolean;
  useRelevanceThreshold: boolean;
  relevanceThresholdValue: number;
  minResultsGuarantee: number;
  policiesTabDocTypes: string[];
}

export interface TokenUsage {
  claude?: {
    input: number;
    output: number;
    total: number;
    model?: string;
    usedHaikuForExtraction?: boolean;
  };
  voyage?: {
    tokens: number;
  };
}

export interface Source {
  documentId: number;
  documentName: string;
  relevance: number;
  docType: string | null;
  category: string | null;
}

export interface QuestionnaireQuestion {
  number: number;
  text: string;
  source: "auto-filled" | "drafted";
  answer: string;
  evidence: Evidence[];
  confidence: "high" | "medium" | "low";
  matchedCardId: number | null;
  similarity: number | null;
}

export interface Evidence {
  documentId: number;
  documentName: string;
  note?: string | null;
  addedAt?: string;
  chunkContent?: string;
  relevance?: number;
}

export interface QaCard {
  id: number;
  question_text: string;
  approved_answer: string;
  evidence_json: string;
  source_questionnaire: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  details: string | null;
  created_at: string;
}


export interface DocumentVersion {
  id: number;
  name: string;
  version: number;
  status: string | null;
  in_force: string | null;
  added_at: string;
  superseded_by: number | null;
  canonical_id: number | null;
}
export interface ContractSummary {
  name: string;
  status: string;
  client: string | null;
  totalObligations: number;
  stageCounts: Record<string, number>;
  overdueCount: number;
  nextDeadline: string | null;
}

export interface Contract {
  id: number;
  name: string;
  path: string;
  status: string;
  doc_type: string;
  client: string | null;
  contracting_company: string | null;
  contracting_vendor: string | null;
  signature_date: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  totalObligations: number;
  activeObligations: number;
  overdueObligations: number;
  finalizedObligations: number;
  nextDeadline: string | null;
}

export interface ContractWithObligations extends Contract {
  obligations: Obligation[];
}

export interface KeyPoint {
  point: string;
  department: string;
  tags: string[];
}

export interface TodoItem {
  task: string;
  source_point: string;
}

export interface AnalyzerResult {
  translated_text?: string;
  summary?: string;
  key_points?: KeyPoint[];
  todos_by_department?: Record<string, TodoItem[]>;
  tokenUsage?: TokenUsage;
}

export interface DeskResult {
  cross_reference?: CrossReference[];
  response_template?: string;
  tokenUsage?: TokenUsage;
  optimizations?: {
    translationSkipped: boolean;
    usedHaikuForExtraction: boolean;
    relevanceThresholdApplied: boolean;
  };
}

export interface CrossReference {
  question: string;
  answer: string;
  found_in: string;
  confidence: "low" | "medium" | "high";
}

export interface MaintenanceResult {
  skipped?: boolean;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
  gdrive?: unknown;
  retention?: unknown;
  unconfirmedTags?: unknown;
  tasks?: unknown;
}

export interface NdaAnalysisResult {
  markdown: string;
  tokenUsage?: TokenUsage;
}
