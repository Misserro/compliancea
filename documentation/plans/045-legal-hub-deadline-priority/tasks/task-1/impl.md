## Task 1 Complete -- Priority Field on Cases

### Files Modified

- **`lib/db.js`** (line ~813): Added migration `ALTER TABLE legal_cases ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'` using idempotent try/catch pattern
- **`lib/db.js`** (`createLegalCase`): Added `priority` parameter (default `'normal'`) to function signature, INSERT column list, and VALUES
- **`lib/db.js`** (`updateLegalCase`): Added `"priority"` to `allowedFields` array
- **`src/lib/types.ts`**: Added `CASE_PRIORITIES` const array, `CasePriority` type, and `priority: CasePriority` field to `LegalCase` interface
- **`src/app/api/legal-hub/cases/route.ts`** (POST): Passes `priority: body.priority || "normal"` to `createLegalCase`
- **`src/app/api/legal-hub/cases/[id]/route.ts`** (PATCH): Added `"priority"` to `allowedKeys` array
- **`src/components/legal-hub/case-metadata-form.tsx`**: Added priority to form state, resetForm, save payload; added Priority select in edit mode; added priority display in view mode
- **`src/components/legal-hub/case-card.tsx`**: Added colored priority badge (urgent=red, high=orange, low=blue) next to status/type badges; only rendered for non-normal priorities
- **`src/components/legal-hub/legal-hub-dashboard.tsx`**: Added `selectedPriority` state, priority filter dropdown, "Priority" sort option; passes `selectedPriority` to CaseList
- **`src/components/legal-hub/case-list.tsx`**: Added `selectedPriority` prop with filter logic; added `"priority"` sort case using PRIORITY_ORDER map (urgent=0, high=1, normal=2, low=3)
- **`messages/en.json`**: Added `LegalHub.priority.*` (label, urgent, high, normal, low) and `LegalHub.dashboard.sortPriority`, `filterByPriority`, `allPriorities`
- **`messages/pl.json`**: Added Polish equivalents

### Exports / Integration Points

- `CASE_PRIORITIES` and `CasePriority` exported from `src/lib/types.ts` -- available for Tasks 2/3
- `LegalCase.priority` field is now part of the type -- all components consuming `LegalCase` will see it
- `lc.*` in `getLegalCases` and `getLegalCaseById` queries automatically includes the new column

### Verification

- `npx tsc --noEmit` passes with zero errors
- Migration is idempotent (try/catch pattern)
- Existing cases get `'normal'` default via `DEFAULT 'normal'` in the ALTER TABLE
- New cases default to `"normal"` when no priority is specified in POST body

### GOTCHA

- The form state for `priority` is initialized from `legalCase.priority` which is typed as `CasePriority`. The select onChange uses a cast (`as typeof form.priority`) to satisfy TypeScript since `e.target.value` returns `string`.
