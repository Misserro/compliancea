# Task 2 — In-App Deadline Alert Banner: Implementation Plan

## Overview

Add a new API endpoint `GET /api/legal-hub/deadlines/upcoming` that returns pending deadlines that are overdue or due within 7 days across all user-visible cases. Build a dismissible, collapsible alert banner that renders at the top of the Legal Hub dashboard above the filter row.

## Files to Create

### 1. `lib/db.js` — New `getUpcomingDeadlinesForUser` function

Add a new exported function (no schema changes needed) that queries `case_deadlines` joined with `legal_cases` to return pending deadlines where:
- `cd.status = 'pending'`
- `cd.due_date <= date('now', '+7 days')` (includes overdue and upcoming)
- Scoped by `lc.org_id = ?`
- If `orgRole === 'member'`, additionally filter `lc.assigned_to = ?` (same visibility pattern as `getLegalCases`)

Returns rows with: `cd.id, cd.case_id, lc.title AS case_title, cd.title, cd.deadline_type, cd.due_date, cd.status`

SQL query pattern:
```sql
SELECT cd.id, cd.case_id, lc.title AS case_title, cd.title, cd.deadline_type, cd.due_date
FROM case_deadlines cd
JOIN legal_cases lc ON cd.case_id = lc.id
WHERE cd.status = 'pending'
  AND cd.due_date <= date('now', '+7 days')
  AND lc.org_id = ?
  [AND lc.assigned_to = ?]  -- if member
ORDER BY cd.due_date ASC
```

Location: after the existing `getCaseDeadlines` function (~line 3096).

### 2. `src/lib/db-imports.ts` — Export new function

Add `getUpcomingDeadlinesForUser` to the re-export list.

### 3. `src/app/api/legal-hub/deadlines/upcoming/route.ts` (new file)

New GET endpoint replicating the auth + org/role visibility pattern from `src/app/api/legal-hub/cases/route.ts`:
- `auth()` session check
- Permission check: member role needs `legal_hub` view permission
- `ensureDb()`
- Call `getUpcomingDeadlinesForUser({ orgId, userId, orgRole })`
- Split results into `overdue` (due_date < today) and `upcoming` (due_date >= today and <= today+7)
- Compute `daysUntil` for each deadline (negative for overdue)
- Return `{ overdue: DeadlineAlert[], upcoming: DeadlineAlert[] }`

Response shape per item: `{ id, caseId, caseTitle, title, deadline_type, due_date, daysUntil }`

### 4. `src/components/legal-hub/deadline-alert-banner.tsx` (new file)

Client component that:
- Fetches `GET /api/legal-hub/deadlines/upcoming` on mount
- While loading: renders nothing (no layout shift)
- If zero overdue and zero upcoming: renders nothing
- Checks `sessionStorage` key `deadline-banner-dismissed` — if `"true"`, renders nothing
- Otherwise renders a banner with:
  - Summary line: "X overdue / Y due within 7 days" using Badge components (destructive for overdue, amber/outline for upcoming)
  - Collapsible section (using `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` from `@/components/ui/collapsible`) listing each deadline: case title, deadline title, due date
  - Overdue section styled with `text-destructive` / red styling
  - Upcoming section styled with amber/warning colors (Tailwind `text-amber-600`, `bg-amber-50`, etc.)
  - Dismiss button (X icon or "Dismiss" text) that sets `sessionStorage.setItem("deadline-banner-dismissed", "true")` and hides the banner
- Uses `useTranslations('LegalHub')` for all strings under `LegalHub.deadlineAlert.*`

### 5. `src/components/legal-hub/legal-hub-dashboard.tsx` — Mount the banner

Import and render `<DeadlineAlertBanner />` at the top of the `<div className="space-y-4">`, before the header row.

### 6. `messages/en.json` — Add `LegalHub.deadlineAlert` namespace

```json
"deadlineAlert": {
  "title": "Deadline alerts",
  "overdue": "{count} overdue",
  "upcoming": "{count} due within 7 days",
  "dismiss": "Dismiss",
  "showDetails": "Show details",
  "hideDetails": "Hide details",
  "dueDate": "Due: {date}",
  "overdueDays": "{count} days overdue",
  "dueInDays": "Due in {count} days",
  "dueToday": "Due today"
}
```

### 7. `messages/pl.json` — Polish equivalents

```json
"deadlineAlert": {
  "title": "Alerty terminow",
  "overdue": "{count} po terminie",
  "upcoming": "{count} w ciagu 7 dni",
  "dismiss": "Ukryj",
  "showDetails": "Pokaz szczegoly",
  "hideDetails": "Ukryj szczegoly",
  "dueDate": "Termin: {date}",
  "overdueDays": "{count} dni po terminie",
  "dueInDays": "Za {count} dni",
  "dueToday": "Termin dzisiaj"
}
```

## Success Criteria Mapping

| Criterion | How addressed |
|-----------|---------------|
| GET endpoint returns correct data, respects org+role | New db function + route with same auth pattern as cases route |
| Banner appears when deadlines exist | Conditional render in banner component |
| Correct overdue/upcoming counts | JS split on `due_date < today` in the route handler |
| Expandable list with case+deadline+date | Collapsible component with mapped entries |
| Dismiss via sessionStorage | `sessionStorage` key check on mount + dismiss handler |
| No banner when no alerts | Conditional return null |
| No layout shift on loading | Return null while loading |
| Overdue = red, upcoming = amber | Tailwind destructive/amber color classes |
| `npx tsc --noEmit` passes | Proper TypeScript types throughout |

## Risks / Trade-offs

- **SQLite date functions**: Using `date('now', '+7 days')` — this is standard SQLite and matches existing patterns in the codebase (the `case_deadlines.due_date` column stores DATE values).
- **sessionStorage key**: Using a simple boolean key, not per-user. Since the app requires login, each browser session is inherently per-user. If two users share a browser, the dismiss state may cross over, but this is acceptable per the spec ("session" scope).
- **No real-time updates**: The banner fetches once on mount. If a deadline is added/completed while the page is open, the banner won't update until the next page load. This is consistent with how `CaseList` works.
