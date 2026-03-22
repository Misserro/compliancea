# Lead Notes — Plan 036: Template Wizard

## Plan Overview

Introduces a guided Template Wizard as an alternative template creation path in the Legal Hub. Users choose Manual or Guided Wizard at the entry point. The wizard uses blueprints (ordered section sets) to guide users through filling sections one at a time, then concatenates into HTML and hands off to the existing RichTextEditor.

## Concurrency Decision

- **Slots:** 2 concurrent task-teams
- **Initial spawn:** Tasks 1 + 2 in parallel (both have no dependencies)
- **After Tasks 1+2 done:** Tasks 3 + 4 in parallel (both depend on Task 1; Task 3 also depends on Task 2)
- **Pipeline spawning:** Tasks 3 and 4 can start planning while Tasks 1+2 are in review/test

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies (parallel with Task 1)
- Task 3: depends on Tasks 1 AND 2
- Task 4: depends on Task 1 only (can run in parallel with Task 3)

## Key Architectural Constraints

1. **No new routing** — TemplateManagementPage uses inline state swap (showForm boolean). Wizard adds a third state. Refactor to `view: 'list' | 'form' | 'wizard' | 'blueprints'` string union.
2. **Predefined blueprints are hardcoded constants** — never stored in DB. Custom blueprints stored in `wizard_blueprints` table per-org.
3. **Section input = plain textarea** (not RichTextEditor) — sections produce plain text converted to HTML via `textToHtml()`. Rich editing happens in the final TemplateForm step.
4. **Combination outputs HTML** — `combineWizardSections()` wraps section titles in `<h2>` and content lines in `<p>`. This HTML is passed to TemplateForm's RichTextEditor.
5. **TemplateForm needs `initialContent` prop** — to accept wizard output. Defaults to existing placeholder when not provided.
6. **Variable hint insertion** — use `textarea.setRangeText()` / `selectionStart`/`selectionEnd` for cursor-position insertion in section textareas.
7. **Auth pattern** — all wizard blueprint API routes use the same `legal_hub` feature check + `edit` permission pattern as existing template routes.
8. **DB pattern** — `wizard_blueprints` table created with `CREATE TABLE IF NOT EXISTS` in `initDb`. No ALTER TABLE needed (new table, not column addition).

## Critical Files

- `lib/db.js` — createWizardBlueprint, getWizardBlueprints, getWizardBlueprintById, updateWizardBlueprint, deleteWizardBlueprint
- `lib/db-imports.ts` — re-exports
- `src/lib/wizard-blueprints.ts` — NEW: PREDEFINED_BLUEPRINTS, SECTION_VARIABLE_HINTS, ALL_VARIABLE_TOKENS, combineWizardSections, interfaces
- `src/app/api/legal-hub/wizard/blueprints/route.ts` — NEW: GET list + POST create
- `src/app/api/legal-hub/wizard/blueprints/[id]/route.ts` — NEW: PATCH + DELETE
- `src/components/legal-hub/template-wizard.tsx` — NEW: multi-step wizard component
- `src/components/legal-hub/blueprint-management.tsx` — NEW: CRUD UI for custom blueprints
- `src/components/legal-hub/template-management-page.tsx` — extend with wizard + blueprints view states
- `src/components/legal-hub/template-form.tsx` — add optional `initialContent` prop

## 4 Predefined Blueprints

1. **Pozew** — 6 sections: Oznaczenie sądu i stron, Strony postępowania, Żądanie, Uzasadnienie faktyczne, Dowody, Zamknięcie
2. **Wezwanie do zapłaty** — 5 sections: Nagłówek i adresat, Treść wezwania, Podstawa prawna, Termin i sposób płatności, Zamknięcie
3. **Replika** — 5 sections: Oznaczenie sądu i stron, Nawiązanie do odpowiedzi, Kontrargumenty, Wnioski, Zamknięcie
4. **Blank** — 0 sections (user adds their own)

## Decisions Made

- (2026-03-22) Plain textarea (not RichTextEditor) for wizard section input — rich editing deferred to TemplateForm step
- (2026-03-22) `sections_json` column (not join table) for custom blueprint sections — simple JSON storage is sufficient
- (2026-03-22) Up/down arrows for section reorder in blueprint management (no drag-and-drop)
- (2026-03-22) ALL_VARIABLE_TOKENS mirrors the 22 tokens from template-form.tsx VARIABLE_REFERENCE
