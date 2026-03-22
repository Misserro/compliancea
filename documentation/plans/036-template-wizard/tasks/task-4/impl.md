# Task 4 — Blueprint Management UI — Implementation Notes

## Files Created

### `src/components/legal-hub/blueprint-management.tsx` (NEW)
- Full CRUD UI for custom blueprints with two sub-views controlled by `editingBlueprint` state
- **List view**: fetches from `GET /api/legal-hub/wizard/blueprints`, table with name/sections/created columns, Edit + Delete per row
- **Edit/Create view**: name input + sections list with title input, section key dropdown, up/down reorder, delete per row, add section button
- Delete uses shadcn `AlertDialog` with confirmation (pattern from `admin-org-list.tsx`)
- Toast notifications via `sonner` for success/error feedback
- Section key dropdown options: `court_header`, `parties`, `claim`, `factual_basis`, `closing`, `deadlines`, and `null` (Custom)
- Empty sections list is valid (blueprint with 0 sections can be saved)
- Save disabled when name is empty

## Files Modified

### `src/components/legal-hub/template-management-page.tsx`
- Added `BlueprintManagement` import
- Replaced Task 3's placeholder (`"Blueprint management coming soon."`) with actual `<BlueprintManagement onBack={() => setView("list")} />`
- Task 3 had already: refactored `showForm` to `view` union, added "Manage Blueprints" button with `Settings2` icon, and the `'blueprints'` view state

## Coordination with Task 3

Task 3 landed first and already:
1. Refactored `showForm: boolean` → `view: 'list' | 'form' | 'wizard' | 'blueprints'`
2. Added "Manage Blueprints" button in the header
3. Added a placeholder `{view === "blueprints" && ...}` block

Task 4 simply replaced the placeholder with the real component and added the import.
