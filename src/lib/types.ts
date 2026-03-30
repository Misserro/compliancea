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
  start_date: string | null;
  is_repeating: number;
  recurrence_interval: number | null;
  parent_obligation_id: number | null;
  payment_amount: number | null;
  payment_currency: string | null;
  reporting_frequency: string | null;
  reporting_recipient: string | null;
  compliance_regulatory_body: string | null;
  compliance_jurisdiction: string | null;
  operational_service_type: string | null;
  operational_sla_metric: string | null;
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

export interface Invoice {
  id: number;
  contract_id: number;
  amount: number;
  currency: string;
  description: string | null;
  date_of_issue: string | null;
  date_of_payment: string | null;
  is_paid: number;
  invoice_file_path: string | null;
  payment_confirmation_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceSummary {
  totalInvoiced: number;
  totalPaid: number;
  overdueCount: number;
}

export interface ContractDocument {
  id: number;
  contract_id: number;
  document_id: number | null;
  file_path: string | null;
  file_name: string | null;
  document_type: string;
  label: string | null;
  added_at: string;
  linked_document_name?: string;
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

// ── Legal Hub types ─────────────────────────────────────────────────────────

export const CASE_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export interface LegalCase {
  id: number;
  reference_number: string | null;
  internal_number: string | null;
  title: string;
  case_type: string;
  procedure_type: string | null;
  court: string | null;
  court_division: string | null;
  judge: string | null;
  status: string;
  status_history_json: string;
  summary: string | null;
  claim_description: string | null;
  claim_value: number | null;
  claim_currency: string;
  tags: string;
  extension_data: string;
  priority: CasePriority;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  next_deadline?: string | null;
}

export interface CaseParty {
  id: number;
  case_id: number;
  party_type: string;
  name: string;
  address: string | null;
  representative_name: string | null;
  representative_address: string | null;
  representative_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface CaseDocument {
  id: number;
  case_id: number;
  document_id: number | null;
  file_path: string | null;
  file_name: string | null;
  document_category: string;
  label: string | null;
  date_filed: string | null;
  filing_reference: string | null;
  added_at: string;
}

export interface CaseDeadline {
  id: number;
  case_id: number;
  title: string;
  deadline_type: string;
  due_date: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
}

export interface DeadlineAlert {
  id: number;
  caseId: number;
  caseTitle: string;
  title: string;
  deadline_type: string;
  due_date: string;
  daysUntil: number;
}

export interface CaseTemplate {
  id: number;
  name: string;
  description: string | null;
  document_type: string | null;
  applicable_case_types: string;
  template_body: string;
  variables_json: string;
  is_active: number;
  is_system_template?: number;
  created_at: string;
  updated_at: string;
}

export interface CaseGeneratedDoc {
  id: number;
  case_id: number;
  template_id: number | null;
  template_name: string | null;
  document_name: string;
  generated_content: string;
  filled_variables_json: string;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: number;
  name: string;
  email: string;
  role: string;
}

