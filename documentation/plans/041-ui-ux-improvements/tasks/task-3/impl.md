## Task 3 Complete — Dashboard UX: error state, empty states, row affordance

### Files modified
- **Modified:** `src/app/(app)/dashboard/page.tsx`
  - Line 5: Added `CalendarCheck`, `FileCheck`, `ChevronRight` to lucide-react imports
  - Line 55: Added `const [error, setError] = useState(false);`
  - Line 71: Replaced silent `.catch()` with `.catch(() => setError(true))`
  - Lines 142-148: Added error card block (`error && !loading`) with AlertTriangle icon, errorTitle, errorSub
  - Lines 166-169: Empty state for obligations panel — CalendarCheck icon + noUpcomingDeadlines text
  - Lines 208-211: Empty state for contracts panel — FileCheck icon + noContractsExpiring text
  - Lines 247-250: Empty state for court deadlines panel — CalendarCheck icon + noUpcomingCaseDeadlines text
  - Lines 288-291: Empty state for recent cases panel — Scale icon + noRecentCases text
  - Lines 174-187, 214-227, 255-268, 294-309: Added `group` class to all 4 panel row buttons + appended ChevronRight with `opacity-0 group-hover:opacity-100 transition-opacity`

- **Modified:** `messages/en.json`
  - Added `Dashboard.errorTitle`: "Could not load dashboard"
  - Added `Dashboard.errorSub`: "Refresh the page to try again."

- **Modified:** `messages/pl.json`
  - Added `Dashboard.errorTitle`: "Nie mozna zaladowac pulpitu"
  - Added `Dashboard.errorSub`: "Odswiez strone, aby sprobowac ponownie."

### Design decisions
- Error card renders BELOW the KPI grid (after line 140), not replacing it. KPI grid shows `null` when `data` is null (no frozen skeletons since `loading` is false by the time error renders).
- 4 empty states updated (not 5 as originally spec'd — confirmed with Lead that 4 is correct).
- Row affordance uses Tailwind `group`/`group-hover` pattern — no JS hover state needed.

### INTEGRATION
- No exports or integration points. All changes are self-contained in the dashboard page and i18n files.
- Task 2 already merged its `max-w-6xl` change (line 88) — no conflict.

### Verification
- `npx tsc --noEmit` passes with zero errors.
