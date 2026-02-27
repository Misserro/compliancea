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

// ============================================
// Product Hub types
// ============================================

export interface ProductFeature {
  id: number;
  title: string;
  intake_form_json: string | null;
  selected_document_ids: string | null;
  free_context: string | null;
  selected_templates: string | null;
  generated_outputs_json: string | null;
  status: 'idea' | 'in_spec' | 'in_review' | 'approved' | 'in_development' | 'shipped';
  version_history_json: string | null;
  linked_contract_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntakeForm {
  sectionA: {
    problemStatement: string;
    persona: string;
    statusQuo: string;
    whyNow: string;
  };
  sectionB: {
    featureDescription: string;
    userFlow: string;
    outOfScope: string;
    acceptanceCriteria: string;
  };
  sectionC: {
    constraints: string;
    kpis: string;
    systems: string;
    mustHave: string;
    shouldHave: string;
    niceToHave: string;
  };
}

export interface GeneratedOutputs {
  [template: string]: {
    sections: Record<string, string>;
    gaps: string[];
  };
}

export const FEATURE_STATUSES = [
  'idea', 'in_spec', 'in_review', 'approved', 'in_development', 'shipped'
] as const;

export type FeatureStatus = typeof FEATURE_STATUSES[number];

export const STATUS_LABELS: Record<FeatureStatus, string> = {
  idea: 'Idea',
  in_spec: 'In Spec',
  in_review: 'In Review',
  approved: 'Approved',
  in_development: 'In Development',
  shipped: 'Shipped',
};

export const STATUS_COLORS: Record<FeatureStatus, string> = {
  idea: 'bg-gray-100 text-gray-700',
  in_spec: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  in_development: 'bg-purple-100 text-purple-700',
  shipped: 'bg-emerald-100 text-emerald-700',
};

export const TEMPLATES = [
  {
    id: 'feature_brief' as const,
    name: 'Feature Brief',
    audience: 'PM, Stakeholders',
    description: '1-page summary: problem, solution, scope, KPIs',
    promptFile: 'prompts/prompt_feature_brief.md',
  },
  {
    id: 'prd' as const,
    name: 'PRD',
    audience: 'Product, Design',
    description: 'Full requirements doc with user stories and acceptance criteria',
    promptFile: 'prompts/prompt_prd.md',
  },
  {
    id: 'tech_spec' as const,
    name: 'Tech Spec',
    audience: 'Engineering',
    description: 'Functional + non-functional requirements, data model hints, API considerations',
    promptFile: 'prompts/prompt_tech_spec.md',
  },
  {
    id: 'business_case' as const,
    name: 'Business Case',
    audience: 'Management',
    description: 'Business justification, ROI estimation, risks, team dependencies',
    promptFile: 'prompts/prompt_business_case.md',
  },
] as const;

export type TemplateId = 'feature_brief' | 'prd' | 'tech_spec' | 'business_case';

// Sections per template — used to render Step 4 output blocks
export const TEMPLATE_SECTIONS: Record<TemplateId, { id: string; label: string }[]> = {
  feature_brief: [
    { id: 'summary', label: 'Executive Summary' },
    { id: 'problem', label: 'Problem Statement' },
    { id: 'solution', label: 'Proposed Solution' },
    { id: 'scope', label: 'Scope & Out of Scope' },
    { id: 'kpis', label: 'Success Metrics (KPIs)' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  prd: [
    { id: 'problem_statement', label: 'Problem Statement' },
    { id: 'user_personas', label: 'User Personas' },
    { id: 'user_stories', label: 'User Stories + Acceptance Criteria' },
    { id: 'functional_requirements', label: 'Functional Requirements' },
    { id: 'non_functional_requirements', label: 'Non-Functional Requirements' },
    { id: 'out_of_scope', label: 'Out of Scope' },
    { id: 'success_metrics', label: 'Success Metrics (KPIs)' },
    { id: 'risks_dependencies', label: 'Risks & Dependencies' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  tech_spec: [
    { id: 'overview', label: 'Technical Overview' },
    { id: 'functional_requirements', label: 'Functional Requirements' },
    { id: 'non_functional_requirements', label: 'Non-Functional Requirements' },
    { id: 'data_model', label: 'Data Model' },
    { id: 'api_design', label: 'API Design' },
    { id: 'dependencies', label: 'Dependencies & Integrations' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  business_case: [
    { id: 'executive_summary', label: 'Executive Summary' },
    { id: 'business_problem', label: 'Business Problem' },
    { id: 'proposed_solution', label: 'Proposed Solution' },
    { id: 'roi_estimation', label: 'ROI & Value Assessment' },
    { id: 'risks', label: 'Risks' },
    { id: 'team_dependencies', label: 'Team & Dependencies' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
};

// Map section IDs to Lucide icon names. Used as a shared reference for consumers
// that do dynamic icon resolution. output-section.tsx uses its own typed SECTION_ICON_MAP
// with ElementType values for type-safe rendering.
export const SECTION_ICON_NAMES: Record<string, string> = {
  summary: 'FileText',
  executive_summary: 'FileText',
  problem: 'AlertCircle',
  problem_statement: 'AlertCircle',
  business_problem: 'AlertCircle',
  user_personas: 'Users',
  user_stories: 'BookOpen',
  functional_requirements: 'CheckSquare',
  non_functional_requirements: 'Shield',
  risks: 'AlertTriangle',
  risks_dependencies: 'AlertTriangle',
  open_questions: 'HelpCircle',
  kpis: 'TrendingUp',
  success_metrics: 'TrendingUp',
  solution: 'Lightbulb',
  proposed_solution: 'Lightbulb',
  data_model: 'Database',
  api_design: 'Code',
  dependencies: 'GitBranch',
  team_dependencies: 'GitBranch',
  roi_estimation: 'DollarSign',
  scope: 'Maximize',
  out_of_scope: 'XCircle',
  user_flow: 'ArrowRight',
  overview: 'Layers',
};
