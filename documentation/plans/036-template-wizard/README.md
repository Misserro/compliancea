# Plan 036 — Template Wizard

## Overview

Introduces a guided "Template Wizard" as an alternative to the existing manual template creation flow. Users choose between the two paths at the creation entry point. The wizard walks users through filling in one document section at a time, then combines the sections into HTML and opens the result in the existing RichTextEditor for final review and editing before saving.

Blueprints (ordered section sets) drive the wizard structure. The app ships with 4 predefined blueprints hardcoded as constants. Organizations can also create, name, and reuse custom blueprints stored per-org.

## Scope

### In scope
- "Create Template" entry point becomes a choice: Manual vs. Guided Wizard
- Wizard flow: blueprint selection → section-by-section fill → combination → opens in RichTextEditor
- 4 predefined system blueprints: Pozew, Wezwanie do zapłaty, Replika, Blank
- Custom blueprint CRUD: create, edit (rename + section management), delete — org-scoped
- Section fill UI: textarea + contextual `{{variable}}` chips (click-to-insert at cursor)
- Variable hint scoping: predefined section keys show relevant variables only; user-created sections show all
- Combination: `<h2>` section title + `<p>` content blocks → valid HTML for RichTextEditor
- Blueprint management UI: dedicated panel accessible from template management page

### Out of scope
- Drag-to-reorder sections in blueprint management (up/down arrows only)
- AI-assisted content generation per section
- Wizard as an edit path for existing templates (manual edit only)
- Sharing blueprints across orgs

## Architecture Notes

### Blueprint structure

```ts
// Predefined blueprints — hardcoded constants, never stored in DB
interface BlueprintSection {
  title: string;            // display name: "Oznaczenie sądu i stron"
  sectionKey: string;       // lookup key for variable hints: "court_header"
  variableHintKeys: string[]; // e.g. ['case.court', 'case.reference_number', 'today']
}

interface PredefinedBlueprint {
  id: string;               // e.g. 'pozew'
  name: string;
  documentType: string | null;
  sections: BlueprintSection[];
}

// Custom blueprints — stored in wizard_blueprints table
// sections_json: JSON.stringify(Array<{title, sectionKey: string|null, variableHintKeys: string[]}>)
```

### Predefined blueprints (4 shipped)

| Blueprint | Sections |
|-----------|---------|
| **Pozew** | Oznaczenie sądu i stron · Strony postępowania · Żądanie · Uzasadnienie faktyczne · Dowody · Zamknięcie |
| **Wezwanie do zapłaty** | Nagłówek i adresat · Treść wezwania · Podstawa prawna · Termin i sposób płatności · Zamknięcie |
| **Replika** | Oznaczenie sądu i stron · Nawiązanie do odpowiedzi · Kontrargumenty · Wnioski · Zamknięcie |
| **Blank** | (no predefined sections — user adds their own) |

### Variable hint mapping (section key → variables)

| sectionKey | Variables shown |
|------------|----------------|
| `court_header` | `{{case.court}}`, `{{case.court_division}}`, `{{case.reference_number}}`, `{{case.internal_number}}`, `{{today}}` |
| `parties` | `{{parties.plaintiff.name}}`, `{{parties.plaintiff.address}}`, `{{parties.plaintiff.notes}}`, `{{parties.defendant.name}}`, `{{parties.defendant.address}}`, `{{parties.defendant.notes}}`, `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}` |
| `claim` | `{{case.claim_value}}`, `{{case.claim_currency}}`, `{{case.claim_description}}` |
| `factual_basis` | `{{case.title}}`, `{{case.summary}}`, `{{case.case_type}}`, `{{case.procedure_type}}` |
| `closing` | `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}`, `{{today}}` |
| `deadlines` | `{{deadlines.next.title}}`, `{{deadlines.next.due_date}}` |
| `null` (user section) | All variables |

### Combination algorithm

```ts
function combineWizardSections(
  sections: Array<{title: string; content: string}>
): string {
  return sections
    .filter(s => s.content.trim())
    .map(s => `<h2>${escapeHtml(s.title)}</h2>\n${textToHtml(s.content)}`)
    .join('\n');
}

function textToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '')
    .filter(Boolean)
    .join('\n');
}
```

Sections with empty content are skipped. Result is passed as `content` prop to `RichTextEditor` in `TemplateForm`.

### `wizard_blueprints` table

```sql
CREATE TABLE IF NOT EXISTS wizard_blueprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sections_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### TemplateManagementPage state extension

```ts
// Current: showForm boolean + editingTemplate
// After:
type PageView = 'list' | 'form' | 'wizard' | 'blueprints';
const [view, setView] = useState<PageView>('list');
const [editingTemplate, setEditingTemplate] = useState<CaseTemplate | null>(null);
const [wizardInitialContent, setWizardInitialContent] = useState<string>('');
```

When wizard completes: set `wizardInitialContent` to combined HTML, set `view = 'form'`. TemplateForm receives `initialContent` prop for pre-populating the RichTextEditor.

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/legal-hub/wizard/blueprints` | edit perm | List org's custom blueprints |
| POST | `/api/legal-hub/wizard/blueprints` | edit perm | Create custom blueprint |
| PATCH | `/api/legal-hub/wizard/blueprints/[id]` | edit perm | Update name or sections |
| DELETE | `/api/legal-hub/wizard/blueprints/[id]` | full perm | Delete custom blueprint |

## Tasks

### Task 1 — Wizard blueprints DB layer + CRUD API

**Description**: Add the `wizard_blueprints` table, DB helper functions, and the 4 CRUD API routes for managing custom blueprints.

**Files**:
- `lib/db.js` — ADD `wizard_blueprints` table via `try { db.run('ALTER TABLE...') } catch` pattern for new columns plus a `CREATE TABLE IF NOT EXISTS` block in `initDb`; ADD functions: `createWizardBlueprint(orgId, name, sectionsJson)`, `getWizardBlueprints(orgId)`, `getWizardBlueprintById(id, orgId)`, `updateWizardBlueprint(id, orgId, data)`, `deleteWizardBlueprint(id, orgId)`
- `lib/db-imports.ts` — re-export the 5 new DB functions
- `src/app/api/legal-hub/wizard/blueprints/route.ts` — GET (list all for org) + POST (create); auth: `legal_hub` feature flag + edit permission
- `src/app/api/legal-hub/wizard/blueprints/[id]/route.ts` — PATCH (name + sectionsJson) + DELETE; auth same; PATCH validates `sections_json` is valid JSON array; DELETE returns 404 if not found for org

**Success criteria**:
- `POST /api/legal-hub/wizard/blueprints` with `{name: "Test", sections_json: "[{\"title\":\"Header\"}]"}` returns 201 with blueprint object
- `GET /api/legal-hub/wizard/blueprints` returns array including newly created blueprint; blueprints from other orgs are not returned
- `PATCH /api/legal-hub/wizard/blueprints/[id]` with `{name: "Renamed"}` persists the new name
- `DELETE /api/legal-hub/wizard/blueprints/[id]` returns 204; subsequent GET no longer includes it
- A request from org B cannot retrieve or modify org A's blueprints (org isolation enforced by `org_id` in all queries)

**Dependencies**: None

---

### Task 2 — Predefined blueprints config + combination utility

**Description**: Create the hardcoded predefined blueprint definitions and the `combineWizardSections` utility. This is pure TypeScript config with no DB or API involvement.

**Files**:
- `src/lib/wizard-blueprints.ts` — export:
  - `PREDEFINED_BLUEPRINTS: PredefinedBlueprint[]` — 4 blueprints (Pozew, Wezwanie, Replika, Blank) with full section definitions per Architecture Notes
  - `SECTION_VARIABLE_HINTS: Record<string, string[]>` — section key → variable token array per Architecture Notes table
  - `ALL_VARIABLE_TOKENS: string[]` — flat list of all 22 variable tokens (used for custom/null-key sections)
  - `combineWizardSections(sections: Array<{title: string; content: string}>): string` — concatenation algorithm per Architecture Notes
  - TypeScript interfaces: `BlueprintSection`, `PredefinedBlueprint`, `WizardSection` (runtime wizard state: `{title, sectionKey, content}`)

**Success criteria**:
- `PREDEFINED_BLUEPRINTS` has exactly 4 entries; `Blank` has 0 sections
- `combineWizardSections([{title: "Header", content: "Sąd\nData: {{today}}"}])` returns HTML string containing `<h2>Header</h2>` and two `<p>` elements
- `combineWizardSections` with a section where `content` is empty or whitespace-only skips that section
- `SECTION_VARIABLE_HINTS['court_header']` includes `{{case.court}}` and `{{today}}`
- `ALL_VARIABLE_TOKENS` contains all 22 tokens from `template-form.tsx` VARIABLE_REFERENCE

**Dependencies**: None (can run in parallel with Task 1)

---

### Task 3 — Template wizard multi-step UI + TemplateManagementPage integration

**Description**: The core wizard component and its integration into the template management page. The wizard guides users through blueprint selection and section fill-in, then hands off to the existing TemplateForm with pre-populated content.

**Files**:
- `src/components/legal-hub/template-wizard.tsx` (new) — wizard component with internal step state:
  - Step `'blueprint'`: Grid of blueprint cards (predefined blueprints + custom blueprints fetched from API + option to start blank); selecting one advances to section steps
  - Steps `'section-{N}'` (N = 0 to sections.length-1): Shows section title as heading, textarea for content, variable hint chips panel; "Previous" / "Next" / "Finish" navigation; "Next" on last section triggers combination and calls `onComplete(html)`
  - Variable hint chips: clicking inserts `{{token}}` at textarea cursor position using `selectionStart`/`selectionEnd` + `setRangeText`; chips rendered from `SECTION_VARIABLE_HINTS[sectionKey]` or `ALL_VARIABLE_TOKENS` for null-key sections
  - Props: `onComplete: (html: string) => void`, `onCancel: () => void`
- `src/components/legal-hub/template-management-page.tsx` — refactor page state from `showForm: boolean` to `view: 'list' | 'form' | 'wizard' | 'blueprints'`; add `wizardInitialContent: string` state; page header shows "New Template" button with dropdown or two side-by-side buttons ("Manual" / "Guided Wizard"); when wizard calls `onComplete(html)`: set `wizardInitialContent = html`, `view = 'form'`
- `src/components/legal-hub/template-form.tsx` — add optional `initialContent?: string` prop; when provided, use as initial `content` for RichTextEditor instead of the default placeholder string; default to existing behavior when not provided

**Success criteria**:
- Clicking "Guided Wizard" on the template management page opens the wizard; clicking "Manual" opens the existing form unchanged
- Blueprint selection step shows 4 predefined blueprints and any org custom blueprints; clicking one advances to the first section step
- Each section step shows the section title, a textarea, and relevant variable chips; clicking a chip inserts the token at the textarea cursor position
- "Previous" navigates back to the prior section (content preserved); "Next" advances; "Finish" on the last section combines sections and opens TemplateForm with the combined HTML pre-loaded in the editor
- Sections with empty content are silently skipped during combination (no empty headings in output)
- "Cancel" from any wizard step returns to the template list without creating a template

**Dependencies**: Task 1 (to fetch custom blueprints), Task 2 (predefined blueprints + combineWizardSections)

---

### Task 4 — Blueprint management UI

**Description**: Dedicated UI for creating and managing custom blueprints. Accessible from the template management page. Allows orgs to build reusable section sets for future wizard runs.

**Files**:
- `src/components/legal-hub/blueprint-management.tsx` (new) — component with two sub-views:
  - **List view**: Table/list of custom blueprints (name, section count, created date); "New Blueprint" button; Edit and Delete actions per row; delete uses AlertDialog confirmation
  - **Edit view**: Form with blueprint name input + sections list; each section row shows title input + up/down arrow buttons for reordering + delete button; "Add Section" button appends a new blank section row; "Save" calls POST (new) or PATCH (existing); section rows have an optional `sectionKey` selector (dropdown of predefined keys + "Custom" option — affects variable hints when wizard uses this blueprint)
- `src/components/legal-hub/template-management-page.tsx` — add "Manage Blueprints" secondary link/button in page header; `view = 'blueprints'` renders `<BlueprintManagement onBack={() => setView('list')} />`

**Success criteria**:
- "Manage Blueprints" link from template management page opens the blueprint list
- Creating a blueprint with name "Test" and 2 sections persists to DB; it then appears in the wizard's blueprint selection step
- Editing a blueprint: renaming, adding a section, removing a section, and reordering with up/down arrows all persist correctly
- Deleting a blueprint: confirmation dialog shown; confirmed deletion removes it; it no longer appears in wizard or list
- A blueprint with 0 sections can be saved (user adds sections during wizard if desired)
- "Back" returns to the template list

**Dependencies**: Task 1 (CRUD API)
