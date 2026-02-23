export const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"] as const;

export const DOC_TYPES = [
  "contract", "invoice", "letter", "report", "application", "policy",
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

export const OBLIGATION_CATEGORIES = ["payments", "termination", "legal", "others"] as const;

export const CATEGORY_MIGRATION_MAP: Record<string, string> = {
  payment: "payments",
  termination: "termination",
  renewal: "termination",
  reporting: "legal",
  compliance: "legal",
  confidentiality: "legal",
  insurance: "legal",
  indemnification: "legal",
  delivery: "others",
  other: "others",
};

export const CONTRACT_STATUS_DISPLAY: Record<string, string> = {
  unsigned: "Inactive",
  signed: "To Sign",
  active: "Active",
  terminated: "Terminated",
};

export const CATEGORY_COLORS: Record<string, string> = {
  // New 4-category system
  payments: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  termination: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  legal: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  others: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  // Legacy categories (for backwards compatibility during migration)
  payment: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  reporting: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  renewal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  delivery: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  compliance: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  confidentiality: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  insurance: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  indemnification: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  other: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
};

export const CATEGORY_BORDER_COLORS: Record<string, string> = {
  // New 4-category system
  payments: "border-l-purple-500",
  termination: "border-l-red-500",
  legal: "border-l-cyan-500",
  others: "border-l-neutral-400",
  // Legacy categories (for backwards compatibility during migration)
  payment: "border-l-purple-500",
  reporting: "border-l-orange-500",
  renewal: "border-l-indigo-500",
  delivery: "border-l-green-500",
  compliance: "border-l-cyan-500",
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
};

export const PRICING = {
  claude: {
    sonnet: { input: 3.0, output: 15.0 },
    haiku: { input: 0.25, output: 1.25 },
  },
  voyage: 0.02,
} as const;

export const POLICIES_TAB_DEFAULT_DOC_TYPES = ["policy", "procedure"] as const;
