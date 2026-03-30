# Task 3 Plan — Case List Sorting

## Files to Modify

1. **`src/components/legal-hub/legal-hub-dashboard.tsx`** — add `sortBy` state and sort dropdown UI
2. **`src/components/legal-hub/case-list.tsx`** — accept `sortBy` prop, apply sort after filter
3. **`messages/en.json`** — add 4 i18n keys under `LegalHub.dashboard`
4. **`messages/pl.json`** — add 4 i18n keys under `LegalHub.dashboard`

## Changes Per File

### `legal-hub-dashboard.tsx`
- Add state: `const [sortBy, setSortBy] = useState<"deadline" | "title" | "created">("deadline");`
- Add a sort `<select>` dropdown in the existing filter area (after the case type dropdown, inside the `<div className="space-y-2">` block). Pattern matches the existing case type `<select>` exactly — same classes, same `<label>` + `<select>` structure in a `<div className="flex items-center gap-2">`.
- Pass `sortBy` as new prop to `<CaseList>`.
- Sort state is independent of filter state — changing sort does not touch `selectedStatuses` or `selectedCaseType`.

### `case-list.tsx`
- Add `sortBy: "deadline" | "title" | "created"` to `CaseListProps` interface.
- After the existing `.filter()` chain on `filteredCases`, add `.sort()` with a comparator based on `sortBy`:
  - `"deadline"`: Compare `next_deadline` strings (ISO dates). Nulls/undefined sort last. Soonest first.
  - `"title"`: `a.title.localeCompare(b.title)` (locale-aware, default locale).
  - `"created"`: Compare `created_at` strings descending (newest first).
- Use `useMemo` wrapping filter+sort for performance (or just chain inline — cases are small). Will keep it inline to match existing pattern (no useMemo currently).

### `messages/en.json`
Add inside `LegalHub.dashboard` object:
```json
"sortBy": "Sort:",
"sortDeadline": "Next deadline",
"sortTitle": "Title A\u2013Z",
"sortCreated": "Newest"
```

### `messages/pl.json`
Add inside `LegalHub.dashboard` object:
```json
"sortBy": "Sortuj:",
"sortDeadline": "Najbli\u017cszy termin",
"sortTitle": "Tytu\u0142 A\u2013Z",
"sortCreated": "Najnowsze"
```

## Success Criteria Coverage

- Sort dropdown in filter row: yes, placed next to type dropdown
- Default sort deadline (nulls last): yes, default state is `"deadline"`
- Title A-Z locale-aware: yes, `localeCompare`
- Newest by created_at desc: yes
- Sort persists during session: yes, state lives in dashboard component which persists while user is on the page
- Changing sort does not reset filters: yes, independent state
- i18n keys in both en.json and pl.json: yes, 4 keys each

## Risks / Trade-offs

- Sort is applied on the full filtered array every render. With the small number of cases typical in this app, this is fine. No useMemo needed.
- `next_deadline` is `string | null | undefined` — null/undefined both treated as "no deadline" and sorted last.
