## Task 2 Complete — In-App Deadline Alert Banner

- Created: `src/app/api/legal-hub/deadlines/upcoming/route.ts` (new file)
  - `GET /api/legal-hub/deadlines/upcoming?days=7` endpoint
  - Replicates exact auth + org/role visibility pattern from `src/app/api/legal-hub/cases/route.ts`
  - Returns `{ overdue: DeadlineAlert[], upcoming: DeadlineAlert[] }` with `daysUntil` computed per item
  - Days param clamped between 1-90 for safety
  - Imports `DeadlineAlert` type from `@/lib/types`

- Created: `src/components/legal-hub/deadline-alert-banner.tsx` (new file)
  - Client component that fetches from the new endpoint on mount
  - Returns null during loading (no layout shift) and when no alerts exist
  - Per-user sessionStorage dismiss key: `deadline-banner-dismissed-${userId}` via `useSession()`
  - Waits for session to resolve before checking dismiss state or fetching
  - Collapsible banner with summary badges (destructive for overdue, amber for upcoming)
  - Expanded view lists each deadline with case title, deadline title, due date, and relative days label
  - Amber badge and upcoming rows use full dark mode coverage: `dark:bg-amber-900 dark:text-amber-200 dark:border-amber-800`
  - Dismiss button sets sessionStorage and hides banner for the session
  - Imports `DeadlineAlert` type from `@/lib/types`

- Modified: `src/lib/types.ts` — added `DeadlineAlert` interface after `CaseDeadline`
  - Shared between route.ts and deadline-alert-banner.tsx (no duplication)

- Modified: `lib/db.js` — added `getUpcomingDeadlinesForUser(orgId, userId, orgRole, days)` function at end of file
  - Queries `case_deadlines` joined with `legal_cases` for pending deadlines within N days
  - Respects org scoping and member visibility (assigned_to filter)
  - Uses positional params (not destructured) for TS compatibility

- Modified: `lib/db.d.ts` — added `export function getUpcomingDeadlinesForUser(...args: any[]): any;` declaration
  - GOTCHA: TS resolves `../../lib/db.js` to `lib/db.d.ts`, not the JS file directly. Any new export in db.js MUST also be declared in db.d.ts.

- Modified: `src/lib/db-imports.ts` — added `getUpcomingDeadlinesForUser` to re-export list (line 113)

- Modified: `src/components/legal-hub/legal-hub-dashboard.tsx` — imported and rendered `<DeadlineAlertBanner />` above the header row

- Modified: `messages/en.json` — added `LegalHub.deadlineAlert.*` namespace (title, overdue, upcoming, dismiss, showDetails, hideDetails, dueDate, overdueDays, dueInDays, dueToday)

- Modified: `messages/pl.json` — added Polish equivalents for `LegalHub.deadlineAlert.*`

- Exports: `DeadlineAlertBanner` component from `src/components/legal-hub/deadline-alert-banner.tsx`; `DeadlineAlert` type from `src/lib/types.ts`
- INTEGRATION: None — this is a self-contained feature with no downstream dependencies
- GOTCHA: The `date('now', '+' || ? || ' days')` SQLite expression uses string concatenation for the days parameter — tested to be valid SQLite syntax.
- `npx tsc --noEmit` passes with zero errors

### Review/Test Fix Cycle 1

Fixed 4 issues (3 from reviewer-2, 1 from tester-2):

1. **[PATTERN] DeadlineAlert type deduplication** — moved `DeadlineAlert` interface to `src/lib/types.ts`, imported via `import type { DeadlineAlert }` in both route.ts and deadline-alert-banner.tsx
2. **[QUALITY] Per-user sessionStorage key** — changed from static `"deadline-banner-dismissed"` to `deadline-banner-dismissed-${userId}` using `useSession()`. useEffect now depends on `[sessionStatus, dismissKey]` and waits for session to load.
3. **[PATTERN] Dark mode coverage on amber Badge** — added `dark:bg-amber-900 dark:text-amber-200 dark:border-amber-800` to the upcoming Badge and ensured upcoming rows already had `dark:bg-amber-950/20 dark:text-amber-200`.
4. **[CRITERIA] Due date display in expanded rows** — each row now shows `Due: {date} ({relative label})` using the existing `deadlineAlert.dueDate` i18n key, satisfying "case title + deadline title + due date" requirement.
