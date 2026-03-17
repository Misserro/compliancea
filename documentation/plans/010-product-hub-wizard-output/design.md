# Design: Product Hub Wizard — Output & Q&A Improvements

**Date**: 2026-02-27
**Status**: Approved
**Scope**: Three improvements to the Product Hub wizard output experience

---

## Problem Summary

The wizard's Step 4 output has three related issues:

1. **Questions surface as errors** — The AI generates `⚠️` (missing input) and `❓` (assumption/question) markers in the `open_questions` section. These are currently shown as static amber warning boxes with no way to answer them.

2. **Blank space during/after generation** — Before `template_complete` fires, Step 4 shows raw streaming text in a `<pre>` block. If the intake form is incomplete, the first generated output can be sparse, misleading the user about capability.

3. **Poor output formatting** — The AI returns markdown (`##` headers, tables, bullet lists), but this is passed raw to TipTap's `setContent()` which expects HTML. The result is unstyled, unformatted plain text — a "wall of text."

---

## Design

### Part 1 — Pre-Generation Completeness Check

**Goal**: Warn users before generation if critical intake fields are blank, rather than silently producing a degraded output.

**Implementation**:
- In `step3-template-selector.tsx`, before the "Generate" button becomes active, a client-side check runs against the current `intakeForm`.
- Required fields checked: `sectionA.problemStatement`, `sectionB.featureDescription`, `sectionC.kpis`.
- If any are empty, show a yellow banner above the Generate button listing the missing fields by name.
- Banner has two CTAs: "Continue anyway" (proceeds to generation) and "Go back to fill them" (navigates to Step 1).
- Not blocking — just informative. No API call needed.

**No schema changes.** The check is purely client-side.

---

### Part 2 — Post-Generation Q&A Panel

**Goal**: Turn AI-generated questions/gaps from static warnings into an interactive feedback loop that improves output quality.

#### Data Flow

1. After `template_complete` fires for a template, the page calls a new API route:
   `POST /api/product-hub/[id]/suggest-answers`
   Body: `{ templateId, gaps: string[], intakeSummary: string }`

2. The route sends a single Haiku call (fast, low cost):
   > "For each of these questions about a product feature, generate 2–3 short plausible answer suggestions. Base them on this feature context: [intake summary]."

   Returns: `{ question: string, suggestions: string[] }[]`

3. New component `GapQaPanel` renders below the section content area when `gaps.length > 0`.

#### `GapQaPanel` Component

- One card per gap/question:
  - Question text (⚠️/❓ prefix stripped, cleaned)
  - 2–3 clickable suggestion chips (outlined buttons); clicking populates the textarea
  - Textarea for the user's final answer (pre-populated when chip clicked, editable)
- "Apply answers & Regenerate" button at the bottom:
  - Formats answers as structured text: `Q: [question]\nA: [answer]`
  - Appends this block to `feature.free_context` (preserving existing content)
  - Saves to DB via PATCH, then triggers regeneration

**State**: `Record<templateId, { question: string; answer: string }[]>` — ephemeral in component state, not persisted until the user clicks "Apply answers."

**Loading state**: While suggestions are being fetched, show skeleton chips (3 grey rounded bars per question). If the Haiku call fails, silently degrade — show no chips, just the textarea.

---

### Part 3 — Professional Output Rendering

#### Markdown Parsing

- Add `marked` package for markdown → HTML conversion.
- In `output-section.tsx`, pipe `content` through `marked.parse()` before `editor.commands.setContent()`. This converts `##` headers, tables, code blocks, and lists to proper HTML that TipTap renders correctly.
- TipTap extensions to add: `@tiptap/extension-table`, `TableRow`, `TableCell`, `TableHeader` to support AI-generated tables (risks matrix, KPIs table, etc.).

#### Section Icons

Add a `SECTION_ICONS` constant (in `types.ts` or a new `product-hub-config.ts`) mapping `sectionId → LucideIcon`:

| Section ID | Icon |
|---|---|
| `summary`, `executive_summary` | `FileText` |
| `problem`, `problem_statement`, `business_problem` | `AlertCircle` |
| `user_personas` | `Users` |
| `user_stories` | `BookOpen` |
| `functional_requirements` | `CheckSquare` |
| `non_functional_requirements` | `Shield` |
| `risks`, `risks_dependencies` | `AlertTriangle` |
| `open_questions` | `HelpCircle` |
| `kpis`, `success_metrics` | `TrendingUp` |
| `solution`, `proposed_solution` | `Lightbulb` |
| `data_model` | `Database` |
| `api_design` | `Code` |
| `dependencies`, `team_dependencies` | `GitBranch` |
| `roi_estimation` | `DollarSign` |
| `scope` | `Maximize` |
| `out_of_scope` | `XCircle` |
| `user_flow` | `ArrowRight` |

Section card header: icon (16px, `text-muted-foreground`) + label text. Background `bg-card` instead of `bg-muted/30`.

#### Streaming Skeleton Loader

Replace the current `<pre>` raw text dump with a skeleton view:
- Render one skeleton card per section defined in `TEMPLATE_SECTIONS[templateId]`
- Each skeleton shows: section header (real icon + label) + 3 grey shimmer lines of varying width
- Uses Tailwind `animate-pulse` for shimmer
- Cards switch from skeleton → real content as each `template_complete` event fires

This gives immediate structure (no blank space), no raw JSON text visible to the user.

#### Typography

- Change `prose-sm` → `prose` (default size) for the TipTap output wrapper for better document readability.
- Keep `max-w-none` to avoid prose width constraints inside the card.

---

## Files Affected

| File | Change |
|---|---|
| `src/components/product-hub/step3-template-selector.tsx` | Add completeness check banner |
| `src/components/product-hub/output-section.tsx` | Add `marked` parsing, table extensions, section icons, `prose` upgrade |
| `src/components/product-hub/step4-output-viewer.tsx` | Add skeleton loader, wire `GapQaPanel`, pass suggestion state |
| `src/components/product-hub/gap-qa-panel.tsx` | **New** — Q&A panel component |
| `src/app/api/product-hub/[id]/suggest-answers/route.ts` | **New** — Haiku suggestion endpoint |
| `src/app/product-hub/[id]/page.tsx` | Call suggest-answers after template_complete, pass state to viewer |
| `src/lib/types.ts` | Add `SECTION_ICONS` constant |

---

## Dependencies

- `marked` — markdown parser (add to `package.json`)
- `@tiptap/extension-table` — already available in @tiptap scope, needs install

---

## Out of Scope

- Persisting Q&A answers as their own DB entity (answers go into `free_context`)
- Changing the wizard step count
- Changing the AI prompt files

---

## Success Criteria

- [ ] Generating with an incomplete intake form shows a warning before generation
- [ ] Generated output renders headers, bullet lists, and tables correctly
- [ ] Section cards show relevant icons
- [ ] Streaming shows skeleton cards instead of blank space or raw text
- [ ] Open questions in output are shown as interactive Q&A cards with AI suggestions
- [ ] Answering questions and clicking "Apply & Regenerate" incorporates answers into output
