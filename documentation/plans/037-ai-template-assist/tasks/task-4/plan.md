# Task 4 -- Document Polish Wizard Step -- Implementation Plan

## Prerequisites (from Task 2)

Task 2 modifies the same file (`template-wizard.tsx`) and `wizard-blueprints.ts`. Before implementing, I must verify these Task 2 changes are present:

1. `WizardStep` type exported from `wizard-blueprints.ts` includes `"ai-polish"`: `type WizardStep = "blueprint" | number | "ai-polish"`
2. `WizardSection` interface in `wizard-blueprints.ts` has optional `aiMode` and `aiHint` fields
3. `template-wizard.tsx` imports `WizardStep` from `@/lib/wizard-blueprints` (no longer local)
4. `template-wizard.tsx` has `selectedBlueprintName` and `selectedDocumentType` state variables (needed for the API call body)

## File to Modify

### `src/components/legal-hub/template-wizard.tsx`

#### 1. New State Variables

Add three new state variables for the ai-polish step:

```ts
const [polishedHtml, setPolishedHtml] = useState<string | null>(null);
const [polishState, setPolishState] = useState<"idle" | "loading" | "done" | "error">("idle");
const [polishError, setPolishError] = useState<string | null>(null);
```

`rawHtml` does NOT need its own state variable -- it is computed via `combineWizardSections(sections)` and can be derived on the fly or computed once when entering the step. I will use a `useMemo` or compute inline since sections do not change once we reach the ai-polish step.

#### 2. Modify `handleFinish`

Currently `handleFinish` calls `combineWizardSections()` and immediately calls `onComplete(html)`. Change it to transition to the `"ai-polish"` step instead:

```ts
const handleFinish = () => {
  // Reset polish state when entering the step
  setPolishedHtml(null);
  setPolishState("idle");
  setPolishError(null);
  setStep("ai-polish");
};
```

#### 3. New Handler: `handlePolish`

Triggers the AI polish API call:

```ts
const handlePolish = async () => {
  setPolishState("loading");
  setPolishError(null);
  try {
    const res = await fetch("/api/legal-hub/wizard/ai-polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: sections.map(s => ({ title: s.title, content: s.content })),
        blueprintName: selectedBlueprintName,
        documentType: selectedDocumentType ?? null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Blad podczas ulepszania dokumentu");
    }
    const data = await res.json();
    setPolishedHtml(data.polishedHtml);
    setPolishState("done");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Nieznany blad";
    setPolishError(msg);
    setPolishState("error");
  }
};
```

#### 4. New Handler: `handleSkipPolish`

Skips polish and passes raw HTML to onComplete:

```ts
const handleSkipPolish = () => {
  const html = combineWizardSections(
    sections.map(s => ({ title: s.title, content: s.content }))
  );
  onComplete(html);
};
```

#### 5. New Handler: `handleAcceptPolished`

Accepts the polished version:

```ts
const handleAcceptPolished = () => {
  if (polishedHtml) onComplete(polishedHtml);
};
```

#### 6. New Handler: `handleRevertToOriginal`

Reverts to raw HTML:

```ts
const handleRevertToOriginal = () => {
  const html = combineWizardSections(
    sections.map(s => ({ title: s.title, content: s.content }))
  );
  onComplete(html);
};
```

#### 7. Modify `handlePrev`

Add handling for navigating back from `"ai-polish"` to the last section:

```ts
const handlePrev = () => {
  if (step === "ai-polish") {
    setStep(sections.length - 1);
    return;
  }
  // ... existing logic
};
```

#### 8. Add `"ai-polish"` Step Render Block

Insert BEFORE the section fill step render block (after the `"blueprint"` step block). This is a new `if (step === "ai-polish")` conditional return:

**Layout:**
- Header with Cancel button + "Ulepszanie dokumentu" title
- Preview of assembled HTML (rawHtml rendered via `dangerouslySetInnerHTML` in a bordered container, or a simple text display)
- Three action buttons based on `polishState`:
  - `"idle"`: Show "Ulepsz z AI" button (primary) and "Pomin" button (outline)
  - `"loading"`: Show spinner with "Ulepszanie..." text, disable buttons
  - `"done"`: Show polished preview, "Uzyj ulepszonej wersji" (primary) and "Uzyj oryginalnej wersji" (outline)
  - `"error"`: Show error message, "Sprobuj ponownie" button, "Pomin" button
- Back button to return to last section

**UI structure follows existing wizard step patterns:**
- Same header/cancel button pattern as section steps
- Same navigation footer pattern (left: back, right: action buttons)
- Loader2 spinner for loading state (matching existing pattern)

#### 9. Import Additions

Add `Loader2` and `Wand2` to the lucide-react import (if not already added by Task 2). Task 2's plan mentions adding `Loader2` and `Sparkles` -- I will use `Sparkles` for consistency if it's already imported, otherwise add `Wand2`.

Actually, looking at Task 2's plan, they import `Loader2` and `Sparkles`. I will reuse `Sparkles` for the polish button to keep AI features visually consistent. If `Loader2` is already imported by Task 2, I just need to use it.

## Success Criteria Mapping

1. **After completing all sections, wizard shows ai-polish step with assembled preview** -- `handleFinish` transitions to `"ai-polish"` step, which renders the preview via `combineWizardSections()`
2. **Clicking "Ulepsz z AI" triggers API call and shows spinner** -- `handlePolish` makes the fetch call, `polishState === "loading"` shows `Loader2` spinner
3. **After response, two options appear (accept/revert)** -- `polishState === "done"` renders both buttons
4. **Choosing either proceeds to rich text editor with correct HTML** -- `handleAcceptPolished` passes `polishedHtml`, `handleRevertToOriginal` passes raw HTML
5. **Clicking "Pomin" skips to editor with raw HTML** -- `handleSkipPolish` computes raw HTML and calls `onComplete`
6. **WizardStep type includes "ai-polish"** -- verified from Task 2

## Risks

- **Task 2 not yet merged**: I must wait for Task 2's changes to be in the file before implementing. The plan accounts for this with the pipeline gate.
- **`selectedBlueprintName` / `selectedDocumentType` availability**: Task 2 adds these. If they are not present, the API call body would be incomplete. I will verify these exist before implementing.
- **HTML preview safety**: The raw HTML is generated by `combineWizardSections()` which uses `escapeHtml()`, so it is safe for `dangerouslySetInnerHTML`. The polished HTML comes from the AI API and is also meant for the RichTextEditor, so displaying it in a preview container is consistent.
