# Task 3 Plan — Template Wizard Multi-Step UI + TemplateManagementPage Integration

## Overview

Create the `template-wizard.tsx` component (multi-step wizard for guided template creation), integrate it into `template-management-page.tsx` via a new `view` state machine, and add an `initialContent` prop to `template-form.tsx` so the wizard can hand off combined HTML.

## Files to Change

### 1. `src/components/legal-hub/template-form.tsx` (modify)

**Change:** Add optional `initialContent?: string` prop.

- Update `TemplateFormProps` interface: add `initialContent?: string`
- Destructure it in the component
- Change `templateBody` init: `useState(template?.template_body || initialContent || '')`
- Change RichTextEditor `content` prop: `template?.template_body || initialContent || "<p>Start writing your template here...</p>"`
- Priority order: existing template body > wizard initial content > placeholder

### 2. `src/components/legal-hub/template-management-page.tsx` (modify)

**Change:** Replace `showForm: boolean` with `view: PageView` state machine. Add wizard integration and dual create buttons.

State changes:
- Remove `showForm` state
- Add `type PageView = 'list' | 'form' | 'wizard' | 'blueprints'`
- Add `const [view, setView] = useState<PageView>('list')`
- Add `const [wizardInitialContent, setWizardInitialContent] = useState('')`

Handler changes:
- `handleNew` → sets `view: 'form'`, clears `editingTemplate` and `wizardInitialContent`
- `handleWizard` → sets `view: 'wizard'`
- `handleEdit` → sets `editingTemplate` + `view: 'form'` (no wizardInitialContent)
- `handleSaved` → sets `view: 'list'`, clears state, bumps refreshTrigger
- `handleCancel` → sets `view: 'list'`, clears state
- `handleWizardComplete(html: string)` → sets `wizardInitialContent = html`, `view: 'form'`

UI changes:
- Header: when `view === 'list'`, show two buttons side-by-side:
  - "Manual" button with `FileText` icon → `handleNew`
  - "Guided Wizard" button with `Wand2` icon → `handleWizard`
- View rendering:
  - `view === 'list'` → `<TemplateList ...>`
  - `view === 'form'` → back button + `<TemplateForm ... initialContent={wizardInitialContent} />`
  - `view === 'wizard'` → back button + `<TemplateWizard onComplete={handleWizardComplete} onCancel={handleCancel} />`

Import additions: `TemplateWizard`, `Wand2`, `FileText` from lucide-react

### 3. `src/components/legal-hub/template-wizard.tsx` (new)

**Props:**
```ts
interface TemplateWizardProps {
  onComplete: (html: string) => void;
  onCancel: () => void;
}
```

**Internal state:**
```ts
type WizardStep = 'blueprint' | number; // number = section index
const [step, setStep] = useState<WizardStep>('blueprint');
const [sections, setSections] = useState<WizardSection[]>([]);
const [sectionContents, setSectionContents] = useState<Record<number, string>>({});
const [customBlueprints, setCustomBlueprints] = useState<CustomBlueprint[]>([]);
const [loadingBlueprints, setLoadingBlueprints] = useState(true);
```

**Step: Blueprint Selection (`step === 'blueprint'`)**
- On mount, fetch custom blueprints: `GET /api/legal-hub/wizard/blueprints`
- Render grid of blueprint cards (Card component from ui/card):
  - 4 predefined blueprints from `PREDEFINED_BLUEPRINTS` (imported from `@/lib/wizard-blueprints`)
  - Custom blueprints from API response
  - Each card: name, section count subtitle, click handler
- On card click:
  - Map blueprint sections to `WizardSection[]` with empty content
  - If `Blank` blueprint (0 sections): call `onComplete('')` immediately (or add a single empty section — following spec: blank has 0 sections, user adds own, but since wizard doesn't support adding sections, call onComplete with empty and let them use the editor)
  - Actually, re-reading spec: Blank has 0 sections. Since combineWizardSections with empty array returns `''`, we just go straight to form with empty content. This matches "user adds their own" in the TemplateForm editor.
  - For blueprints with sections: set `sections`, initialize `sectionContents` with empty strings, set `step = 0`

**Step: Section Fill (`step` is a number)**
- Show section title as heading
- Textarea (plain HTML `<textarea>`) for content input, value from `sectionContents[step]`
- Variable chips panel below textarea:
  - Get hints from `SECTION_VARIABLE_HINTS[section.sectionKey]` or `ALL_VARIABLE_TOKENS` if sectionKey is null
  - Each chip is a small button showing the token text
  - On chip click: use `textareaRef.current.setRangeText(token, start, end, 'end')` to insert at cursor, then update content state, refocus textarea
- Use a single `useRef<HTMLTextAreaElement>(null)` — re-assigned per step (since only one textarea visible at a time)
- Navigation buttons:
  - "Previous": if step === 0, go back to `'blueprint'`; else `step - 1`
  - "Next": if step < sections.length - 1, advance to `step + 1`
  - "Finish": shown on last section (step === sections.length - 1); calls `combineWizardSections` with sections mapped to `{title, content}` from sectionContents, then `onComplete(result)`
  - "Cancel": calls `onCancel()`

**Variable chip insertion logic:**
```ts
const handleChipClick = (token: string) => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(token, start, end, 'end');
  // Update state to match
  const newValue = textarea.value;
  setSectionContents(prev => ({ ...prev, [step as number]: newValue }));
  textarea.focus();
};
```

**Content preservation:** `sectionContents` is keyed by section index and persists across navigation. Going back and forward preserves all content.

## UI Component Usage

- `Card`, `CardHeader`, `CardTitle`, `CardContent` — for blueprint selection cards
- `Button` — for navigation, chips, cancel
- `Skeleton` — for loading state while fetching custom blueprints
- `ArrowLeft`, `ArrowRight`, `Check`, `Wand2`, `FileText` from lucide-react

## Edge Cases

1. **Blank blueprint selected**: 0 sections → `combineWizardSections([])` returns `''` → opens TemplateForm with empty editor (default placeholder shows)
2. **All sections left empty**: `combineWizardSections` filters out empty sections → result is `''` → same as blank
3. **Custom blueprints API fails**: Show predefined blueprints only, log error, set `loadingBlueprints = false`
4. **Single section blueprint**: "Finish" shown immediately (no "Next"), "Previous" goes to blueprint selection

## Dependencies

- **Task 1**: `GET /api/legal-hub/wizard/blueprints` endpoint for fetching custom blueprints
- **Task 2**: `PREDEFINED_BLUEPRINTS`, `SECTION_VARIABLE_HINTS`, `ALL_VARIABLE_TOKENS`, `combineWizardSections`, `WizardSection` type from `src/lib/wizard-blueprints.ts`
