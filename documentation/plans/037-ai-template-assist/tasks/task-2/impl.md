# Task 2 — Section AI Assist UI — Implementation Notes

## Changes Made

### `src/lib/wizard-blueprints.ts` (modified)
- Added `aiMode?: "template" | "real"` to `WizardSection` interface (line 22)
- Added `aiHint?: string` to `WizardSection` interface (line 23)
- Added `export type WizardStep = "blueprint" | number | "ai-polish";` (line 26) — shared type for Task 4

### `src/components/legal-hub/template-wizard.tsx` (modified)
- **Imports:** Added `Loader2`, `Sparkles` from lucide-react; added `WizardStep` import from `@/lib/wizard-blueprints`
- **Removed** local `type WizardStep = "blueprint" | number;` — now imported from shared module
- **New state:** `selectedBlueprintName`, `selectedDocumentType`, `aiLoading`, `aiError`
- **Modified `selectBlueprint`:** now accepts `blueprintName` and `documentType` params, stores them in state
- **Modified `selectPredefined`/`selectCustom`:** pass blueprint name/documentType to `selectBlueprint`
- **New helpers:** `updateAiMode`, `updateAiHint` — update per-section AI fields
- **New handler:** `handleAiGenerate(index)` — calls `POST /api/legal-hub/wizard/ai-assist` with full context, populates section content on success
- **New UI block** in section fill step (between textarea and variable chips): mode toggle, hint textarea, "Generuj z AI" button with loading state, error display
- **Added `"ai-polish"` guard:** placeholder that falls through to `onComplete` — prevents TypeScript error from the new WizardStep union. Task 4 will replace this with the full AI polish step UI.

## INTEGRATION notes for Task 4
- `WizardStep` type is now exported from `src/lib/wizard-blueprints.ts` and includes `"ai-polish"`
- The `"ai-polish"` guard in `template-wizard.tsx` (lines ~295-303) is a placeholder — Task 4 should replace it with the full AI polish step UI
- `selectedBlueprintName` and `selectedDocumentType` state are available if Task 4 needs them for the polish API call
- `handleFinish` currently goes straight to `onComplete` — Task 4 should change it to `setStep("ai-polish")` instead

## Variable stripping
The `availableVariables` sent to the API are stripped of `{{` and `}}` wrappers because the API route re-wraps them. Example: `{{case.court}}` becomes `case.court` in the API body.
