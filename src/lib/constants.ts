export const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"] as const;

export const DOC_TYPES = [
  "contract", "invoice", "letter", "report", "application", "policy", "procedure",
  "memo", "minutes", "form", "regulation", "certificate", "agreement",
  "notice", "statement", "other"
] as const;

export const JURISDICTIONS = [
  "EU", "US", "UK", "DE", "PL", "FR", "ES", "NL", "IT", "CH", "international"
] as const;

export const SENSITIVITIES = ["public", "internal", "confidential", "restricted"] as const;

export const DOCUMENT_STATUSES = ["draft", "in_review", "approved", "archived", "disposed"] as const;

export const CONTRACT_STATUSES = ["unsigned", "signed", "active", "terminated"] as const;

export const OBLIGATION_STATUSES = ["active", "inactive", "met", "waived", "finalized", "failed"] as const;

export const OBLIGATION_CATEGORIES = ["payment", "reporting", "compliance", "operational"] as const;

export const CATEGORY_MIGRATION_MAP: Record<string, string> = {
  // Legacy 4-category system -> new 4-category system
  payments: "payment",
  termination: "operational",
  legal: "compliance",
  others: "operational",
  // AI-extracted legacy categories -> new system
  renewal: "operational",
  reporting: "reporting",
  compliance: "compliance",
  confidentiality: "compliance",
  insurance: "compliance",
  indemnification: "compliance",
  delivery: "operational",
  other: "operational",
  payment: "payment",
};

export const CONTRACT_STATUS_DISPLAY: Record<string, string> = {
  unsigned: "Inactive",
  signed: "To Sign",
  active: "Active",
  terminated: "Terminated",
};

export const CATEGORY_COLORS: Record<string, string> = {
  // New 4-category system
  payment: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  reporting: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  compliance: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  operational: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  // Legacy categories (for backwards compatibility during migration)
  payments: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  termination: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  legal: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  others: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  renewal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  delivery: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  confidentiality: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  insurance: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  indemnification: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  other: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
};

export const CATEGORY_BORDER_COLORS: Record<string, string> = {
  // New 4-category system
  payment: "border-l-purple-500",
  reporting: "border-l-amber-500",
  compliance: "border-l-cyan-500",
  operational: "border-l-green-500",
  // Legacy categories (for backwards compatibility during migration)
  payments: "border-l-purple-500",
  termination: "border-l-red-500",
  legal: "border-l-cyan-500",
  others: "border-l-neutral-400",
  renewal: "border-l-indigo-500",
  delivery: "border-l-green-500",
  confidentiality: "border-l-neutral-400",
  insurance: "border-l-neutral-400",
  indemnification: "border-l-pink-500",
  other: "border-l-neutral-400",
};

export const STATUS_COLORS: Record<string, string> = {
  // Document statuses
  draft: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  disposed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  // Contract statuses
  unsigned: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  signed: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  terminated: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  // Obligation statuses
  inactive: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  met: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  waived: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  finalized: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  upcoming: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700",
};

export const PRICING = {
  claude: {
    sonnet: { input: 3.0, output: 15.0 },
    haiku: { input: 0.25, output: 1.25 },
  },
  voyage: 0.02,
} as const;

export const INVOICE_CURRENCIES = ["EUR", "USD", "GBP", "PLN", "CHF"] as const;

export const REPORTING_FREQUENCIES = ["monthly", "quarterly", "annually", "ad-hoc"] as const;

export const INVOICE_FILE_EXTENSIONS = [".pdf", ".docx", ".jpg", ".png"] as const;

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  pending: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export const CONTRACT_DOCUMENT_TYPES = [
  { value: "amendment", label: "Amendment" },
  { value: "addendum", label: "Addendum" },
  { value: "exhibit", label: "Exhibit" },
  { value: "other", label: "Other" },
] as const;

export const CONTRACT_DOCUMENT_TYPE_COLORS: Record<string, string> = {
  amendment: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  addendum: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  exhibit: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  other: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
};

export const POLICIES_TAB_DEFAULT_DOC_TYPES = ["policy", "procedure"] as const;

// ── Legal Hub constants ─────────────────────────────────────────────────────

export const LEGAL_CASE_STATUSES = [
  "new", "intake", "analysis", "draft_prepared", "filed",
  "awaiting_response", "hearing_scheduled", "judgment_received",
  "appeal", "active", "closed",
] as const;

export const LEGAL_CASE_TYPES = [
  "civil", "criminal", "administrative", "labor", "family", "commercial",
] as const;

export const LEGAL_CASE_STATUS_DISPLAY: Record<string, string> = {
  new: "New",
  intake: "Intake",
  analysis: "Analysis",
  draft_prepared: "Draft Prepared",
  filed: "Filed",
  awaiting_response: "Awaiting Response",
  hearing_scheduled: "Hearing Scheduled",
  judgment_received: "Judgment Received",
  appeal: "Appeal",
  active: "Active",
  closed: "Closed",
};

export const LEGAL_CASE_STATUS_COLORS: Record<string, string> = {
  new: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  intake: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  analysis: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  draft_prepared: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  filed: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  awaiting_response: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  hearing_scheduled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  judgment_received: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  appeal: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export const LEGAL_CASE_TYPE_LABELS: Record<string, string> = {
  civil: "Civil",
  criminal: "Criminal",
  administrative: "Administrative",
  labor: "Labor",
  family: "Family",
  commercial: "Commercial",
};

export const CASE_DOCUMENT_CATEGORIES = [
  { value: "pleadings", label: "Pisma procesowe" },
  { value: "evidence", label: "Dowody" },
  { value: "correspondence", label: "Korespondencja" },
  { value: "court_decisions", label: "Orzeczenia" },
  { value: "powers_of_attorney", label: "Pełnomocnictwa" },
  { value: "contracts_annexes", label: "Umowy i aneksy" },
  { value: "invoices_costs", label: "Faktury i koszty" },
  { value: "internal_notes", label: "Notatki wewnętrzne" },
  { value: "other", label: "Inne" },
] as const;

export const ORG_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  pending_deletion: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  expired: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export const ORG_ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
};

export const PERMISSION_LEVEL_COLORS: Record<string, string> = {
  none: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  view: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  edit: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  full: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export const CASE_DOCUMENT_CATEGORY_COLORS: Record<string, string> = {
  pleadings: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  evidence: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  correspondence: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  court_decisions: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  powers_of_attorney: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  contracts_annexes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  invoices_costs: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  internal_notes: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  other: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};
