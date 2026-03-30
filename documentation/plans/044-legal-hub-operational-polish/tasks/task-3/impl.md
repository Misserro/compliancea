# Task 3 Complete — Case List Sorting

## Changes

- **Modified:** `src/components/legal-hub/legal-hub-dashboard.tsx`
  - Added `sortBy` state (line 32): `useState<"deadline" | "title" | "created">("deadline")`
  - Added sort `<select>` dropdown (lines 109-120) next to existing case type dropdown, wrapped both in a `flex-wrap` container
  - Passed `sortBy` prop to `<CaseList>` (line 130)

- **Modified:** `src/components/legal-hub/case-list.tsx`
  - Added `sortBy` to `CaseListProps` interface (line 15)
  - Added `sortBy` to destructured props (line 23)
  - Added `.sort()` after the existing `.filter()` chain (lines 63-80):
    - `"deadline"`: compares `next_deadline` ISO strings, nulls/undefined sorted last
    - `"title"`: `localeCompare` for locale-aware alphabetical sort
    - `"created"`: `created_at` descending (newest first)

- **Modified:** `messages/en.json` — added 4 keys under `LegalHub.dashboard`:
  - `sortBy`: "Sort:"
  - `sortDeadline`: "Next deadline"
  - `sortTitle`: "Title A-Z"
  - `sortCreated`: "Newest"

- **Modified:** `messages/pl.json` — added 4 keys under `LegalHub.dashboard`:
  - `sortBy`: "Sortuj:"
  - `sortDeadline`: "Najbliższy termin"
  - `sortTitle`: "Tytuł A-Z"
  - `sortCreated`: "Najnowsze"

## Verification

- `npx tsc --noEmit` passes with zero errors
- Sort state is independent of filter state (changing sort does not reset `selectedStatuses` or `selectedCaseType`)
- Sort state persists in `LegalHubDashboard` component across navigation within Legal Hub
- Sort dropdown follows same visual pattern as existing case type dropdown (same classes, label + select structure)

## INTEGRATION

- No exports added; changes are internal to the dashboard/case-list component pair
- No other tasks depend on this change
