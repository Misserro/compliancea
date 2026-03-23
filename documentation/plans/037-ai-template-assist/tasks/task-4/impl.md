## Task 4 Complete -- Document Polish Wizard Step

- Modified: `src/components/legal-hub/template-wizard.tsx`

### Changes

#### Removed
- `AiPolishPlaceholder` component (lines 28-44 of pre-implementation file) -- no longer needed since the full ai-polish step UI replaces it.

#### State additions (inside `TemplateWizard`)
- `polishedHtml: string | null` -- stores AI-polished HTML after successful API call
- `polishState: "idle" | "loading" | "done" | "error"` -- state machine for polish step
- `polishError: string | null` -- error message from failed API call

#### Handler changes
- `handleFinish()` -- no longer calls `onComplete(html)` directly. Instead resets polish state and transitions to `"ai-polish"` step via `setStep("ai-polish")`
- `handlePrev()` -- added `"ai-polish"` case: navigates back to `sections.length - 1` (last section)

#### New handlers
- `handlePolish()` -- async, calls `POST /api/legal-hub/wizard/ai-polish` with `{ sections, blueprintName, selectedDocumentType }`. On success sets `polishedHtml` and `polishState = "done"`. On error sets `polishError` and `polishState = "error"`.
- `handleSkipPolish()` -- computes raw HTML via `combineWizardSections()` and calls `onComplete(html)`
- `handleAcceptPolished()` -- calls `onComplete(polishedHtml)` with the AI-polished version
- `handleRevertToOriginal()` -- computes raw HTML via `combineWizardSections()` and calls `onComplete(html)` (same as skip)

#### New render block: `step === "ai-polish"`
Renders a full wizard step with:
- Header: Cancel button + "Ulepszanie dokumentu" title with Sparkles icon
- Progress bar: all section segments in `bg-primary/40` (completed), plus one extra segment in `bg-primary` (current polish step)
- Preview area: HTML preview via `dangerouslySetInnerHTML` showing either raw HTML (idle/loading/error states) or polished HTML (done state). Label changes from "Podglad dokumentu" to "Ulepszona wersja" when done.
- Action area (4 states):
  - `idle`: "Ulepsz z AI" (primary) + "Pomin" (outline)
  - `loading`: Loader2 spinner + "Ulepszanie dokumentu..." text
  - `done`: "Uzyj ulepszonej wersji" (primary with Check icon) + "Uzyj oryginalnej wersji" (outline)
  - `error`: Error message in destructive color + "Sprobuj ponownie" (primary) + "Pomin" (outline)
- Navigation footer: Back button (disabled during loading), empty right side (actions are above)

### INTEGRATION Notes
- Uses `selectedBlueprintName` and `selectedDocumentType` state from Task 2
- Uses `Loader2` and `Sparkles` icons already imported by Task 2
- Calls `POST /api/legal-hub/wizard/ai-polish` created by Task 3
- `combineWizardSections()` imported from `@/lib/wizard-blueprints` (unchanged)
- No new exports -- all changes are internal to the `TemplateWizard` component
