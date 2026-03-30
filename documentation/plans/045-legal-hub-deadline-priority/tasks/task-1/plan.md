# Task 1 — Priority Field on Cases: Implementation Plan

## Files to Modify

### 1. `lib/db.js`
- **Migration block** (~line 811): Add `try { db.run("ALTER TABLE legal_cases ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'"); } catch(e) {}` after the existing `assigned_to` migration
- **`getLegalCases`** (line 2836): Add `lc.priority` to SELECT (already covered by `lc.*`, so no change needed to SELECT itself). No change needed — `lc.*` already picks up the new column.
- **`createLegalCase`** (line 2900): Add `priority` parameter (default `'normal'`) and include it in INSERT column list and VALUES
- **`updateLegalCase`** (line 2952): Add `"priority"` to `allowedFields` array

### 2. `src/lib/types.ts`
- Add `priority: "urgent" | "high" | "normal" | "low"` to `LegalCase` interface (after `assigned_to_name`)
- Export a `CASE_PRIORITIES` constant array: `["urgent", "high", "normal", "low"] as const`
- Export `CasePriority` type from the const

### 3. `src/app/api/legal-hub/cases/route.ts` (POST handler)
- Accept `priority` from request body (default `"normal"`)
- Pass it to `createLegalCase` call

### 4. `src/app/api/legal-hub/cases/[id]/route.ts` (PATCH handler)
- Add `"priority"` to the `allowedKeys` array (line 129)

### 5. `src/components/legal-hub/case-metadata-form.tsx`
- Add `priority` to form state (initialized from `legalCase.priority`)
- Add Priority select field in edit mode with 4 options (urgent/high/normal/low)
- Include `priority` in the PATCH payload in `handleSave`
- Add priority display in view mode (showing the colored badge for non-normal, dash for unset)

### 6. `src/components/legal-hub/case-card.tsx`
- Add a priority badge next to the status and type badges
- Colors: urgent = red (`bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`), high = orange (`bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`), low = blue (`bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`)
- Only render for non-normal priorities

### 7. `src/components/legal-hub/legal-hub-dashboard.tsx`
- Add `selectedPriority` state (string, default `""` meaning all)
- Add priority filter dropdown (same pattern as case type dropdown)
- Add `"priority"` option to `sortBy` state type and dropdown
- Pass `selectedPriority` to `CaseList`

### 8. `src/components/legal-hub/case-list.tsx`
- Accept `selectedPriority` prop
- Add client-side priority filter
- Add `"priority"` sort case: urgent(0) > high(1) > normal(2) > low(3)
- Update `sortBy` type to include `"priority"`

### 9. `messages/en.json`
- Add under `LegalHub`:
  - `"priority"`: `{ "label": "Priority", "urgent": "Urgent", "high": "High", "normal": "Normal", "low": "Low" }`
  - `"dashboard.filterByPriority"`: `"Priority:"`
  - `"dashboard.allPriorities"`: `"All priorities"`
  - `"dashboard.sortPriority"`: `"Priority"`

### 10. `messages/pl.json`
- Polish equivalents:
  - `"priority"`: `{ "label": "Priorytet", "urgent": "Pilne", "high": "Wysoki", "normal": "Normalny", "low": "Niski" }`
  - `"dashboard.filterByPriority"`: `"Priorytet:"`
  - `"dashboard.allPriorities"`: `"Wszystkie priorytety"`
  - `"dashboard.sortPriority"`: `"Priorytet"`

## Success Criteria Mapping

1. Migration adds column with DEFAULT 'normal' -- existing rows unaffected
2. Priority select in metadata edit form -- 4 options via CASE_PRIORITIES
3. Colored badge on case card for non-normal priorities
4. Priority filter dropdown on dashboard
5. Sort by priority option (urgent=0, high=1, normal=2, low=3)
6. New cases default to "normal" -- createLegalCase default param
7. `npx tsc --noEmit` passes -- types updated consistently

## Risks

- None significant. All changes are additive. The migration pattern is well-established and idempotent.
- `lc.*` in getLegalCases already picks up new columns automatically.
