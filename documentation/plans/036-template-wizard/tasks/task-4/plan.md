# Task 4 — Blueprint Management UI

## Overview

Create `blueprint-management.tsx` with list and edit/create sub-views, and integrate into `template-management-page.tsx` as a `'blueprints'` view state.

## Files to Create/Modify

### 1. `src/components/legal-hub/blueprint-management.tsx` (NEW)

**Props:** `onBack: () => void`

**Local state:**
- `editingBlueprint: CustomBlueprint | null | 'new'` — `null` = list view, `'new'` = create form, `CustomBlueprint` = edit form
- `blueprints: CustomBlueprint[]` — fetched from API
- `loading: boolean`
- `formName: string` — name input for create/edit
- `formSections: Array<{title: string; sectionKey: string | null}>` — sections being edited
- `saving: boolean`
- `deletingId: number | null`

**CustomBlueprint type** (local, matching API response):
```ts
interface CustomBlueprint {
  id: number;
  name: string;
  sections_json: string;
  created_at: string;
}
```

**List view:**
- Fetch from `GET /api/legal-hub/wizard/blueprints` on mount + after mutations
- Table with columns: Name, Sections (count parsed from sections_json), Created
- Per-row actions: Edit button (Pencil icon), Delete button (Trash2 icon)
- "New Blueprint" button at top
- Delete uses shadcn `AlertDialog` (same pattern as `admin-org-list.tsx` lines 289-320)
- Delete calls `DELETE /api/legal-hub/wizard/blueprints/[id]`, then refreshes list

**Edit/Create view:**
- Name: `<Input>` for blueprint name
- Sections list: each row has:
  - Title `<Input>`
  - Section key `<select>` dropdown: options = predefined keys (`court_header`, `parties`, `claim`, `factual_basis`, `closing`, `deadlines`) + "Custom" (null). Labels are human-readable Polish names matching predefined blueprints.
  - Up arrow `<Button>` (disabled if first) — swaps item at index i with i-1
  - Down arrow `<Button>` (disabled if last) — swaps item at index i with i+1
  - Delete `<Button>` (Trash2) — removes from array
- "Add Section" button — appends `{title: '', sectionKey: null}` to sections array
- "Save" button:
  - POST to `/api/legal-hub/wizard/blueprints` for new (body: `{name, sections_json: JSON.stringify(sections)}`)
  - PATCH to `/api/legal-hub/wizard/blueprints/[id]` for existing (body: `{name, sections_json: JSON.stringify(sections)}`)
  - On success: return to list view, refresh list
- "Cancel" button — return to list view without saving
- A blueprint with 0 sections is valid (save enabled when name is non-empty)

### 2. `src/components/legal-hub/template-management-page.tsx` (MODIFY)

**Coordination with Task 3:** Task 3 converts `showForm: boolean` to `view: 'list' | 'form' | 'wizard'` and adds `wizardInitialContent` state. Task 4 adds `'blueprints'` to the union.

**Implementation approach:** Implement based on the **final intended state** (`view: 'list' | 'form' | 'wizard' | 'blueprints'`). If Task 3 hasn't landed yet, do the full refactor from `showForm` to `view` union ourselves, adding all four states. If Task 3 has landed, just add `'blueprints'` to the existing union.

**Changes:**
- Import `BlueprintManagement` from `./blueprint-management`
- Add `'blueprints'` to PageView union
- In page header (when `view === 'list'`): add "Manage Blueprints" link/button (secondary variant, with Settings or Layers icon)
- When `view === 'blueprints'`: render `<BlueprintManagement onBack={() => setView('list')} />`

## Section Key Dropdown Options

| Value | Label |
|-------|-------|
| `court_header` | Oznaczenie sądu |
| `parties` | Strony |
| `claim` | Roszczenie |
| `factual_basis` | Uzasadnienie |
| `closing` | Zamknięcie |
| `deadlines` | Terminy |
| `null` | Niestandardowa (Custom) |

## UI Patterns to Follow

- Table styling: same as `template-list.tsx` (border rounded-lg, bg-muted/50 header, text-sm)
- AlertDialog: same as `admin-org-list.tsx` (AlertDialogTrigger wrapping delete button, confirmation text, destructive action styling)
- Loading: `<Skeleton>` components (3 rows)
- Toast notifications via `sonner` for success/error feedback
- Icons: Pencil, Trash2, Plus, ArrowLeft, ChevronUp, ChevronDown from lucide-react

## Validation

- Name is required (trim + check non-empty) — Save button disabled when name is empty
- sections_json is always valid (built from local state array, stringified on save)
- Section titles can be empty (user may fill them later)
