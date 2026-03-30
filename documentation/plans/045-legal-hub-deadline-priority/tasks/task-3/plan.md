# Task 3 Implementation Plan -- Case List Server-Side Pagination

## Overview

Switch from "load all cases, filter client-side" to server-side pagination with 25 cases per page. All filter params (search, status, caseType, priority) and sort move to API query params. Client performs no filtering or sorting.

## Files to Modify

### 1. `lib/db.js` -- `getLegalCases` function (lines 2839-2876)

**Current:** Accepts `{ search, status, caseType, orgId, userId, orgRole }`, returns `any[]` via `query()`.

**Changes:**
- Add `limit`, `offset`, `priority`, and `sortBy` params to the destructured options object
- Add `priority` WHERE clause: `AND lc.priority = ?` when `priority` is provided
- Handle `status` as potentially comma-separated for multi-select (current UI uses checkbox array `selectedStatuses`). Use `IN (...)` clause with dynamic placeholders when status contains commas.
- Replace hardcoded `ORDER BY lc.created_at DESC` with dynamic ORDER BY based on `sortBy` param: `deadline` -> `next_deadline ASC NULLS LAST`, `title` -> `lc.title ASC`, `created` -> `lc.created_at DESC`, `priority` -> priority order expression
- Build a separate COUNT query with the same WHERE clauses (no LIMIT/OFFSET, no ORDER BY)
- Add `LIMIT ? OFFSET ?` to main query
- Return `{ cases, total }` instead of flat array

**COUNT approach:** Separate `SELECT COUNT(*) as total FROM legal_cases lc WHERE ...` query using the same WHERE clauses and params (without the JOIN and subquery since we only need count). This avoids sql.js window function compatibility issues.

### 2. `lib/db.d.ts` -- Type declaration update (line 106)

**Current:** `export function getLegalCases(...args: any[]): any;`

**Change to:** `export function getLegalCases(...args: any[]): { cases: any[], total: number };`

### 3. `src/app/api/legal-hub/cases/route.ts` -- GET handler (lines 36-50)

**Changes:**
- Read additional query params: `page` (default "1"), `pageSize` (default "25"), `priority`, `sortBy`
- Parse `page` and `pageSize` as integers with validation
- Compute `offset = (page - 1) * pageSize`
- Pass `limit: pageSize`, `offset`, `priority`, `sortBy` to `getLegalCases`
- Return `{ cases, total, page, pageSize }` instead of `{ cases }`

### 4. `src/components/legal-hub/case-list.tsx` -- Full rewrite of data flow

**Current:** Fetches all cases with no params, applies client-side filtering + sorting.

**Changes:**
- Remove all client-side filter/sort logic (the `filteredCases` chain, `PRIORITY_ORDER` map)
- Add new props: `page`, `pageSize`, `total`, `onPageChange`, remove `searchQuery`, `selectedStatuses`, `selectedCaseType`, `selectedPriority`, `sortBy` (these move to dashboard as fetch params)
- Accept `cases` as a prop (already server-filtered), plus `total`, `page`, `pageSize`, `onPageChange`, `loading`
- Remove the internal `useEffect` fetch -- fetching moves to the dashboard
- Add pagination controls at the bottom: "Showing X-Y of Z cases" text, prev/next buttons, up to 5 page number buttons
- Use Button component from `@/components/ui/button` + ChevronLeft/ChevronRight from lucide-react
- Empty state: when `total === 0` show "No cases match the filters" message
- Loading state: show skeleton as before

### 5. `src/components/legal-hub/legal-hub-dashboard.tsx` -- Data fetching + page state

**Changes:**
- Add `page` state (default 1)
- Add `cases`, `total`, `loading` state
- Add `useEffect` that fetches from `/api/legal-hub/cases` with all params: `search`, `status` (join selectedStatuses with comma), `caseType`, `priority`, `sortBy`, `page`, `pageSize=25`
- Dependencies: `searchQuery`, `selectedStatuses`, `selectedCaseType`, `selectedPriority`, `sortBy`, `page`, `refreshTrigger`
- When any filter changes (search, status, caseType, priority, sortBy), reset `page` to 1
- Pass `cases`, `total`, `page`, `pageSize: 25`, `onPageChange`, `loading` to CaseList
- Add debounce for search input (300ms) to avoid excessive API calls while typing
- Preserve DeadlineAlertBanner, all existing filter UI, NewCaseDialog

### 6. `messages/en.json` -- Add pagination strings

Add under `LegalHub.pagination`:
```json
"pagination": {
  "showing": "Showing {from}-{to} of {total} cases",
  "previous": "Previous",
  "next": "Next",
  "page": "Page {page}",
  "noResults": "No cases match the current filters."
}
```

### 7. `messages/pl.json` -- Polish equivalents

Add under `LegalHub.pagination`:
```json
"pagination": {
  "showing": "Pokazywanie {from}-{to} z {total} spraw",
  "previous": "Poprzednia",
  "next": "Nastepna",
  "page": "Strona {page}",
  "noResults": "Zadna sprawa nie pasuje do biezacych filtrow."
}
```

## Design Decisions

1. **Separate COUNT query** rather than window function -- sql.js WASM may not support `COUNT(*) OVER()`.
2. **Status multi-select** -- The UI uses checkboxes for status (array of strings). We'll join them with commas and split server-side to build an `IN (...)` clause.
3. **Sort server-side** -- `sortBy` moves to the API. For `priority` sort, we use a CASE expression: `CASE lc.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END`.
4. **Search debounce** -- 300ms debounce on the search input to avoid hammering the API on each keystroke.
5. **Page reset on filter change** -- Any filter/sort change resets to page 1 to avoid showing empty pages.
6. **CaseList becomes a presentation component** -- No longer fetches data internally. Dashboard owns the fetch lifecycle.

### 8. `tests/integration/org-isolation.test.ts` -- Update test expectations (lines 193-205)

The `getLegalCases` return type changes from `any[]` to `{ cases: any[], total: number }`. Three test assertions reference the old return type:
- Line 193: `const cases1 = dbModule.getLegalCases({ orgId: 1 })` -> access `.cases`
- Line 197: `const cases2 = dbModule.getLegalCases({ orgId: 2 })` -> access `.cases`
- Line 204-205: `const cases = dbModule.getLegalCases({})` -> check `cases.cases` is array

## Risks / Trade-offs

- **Breaking change to getLegalCases return type** -- Now returns `{ cases, total }` instead of `any[]`. Three callers: route.ts (modified), and 2 test files (updated).
- **Search debounce adds slight complexity** -- Using a `useRef` + `setTimeout` pattern (no external deps needed).
- **Multi-status filter as comma-separated string** -- Simple approach; works because status values don't contain commas.

## Success Criteria Mapping

- "Fetches only 25 per page" -> LIMIT/OFFSET in db.js, pageSize=25 default
- "Search/status/type sent as query params" -> dashboard builds URL with all params
- "Pagination controls" -> CaseList renders prev/next + page buttons + "Showing X-Y of Z"
- "Page 2+ works" -> offset calculation in route.ts
- "Filter change resets page" -> useEffect dependencies + page reset logic
- "Total count correct" -> separate COUNT query
- "Empty state" -> CaseList handles total=0
- "npx tsc --noEmit passes" -> update db.d.ts, proper TypeScript types throughout
