# Task 3 Implementation — Template Wizard Multi-Step UI + TemplateManagementPage Integration

## Files Changed

### 1. `src/components/legal-hub/template-form.tsx` (modified)
- Added `initialContent?: string` to `TemplateFormProps` interface
- Destructured `initialContent` in component signature
- Updated `templateBody` state init: `template?.template_body || initialContent || ""`
- Updated `RichTextEditor` content prop: `template?.template_body || initialContent || "<p>Start writing..."`
- Priority: existing template > wizard content > default placeholder

### 2. `src/components/legal-hub/template-management-page.tsx` (rewritten)
- Replaced `showForm: boolean` with `view: PageView` state machine (`'list' | 'form' | 'wizard' | 'blueprints'`)
- Added `wizardInitialContent` state for wizard-to-form handoff
- Header shows 3 buttons when `view === 'list'`: "Manage Blueprints", "Guided Wizard", "Manual"
- `handleWizardComplete(html)` sets `wizardInitialContent` then `view = 'form'` (content set before view change per reviewer feedback)
- Passes `initialContent={wizardInitialContent || undefined}` to TemplateForm (undefined when empty so placeholder shows)
- `view === 'blueprints'` renders inline stub placeholder (replaced by Task 4's BlueprintManagement)
- All existing behavior preserved: edit, save, cancel, delete, refresh

### 3. `src/components/legal-hub/template-wizard.tsx` (new)
- **Blueprint selection step** (`step === 'blueprint'`):
  - Renders 4 predefined blueprint cards from `PREDEFINED_BLUEPRINTS`
  - Fetches custom blueprints from `GET /api/legal-hub/wizard/blueprints` on mount
  - Shows loading skeleton while fetching; silently handles fetch errors
  - Clicking a blueprint initializes `WizardSection[]` with empty content and advances to section 0
  - Blank blueprint (0 sections) calls `onComplete('')` immediately — user goes straight to editor
- **Section fill steps** (`step` is a number):
  - Shows section title, progress bar, textarea, and variable chips panel
  - Variable chips use `SECTION_VARIABLE_HINTS[sectionKey]` for scoped sections, `ALL_VARIABLE_TOKENS` for null-key sections
  - Chip click inserts `{{token}}` at cursor via `textarea.setRangeText()` + React state sync
  - Content preserved across navigation via `sections` state array
  - Navigation: Previous / Next / Finish / Cancel
  - Finish calls `combineWizardSections()` then `onComplete(html)`
- Uses `key={idx}` on textarea to ensure ref freshness per step (reviewer-3 feedback)

## Design Decisions

1. **Blank blueprint → immediate onComplete('')**: Rather than adding a default section, Blank goes straight to TemplateForm where users have the full RichTextEditor. This matches the spec ("user adds their own" in the editor context).
2. **Inline blueprints stub**: `view === 'blueprints'` renders a placeholder div rather than importing a non-existent `BlueprintManagement` component. Task 4 will replace this.
3. **Single textarea ref with key prop**: Using `key={idx}` on the textarea causes React to remount it per step, ensuring the ref is always fresh. This is cleaner than a Map of refs.
4. **`wizardInitialContent || undefined`**: Passes `undefined` (not empty string) to TemplateForm so the default placeholder appears for manual creation.

## Type Check
- `npx tsc --noEmit` shows 0 errors in Task 3 files
- 5 pre-existing errors in `db-imports.ts` from Task 1 DB functions not yet on this branch
