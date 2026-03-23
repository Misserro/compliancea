# Task 2 — Section AI Assist UI — Implementation Plan

## Files to Modify

### 1. `src/lib/wizard-blueprints.ts`

**Changes:**
- Add `aiMode?: "template" | "real"` and `aiHint?: string` optional fields to `WizardSection` interface
- Add `"ai-polish"` to a new `WizardStep` type export (currently `WizardStep` is defined locally in `template-wizard.tsx` as `type WizardStep = "blueprint" | number;` — I will add it to `wizard-blueprints.ts` so Task 4 can use it, and update the import in `template-wizard.tsx`)

### 2. `src/components/legal-hub/template-wizard.tsx`

**Changes:**

#### State additions
- `selectedBlueprintName: string` — track the blueprint name for the API call (currently not stored after selection)
- `selectedDocumentType: string | null` — track the document type
- `aiLoading: boolean` — loading state for the AI assist request
- `aiError: string | null` — error message if AI request fails

#### `WizardStep` type update
- Change from `type WizardStep = "blueprint" | number;` to import from `wizard-blueprints.ts` and use the shared type that includes `"ai-polish"`

#### `selectBlueprint` / `selectPredefined` / `selectCustom` changes
- Store the blueprint name and documentType when a blueprint is selected

#### `updateAiMode` helper
- Updates the `aiMode` field on a section: `setSections(prev => prev.map((s, i) => i === index ? { ...s, aiMode: mode } : s))`

#### `updateAiHint` helper
- Updates the `aiHint` field on a section similarly

#### AI generation handler (`handleAiGenerate`)
- Sets `aiLoading = true`, `aiError = null`
- Builds the POST body from current wizard state:
  - `blueprintName`: from `selectedBlueprintName`
  - `documentType`: from `selectedDocumentType`
  - `sectionTitle`: current section's title
  - `sectionKey`: current section's sectionKey
  - `mode`: current section's `aiMode ?? "template"`
  - `previousSections`: all sections before current index, mapped to `{ title, content }`
  - `userHint`: current section's `aiHint` or null if empty
  - `availableVariables`: current section's `variableHintKeys` stripped of `{{` and `}}` wrappers (since the API route re-wraps them)
- Calls `POST /api/legal-hub/wizard/ai-assist`
- On success: updates the section content with `response.content`
- On failure: sets `aiError` with message
- Sets `aiLoading = false` in finally block

#### Section fill step UI additions (inserted between the textarea and the help text)

1. **Mode toggle** — two adjacent buttons styled as a segmented control:
   - "Szablon z zmiennymi" (active when `aiMode` is `"template"` or undefined)
   - "Tresc rzeczywista" (active when `aiMode` is `"real"`)
   - Clicking sets `aiMode` on the current section

2. **Hint textarea** — small textarea:
   - Label: "Wskazowka dla AI -- opcjonalnie"
   - Bound to `section.aiHint`
   - 2-3 rows, placeholder text

3. **"Generuj z AI" button** — positioned below the hint textarea:
   - Uses `Sparkles` icon from lucide-react (consistent with AI features)
   - Disabled while `aiLoading`
   - Shows `Loader2` with `animate-spin` while loading (matching existing pattern from `action-proposal-card.tsx`)
   - On click: calls `handleAiGenerate`

4. **Error display** — if `aiError` is set, show a small red text below the button

#### Lucide imports
- Add `Loader2`, `Sparkles` to the existing lucide-react import

## Variable Handling Note

The API route (`ai-assist/route.ts` line 100) wraps `availableVariables` entries in `{{...}}` before sending to Claude. But `WizardSection.variableHintKeys` already contains fully-braced tokens like `{{case.court}}`. To avoid double-wrapping, I will strip the `{{` and `}}` from the tokens before sending them to the API. This produces the correct output without modifying the Task 1 API.

## WizardStep Type Placement

The task spec says: "The wizard flow type (WizardStep) includes 'ai-polish' as a valid step value (needed by task 4 -- add it now so task 4 doesn't conflict)."

I will:
1. Export `type WizardStep = "blueprint" | number | "ai-polish";` from `src/lib/wizard-blueprints.ts`
2. Remove the local `type WizardStep = "blueprint" | number;` from `template-wizard.tsx`
3. Import `WizardStep` in `template-wizard.tsx` from `@/lib/wizard-blueprints`

This allows Task 4 to use the shared type without conflicts.

## Success Criteria Mapping

1. **"Generuj z AI" button with loading indicator** -- covered by the button + Loader2 spinner
2. **Mode toggle produces different results** -- covered by the mode toggle that changes `aiMode`, which is sent in the API body
3. **Hint textarea is optional** -- the handler sends `null` when `aiHint` is empty
4. **WizardSection has aiMode/aiHint fields** -- added to the interface in wizard-blueprints.ts
5. **WizardStep includes "ai-polish"** -- exported from wizard-blueprints.ts

## Risks

- The `availableVariables` double-wrapping issue: mitigated by stripping braces client-side
- Task 4 will also modify `template-wizard.tsx` -- my changes are scoped to the section fill step render block and new state/handlers, Task 4 will add the `"ai-polish"` step render block and modify `handleFinish`. No overlap expected.
