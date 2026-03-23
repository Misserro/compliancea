# Plan 037 — AI Template Assist

## Overview

Extends the Template Wizard (Plan 036) with two AI-powered capabilities:

1. **Section AI Assist** — while filling each section, the user can trigger Claude to generate content. The user picks a mode (generate with `{{variable}}` placeholders preserved, or generate real prose) and can optionally provide a short hint before triggering generation. Context passed to Claude includes the blueprint type, section title, all previously filled sections, and the hint.

2. **Document Polish** — after all sections are filled, a new wizard step lets the user trigger a full AI rewrite of the assembled document into a single cohesive, law-firm-grade Polish legal document. The user can accept the polished result or revert to the mechanically combined original before proceeding to the rich text editor.

Plans 032 and 036 both explicitly deferred AI-assisted template authoring as a "separate future plan." This is that plan.

## Scope

### In scope
- New API route: `POST /api/legal-hub/wizard/ai-assist` — generates content for a single section
- New API route: `POST /api/legal-hub/wizard/ai-polish` — rewrites all sections into one cohesive document
- New system prompts: `prompts/wizard-section-assist.md` and `prompts/wizard-document-polish.md`
- Per-section UI additions in `template-wizard.tsx`: mode toggle, hint textarea, "Generuj z AI" button, loading state
- New `"ai-polish"` wizard step between section filling and `onComplete`: assembled preview, polish button, accept/revert
- Variable preservation contract: all `{{...}}` tokens are treated as sacred and reproduced verbatim by both AI endpoints
- Non-streaming responses (consistent with all existing AI routes)

### Out of scope
- Streaming AI responses (future iteration)
- AI suggestions for blueprint structure (section titles / ordering)
- Per-organization AI style customization
- Saving AI mode/hint settings per blueprint section
- AI assist in the rich text editor toolbar (separate feature if desired)

## Architecture Notes

### Existing patterns followed

- **No shared AI client factory** — each new route instantiates `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` inline, matching all existing AI routes.
- **File-based system prompts** — loaded via `fs.readFile(path.join(process.cwd(), "prompts/xxx.md"))`, same as `prompts/ask.md` and `prompts/case-chat-grounded.md`.
- **Model selection** — `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"` (matches the majority of existing routes).
- **Non-streaming** — `anthropic.messages.create` with `await`, full JSON response. Consistent with all current AI API routes.

### Section AI Assist API

```
POST /api/legal-hub/wizard/ai-assist
Auth: NextAuth session + org membership check

Body:
{
  blueprintName: string,            // e.g. "Pozew"
  documentType: string | null,      // e.g. "pozew"
  sectionTitle: string,             // e.g. "Uzasadnienie faktyczne"
  sectionKey: string | null,        // hint-scoping key
  mode: "template" | "real",        // "template" → preserve {{variables}}, "real" → prose
  previousSections: {               // all already-filled sections (for consistency)
    title: string;
    content: string;
  }[],
  userHint: string | null,          // optional free-text instruction from user
  availableVariables: string[]      // tokens valid for this section (from variableHintKeys)
}

Response:
{ content: string }   // plain text (not HTML); goes into section textarea
```

System prompt (`prompts/wizard-section-assist.md`) instructs Claude to:
- Write in formal Polish legal language (Kancelaria prawna register)
- In `template` mode: use `{{variable}}` tokens from `availableVariables` where appropriate
- In `real` mode: write actual prose, no placeholders
- Treat any `{{...}}` tokens in previousSections as sacred — never substitute them
- Output plain text (not HTML); each logical paragraph as a separate line
- `max_tokens: 1024` (section content, not full documents)

### Document Polish API

```
POST /api/legal-hub/wizard/ai-polish
Auth: NextAuth session + org membership check

Body:
{
  sections: {
    title: string;
    content: string;
  }[],
  blueprintName: string,
  documentType: string | null
}

Response:
{ polishedHtml: string }   // complete HTML ready for RichTextEditor
```

System prompt (`prompts/wizard-document-polish.md`) instructs Claude to:
- Role: Senior Polish advocate rewriting a client's draft
- Rewrite all sections into one cohesive, properly flowing legal document
- Preserve document structure (sections remain identifiable via `<h2>` headings)
- **Hard constraint**: any `{{...}}` token must appear verbatim in the output — never substitute, expand, or remove
- Output valid HTML: `<h2>` headings, `<p>` paragraphs, no `<script>` or event attributes
- Formal Polish legal language throughout
- `max_tokens: 4096`

The route assembles sections via the existing `combineWizardSections()` utility from `src/lib/wizard-blueprints.ts` to produce the initial HTML draft, then sends it to Claude for the full rewrite.

### Wizard flow change

```
"blueprint"
  → section step 0
  → section step 1
  → ...
  → section step N-1
  → "ai-polish"          ← NEW step
  → onComplete(html)     → rich text editor
```

The `"ai-polish"` step stores both `rawHtml` (mechanical combination) and `polishedHtml` (AI rewrite). Accept → `onComplete(polishedHtml)`. Revert → `onComplete(rawHtml)`. If user skips polish (presses "Pomiń"), raw HTML is used.

### WizardSection type additions

`WizardSection` (defined in `src/lib/wizard-blueprints.ts`) gains two optional fields used only during wizard runtime (not persisted):

```ts
export interface WizardSection {
  title: string;
  sectionKey: string | null;
  variableHintKeys: string[];
  content: string;
  aiMode?: "template" | "real";    // NEW — defaults to "template"
  aiHint?: string;                 // NEW — optional user hint for generation
}
```

### Variable preservation contract

Both API routes receive `{{variable}}` tokens in their input. The system prompts encode a hard rule: reproduce `{{...}}` tokens exactly as received — never expand, translate, or omit them. This is the primary guard against the AI collapsing reusable template tokens into literal values.

## Tasks

<!-- TASK_LIST_START -->
- [ ] **Task 1 — Section AI Assist API**
  Create `POST /api/legal-hub/wizard/ai-assist/route.ts` with NextAuth auth, org membership validation, input validation, and Claude invocation. Write `prompts/wizard-section-assist.md` with the Polish legal assistant persona, mode-aware instructions (`template` vs `real`), variable preservation rule, and previous-sections context injection. Return `{ content: string }`.

  **Files:**
  - `src/app/api/legal-hub/wizard/ai-assist/route.ts` (new)
  - `prompts/wizard-section-assist.md` (new)

  **Depends on:** none

  **Success criteria:** `POST /api/legal-hub/wizard/ai-assist` with a valid session returns a non-empty `content` string in Polish. In `template` mode, the response includes at least one `{{variable}}` token from `availableVariables`. In `real` mode, no `{{...}}` tokens appear. Unauthenticated requests return 401.

- [ ] **Task 2 — Section AI Assist UI**
  Update `src/components/legal-hub/template-wizard.tsx` section filling step to add: a mode toggle ("Szablon z zmiennymi" / "Treść rzeczywista"), a hint textarea ("Wskazówka dla AI — opcjonalnie"), and a "Generuj z AI" button with loading state. On success, populate the section textarea with the returned content (user can still edit). Extend `WizardSection` type in `src/lib/wizard-blueprints.ts` with `aiMode` and `aiHint` optional fields.

  **Files:**
  - `src/components/legal-hub/template-wizard.tsx` (modify)
  - `src/lib/wizard-blueprints.ts` (modify — add optional fields to `WizardSection`)

  **Depends on:** Task 1

  **Success criteria:** User can click "Generuj z AI" on any section step; a loading indicator appears; the textarea is populated with generated text. Switching the mode toggle and retrying produces different results (variables present / absent). The hint textarea is optional — omitting it still produces a valid response.

- [ ] **Task 3 — Document Polish API**
  Create `POST /api/legal-hub/wizard/ai-polish/route.ts` with NextAuth auth, org membership validation, and Claude invocation. The route uses `combineWizardSections()` from `src/lib/wizard-blueprints.ts` to assemble a draft HTML string, then sends it to Claude for full rewrite. Write `prompts/wizard-document-polish.md` with the senior Polish advocate persona, full-rewrite instruction, `{{...}}` preservation hard constraint, and HTML output format. Return `{ polishedHtml: string }`.

  **Files:**
  - `src/app/api/legal-hub/wizard/ai-polish/route.ts` (new)
  - `prompts/wizard-document-polish.md` (new)

  **Depends on:** none

  **Success criteria:** `POST /api/legal-hub/wizard/ai-polish` with a valid session and 3+ filled sections returns `polishedHtml` as valid HTML. Any `{{...}}` tokens in the input sections are preserved verbatim in the response. Unauthenticated requests return 401.

- [ ] **Task 4 — Document Polish Wizard Step**
  Add the `"ai-polish"` step to `template-wizard.tsx`. The step runs `combineWizardSections()` client-side to display the assembled draft, then lets the user optionally trigger AI polish via the new API. Show a loading state during the API call. Present two calls-to-action: "Użyj ulepszonej wersji" (accept polished HTML) and "Użyj oryginalnej wersji" (revert to mechanical combination). A "Pomiń" (skip) button skips polish and uses the raw HTML. Both accept and skip call `onComplete(html)`.

  **Files:**
  - `src/components/legal-hub/template-wizard.tsx` (modify)

  **Depends on:** Task 3

  **Success criteria:** After completing all sections, the wizard shows the ai-polish step with the assembled preview. Clicking "Ulepsz z AI" triggers the API call and shows a spinner. After the response, two options appear (accept / revert). Choosing either and proceeding opens the rich text editor with the correct HTML. Clicking "Pomiń" skips to the editor with raw HTML.
<!-- TASK_LIST_END -->

## Documentation Gaps

| Gap | Priority | Location |
|-----|----------|----------|
| `documentation/technology/architecture/overview.md` does not mention AI-assisted template authoring as a capability — update after plan ships | Low | `documentation/technology/architecture/overview.md` |
| `documentation/product/requirements/features.md` plan 036 section lists AI content generation as out of scope — update to reference Plan 037 | Low | `documentation/product/requirements/features.md` |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI drops `{{variable}}` tokens during full rewrite | Medium | High | System prompt hard constraint; validate response contains all input tokens before returning |
| Mixed-mode sections (some template, some real) confuse the polish AI | Low | Medium | Polish system prompt treats all `{{...}}` tokens as sacred regardless of original mode |
| Section context window growth (late sections receive many previousSections) | Low | Low | `max_tokens: 1024` per section keeps responses bounded; previousSections are text-only (no metadata) |
| Polish rewrite truncated for long documents | Low | Medium | `max_tokens: 4096` is generous; if truncated, raw combination is always available as fallback via revert |
