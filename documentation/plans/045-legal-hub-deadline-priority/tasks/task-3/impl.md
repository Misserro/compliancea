## Task 3 Complete -- Case List Server-Side Pagination

### Files Modified

- **`lib/db.js`** (lines 2839-2917) -- `getLegalCases` rewritten:
  - New params: `priority`, `sortBy`, `limit`, `offset`
  - Separate `SELECT COUNT(*)` query for total count (sql.js compatible, no window functions)
  - Status supports comma-separated values via `IN (...)` clause for multi-select
  - Dynamic `ORDER BY` based on `sortBy`: deadline (NULLS LAST), title, created, priority (CASE expression)
  - `LIMIT`/`OFFSET` appended when provided
  - Returns `{ cases, total }` instead of flat array

- **`lib/db.d.ts`** (line 106) -- Updated type declaration: `getLegalCases(...args: any[]): { cases: any[]; total: number }`

- **`src/app/api/legal-hub/cases/route.ts`** (GET handler) -- Reads `page`, `pageSize`, `priority`, `sortBy` query params; computes offset; passes all params to `getLegalCases`; returns `{ cases, total, page, pageSize }`

- **`src/components/legal-hub/case-list.tsx`** -- Complete rewrite as presentation component:
  - No internal fetch or client-side filtering/sorting
  - Props: `cases`, `total`, `page`, `pageSize`, `loading`, `onPageChange`
  - Pagination controls: "Showing X-Y of Z cases", prev/next buttons, up to 5 page number buttons
  - Uses Button component + ChevronLeft/ChevronRight from lucide-react
  - Empty state for 0 results

- **`src/components/legal-hub/legal-hub-dashboard.tsx`** -- Owns the fetch lifecycle:
  - New state: `page`, `debouncedSearch`, `cases`, `total`, `loading`
  - Search debounce (300ms) to avoid excessive API calls
  - `useEffect` resets page to 1 on any filter/sort change
  - `useEffect` fetches from API with all params on any dependency change
  - Passes server data + pagination props to CaseList
  - DeadlineAlertBanner, all filter UI, NewCaseDialog preserved unchanged

- **`messages/en.json`** -- Added `LegalHub.pagination.*`: showing, previous, next, page, noResults
- **`messages/pl.json`** -- Added Polish equivalents under `LegalHub.pagination.*`
- **`tests/integration/org-isolation.test.ts`** (lines 193-206) -- Updated to use `result.cases` instead of flat array

### Integration Notes

- INTEGRATION: `getLegalCases` return type changed from `any[]` to `{ cases: any[], total: number }`. All existing callers updated.
- INTEGRATION: CaseList props changed completely -- no longer accepts filter props, now accepts server data props.
- GOTCHA: sql.js WASM does not reliably support `COUNT(*) OVER()` window functions. Used separate COUNT query with same WHERE clauses.
- GOTCHA: The `selectedStatuses` array is joined with commas before sending as query param, then split server-side for the SQL `IN (...)` clause.

### Verification

- `npx tsc --noEmit` passes with zero errors
