# Task 2 Plan — Predefined Blueprints Config + Combination Utility

## File to create

`src/lib/wizard-blueprints.ts`

## Exports

### TypeScript Interfaces

1. **`BlueprintSection`** — `{ title: string; sectionKey: string; variableHintKeys: string[] }`
2. **`PredefinedBlueprint`** — `{ id: string; name: string; documentType: string | null; sections: BlueprintSection[] }`
3. **`WizardSection`** — `{ title: string; sectionKey: string | null; variableHintKeys: string[]; content: string }` (runtime wizard state)

### Constants

1. **`PREDEFINED_BLUEPRINTS: PredefinedBlueprint[]`** — 4 entries:
   - **Pozew** (id: `'pozew'`, documentType: `'pozew'`) — 6 sections: Oznaczenie sądu i stron (`court_header`), Strony postępowania (`parties`), Żądanie (`claim`), Uzasadnienie faktyczne (`factual_basis`), Dowody (no predefined key — use a custom key `'evidence'` with empty hints or relevant subset), Zamknięcie (`closing`)
   - **Wezwanie do zapłaty** (id: `'wezwanie'`, documentType: `'wezwanie'`) — 5 sections: Nagłówek i adresat (`court_header`), Treść wezwania (`claim`), Podstawa prawna (`factual_basis`), Termin i sposób płatności (`deadlines`), Zamknięcie (`closing`)
   - **Replika** (id: `'replika'`, documentType: `'replika'`) — 5 sections: Oznaczenie sądu i stron (`court_header`), Nawiązanie do odpowiedzi (`factual_basis`), Kontrargumenty (`factual_basis`), Wnioski (`claim`), Zamknięcie (`closing`)
   - **Blank** (id: `'blank'`, documentType: `null`) — 0 sections

2. **`SECTION_VARIABLE_HINTS: Record<string, string[]>`** — per Architecture Notes table:
   - `court_header`: `{{case.court}}`, `{{case.court_division}}`, `{{case.reference_number}}`, `{{case.internal_number}}`, `{{today}}`
   - `parties`: `{{parties.plaintiff.name}}`, `{{parties.plaintiff.address}}`, `{{parties.plaintiff.notes}}`, `{{parties.defendant.name}}`, `{{parties.defendant.address}}`, `{{parties.defendant.notes}}`, `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}`
   - `claim`: `{{case.claim_value}}`, `{{case.claim_currency}}`, `{{case.claim_description}}`
   - `factual_basis`: `{{case.title}}`, `{{case.summary}}`, `{{case.case_type}}`, `{{case.procedure_type}}`
   - `closing`: `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}`, `{{today}}`
   - `deadlines`: `{{deadlines.next.title}}`, `{{deadlines.next.due_date}}`

3. **`ALL_VARIABLE_TOKENS: string[]`** — all unique tokens from `template-form.tsx` VARIABLE_REFERENCE (24 tokens found in the actual file, not 22 as stated in spec — using file as source of truth):
   - `{{today}}`, `{{case.reference_number}}`, `{{case.title}}`, `{{case.court}}`, `{{case.court_division}}`, `{{case.judge}}`, `{{case.status}}`, `{{case.summary}}`, `{{case.claim_value}}`, `{{case.claim_currency}}`, `{{case.claim_description}}`, `{{parties.plaintiff.name}}`, `{{parties.plaintiff.address}}`, `{{parties.defendant.name}}`, `{{parties.defendant.address}}`, `{{parties.representative.representative_name}}`, `{{deadlines.next.title}}`, `{{deadlines.next.due_date}}`, `{{parties.plaintiff.notes}}`, `{{parties.defendant.notes}}`, `{{parties.representative.representative_address}}`, `{{case.procedure_type}}`, `{{case.case_type}}`, `{{case.internal_number}}`

### Functions

1. **`escapeHtml(text: string): string`** — escapes `&`, `<`, `>`, `"` to HTML entities
2. **`combineWizardSections(sections: Array<{title: string; content: string}>): string`** — per Architecture Notes algorithm:
   - Filter out sections with empty/whitespace-only content
   - For each remaining section: `<h2>${escapeHtml(title)}</h2>\n${textToHtml(content)}`
   - Join with `\n`
   - Internal `textToHtml`: split on `\n`, trim each line, wrap non-empty lines in `<p>${escapeHtml(line)}</p>`, filter empty, join with `\n`

## Section key mapping for blueprint sections

For sections not directly listed in the hint table (e.g., "Dowody"), I'll assign `sectionKey` values that map to the closest relevant hint set. For "Dowody" specifically, there's no direct match — I'll use a custom key with empty variableHintKeys (wizard will show all variables for unmatched keys).

**Decision:** Blueprint sections reference `sectionKey` values that exist in `SECTION_VARIABLE_HINTS`. For sections like "Dowody" that don't map cleanly, set `variableHintKeys` directly on the BlueprintSection. The `variableHintKeys` on `BlueprintSection` is the authoritative list for that section — `SECTION_VARIABLE_HINTS` is used for custom blueprint sections that reference a predefined key.

## Implementation approach

1. Define interfaces at the top
2. Define `escapeHtml` helper (not exported — internal)
3. Define `SECTION_VARIABLE_HINTS`
4. Define `ALL_VARIABLE_TOKENS`
5. Define `PREDEFINED_BLUEPRINTS` with full section data
6. Define and export `combineWizardSections`
