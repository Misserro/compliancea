# Task 2 Implementation Notes

## File created

`src/lib/wizard-blueprints.ts`

## Exports

### Interfaces
- `BlueprintSection` — `{ title, sectionKey, variableHintKeys }`
- `PredefinedBlueprint` — `{ id, name, documentType, sections }`
- `WizardSection` — `{ title, sectionKey: string|null, variableHintKeys, content }`

### Constants
- `SECTION_VARIABLE_HINTS` — 6 keys: court_header, parties, claim, factual_basis, closing, deadlines
- `ALL_VARIABLE_TOKENS` — 24 tokens matching template-form.tsx VARIABLE_REFERENCE exactly
- `PREDEFINED_BLUEPRINTS` — 4 entries: Pozew (6 sections), Wezwanie do zapłaty (5), Replika (5), Blank (0)

### Functions
- `combineWizardSections(sections)` — filters empty content, escapes HTML, wraps in h2/p tags

## Design decisions
- Blueprint sections reference `variableHintKeys` directly (not via lookup) — cleaner for sections like "Dowody" that have no matching hint key
- `escapeHtml` and `textToHtml` are internal (not exported) — only `combineWizardSections` is the public API
- ALL_VARIABLE_TOKENS has 24 entries (actual file count), not 22 as originally spec'd
- Token order matches VARIABLE_REFERENCE declaration order in template-form.tsx

## Verification
- TypeScript compiles cleanly (`npx tsc --noEmit` — no errors)
