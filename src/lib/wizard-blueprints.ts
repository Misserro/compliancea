// Predefined blueprint definitions and combination utility for the Template Wizard.
// Pure TypeScript — no DB or API dependencies.

export interface BlueprintSection {
  title: string;
  sectionKey: string | null;
  variableHintKeys: string[];
}

export interface PredefinedBlueprint {
  id: string;
  name: string;
  documentType: string | null;
  sections: BlueprintSection[];
}

export interface WizardSection {
  title: string;
  sectionKey: string | null;
  variableHintKeys: string[];
  content: string;
  aiMode?: "template" | "real";
  aiHint?: string;
}

export type WizardStep = "blueprint" | number | "ai-polish";

// ---------------------------------------------------------------------------
// Variable hint mapping: section key → variable tokens shown in that section
// ---------------------------------------------------------------------------

export const SECTION_VARIABLE_HINTS: Record<string, string[]> = {
  court_header: [
    '{{case.court}}',
    '{{case.court_division}}',
    '{{case.reference_number}}',
    '{{case.internal_number}}',
    '{{today}}',
  ],
  parties: [
    '{{parties.plaintiff.name}}',
    '{{parties.plaintiff.address}}',
    '{{parties.plaintiff.notes}}',
    '{{parties.defendant.name}}',
    '{{parties.defendant.address}}',
    '{{parties.defendant.notes}}',
    '{{parties.representative.representative_name}}',
    '{{parties.representative.representative_address}}',
  ],
  claim: [
    '{{case.claim_value}}',
    '{{case.claim_currency}}',
    '{{case.claim_description}}',
  ],
  factual_basis: [
    '{{case.title}}',
    '{{case.summary}}',
    '{{case.case_type}}',
    '{{case.procedure_type}}',
  ],
  closing: [
    '{{parties.representative.representative_name}}',
    '{{parties.representative.representative_address}}',
    '{{today}}',
  ],
  deadlines: [
    '{{deadlines.next.title}}',
    '{{deadlines.next.due_date}}',
  ],
};

// ---------------------------------------------------------------------------
// All variable tokens — mirrors VARIABLE_REFERENCE from template-form.tsx
// ---------------------------------------------------------------------------

export const ALL_VARIABLE_TOKENS: string[] = [
  '{{today}}',
  '{{case.reference_number}}',
  '{{case.title}}',
  '{{case.court}}',
  '{{case.court_division}}',
  '{{case.judge}}',
  '{{case.status}}',
  '{{case.summary}}',
  '{{case.claim_value}}',
  '{{case.claim_currency}}',
  '{{case.claim_description}}',
  '{{parties.plaintiff.name}}',
  '{{parties.plaintiff.address}}',
  '{{parties.defendant.name}}',
  '{{parties.defendant.address}}',
  '{{parties.representative.representative_name}}',
  '{{deadlines.next.title}}',
  '{{deadlines.next.due_date}}',
  '{{parties.plaintiff.notes}}',
  '{{parties.defendant.notes}}',
  '{{parties.representative.representative_address}}',
  '{{case.procedure_type}}',
  '{{case.case_type}}',
  '{{case.internal_number}}',
];

// ---------------------------------------------------------------------------
// Predefined blueprints (4 shipped)
// ---------------------------------------------------------------------------

export const PREDEFINED_BLUEPRINTS: PredefinedBlueprint[] = [
  {
    id: 'pozew',
    name: 'Pozew',
    documentType: 'pozew',
    sections: [
      {
        title: 'Oznaczenie sądu i stron',
        sectionKey: 'court_header',
        variableHintKeys: SECTION_VARIABLE_HINTS.court_header,
      },
      {
        title: 'Strony postępowania',
        sectionKey: 'parties',
        variableHintKeys: SECTION_VARIABLE_HINTS.parties,
      },
      {
        title: 'Żądanie',
        sectionKey: 'claim',
        variableHintKeys: SECTION_VARIABLE_HINTS.claim,
      },
      {
        title: 'Uzasadnienie faktyczne',
        sectionKey: 'factual_basis',
        variableHintKeys: SECTION_VARIABLE_HINTS.factual_basis,
      },
      {
        title: 'Dowody',
        sectionKey: null,
        variableHintKeys: ALL_VARIABLE_TOKENS,
      },
      {
        title: 'Zamknięcie',
        sectionKey: 'closing',
        variableHintKeys: SECTION_VARIABLE_HINTS.closing,
      },
    ],
  },
  {
    id: 'wezwanie',
    name: 'Wezwanie do zapłaty',
    documentType: 'wezwanie',
    sections: [
      {
        title: 'Nagłówek i adresat',
        sectionKey: 'court_header',
        variableHintKeys: SECTION_VARIABLE_HINTS.court_header,
      },
      {
        title: 'Treść wezwania',
        sectionKey: 'claim',
        variableHintKeys: SECTION_VARIABLE_HINTS.claim,
      },
      {
        title: 'Podstawa prawna',
        sectionKey: 'factual_basis',
        variableHintKeys: SECTION_VARIABLE_HINTS.factual_basis,
      },
      {
        title: 'Termin i sposób płatności',
        sectionKey: 'deadlines',
        variableHintKeys: SECTION_VARIABLE_HINTS.deadlines,
      },
      {
        title: 'Zamknięcie',
        sectionKey: 'closing',
        variableHintKeys: SECTION_VARIABLE_HINTS.closing,
      },
    ],
  },
  {
    id: 'replika',
    name: 'Replika',
    documentType: 'replika',
    sections: [
      {
        title: 'Oznaczenie sądu i stron',
        sectionKey: 'court_header',
        variableHintKeys: SECTION_VARIABLE_HINTS.court_header,
      },
      {
        title: 'Nawiązanie do odpowiedzi',
        sectionKey: null,
        variableHintKeys: ALL_VARIABLE_TOKENS,
      },
      {
        title: 'Kontrargumenty',
        sectionKey: null,
        variableHintKeys: ALL_VARIABLE_TOKENS,
      },
      {
        title: 'Wnioski',
        sectionKey: null,
        variableHintKeys: ALL_VARIABLE_TOKENS,
      },
      {
        title: 'Zamknięcie',
        sectionKey: 'closing',
        variableHintKeys: SECTION_VARIABLE_HINTS.closing,
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    documentType: null,
    sections: [],
  },
];

// ---------------------------------------------------------------------------
// Combination utility
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : ''))
    .filter(Boolean)
    .join('\n');
}

export function combineWizardSections(
  sections: Array<{ title: string; content: string }>
): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => `<h2>${escapeHtml(s.title)}</h2>\n${textToHtml(s.content)}`)
    .join('\n');
}
