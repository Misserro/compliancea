# Task 3 — Implementation Plan

## Files to modify
1. `src/app/(app)/dashboard/page.tsx` — error state, empty states, row affordance
2. `messages/en.json` — add `Dashboard.errorTitle` and `Dashboard.errorSub`
3. `messages/pl.json` — add `Dashboard.errorTitle` and `Dashboard.errorSub`

## Changes in detail

### 1. Error state (`dashboard/page.tsx`)

- Add `const [error, setError] = useState(false);` after the existing `loading` state (line 54)
- Replace `.catch(() => {/* silent — skeletons stay */})` with `.catch(() => setError(true))`
- After the KPI grid section (after line 139 closing `</div>`), insert the error card:
  ```tsx
  {error && !loading && (
    <div className="rounded-xl border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium">{t("errorTitle")}</p>
      <p className="text-xs text-muted-foreground mt-1">{t("errorSub")}</p>
    </div>
  )}
  ```
- `AlertTriangle` is already imported — no new import needed for error state

### 2. Empty state design (`dashboard/page.tsx`)

Add imports: `CalendarCheck`, `FileCheck`, `ChevronRight` to the lucide-react import line.

Replace 4 bare `<p>` empty states with icon+text `<div>` blocks:

| Empty state key | Panel | Icon |
|---|---|---|
| `noUpcomingDeadlines` | Upcoming Obligations (line 157) | `CalendarCheck` |
| `noContractsExpiring` | Contracts Expiring Soon (line 195) | `FileCheck` |
| `noUpcomingCaseDeadlines` | Upcoming Court Deadlines (line 230) | `CalendarCheck` |
| `noRecentCases` | Recent Cases (line 267) | `Scale` (already imported) |

Each replacement follows the pattern:
```tsx
// Before:
<p className="px-5 py-8 text-xs text-muted-foreground text-center">{t("...")}</p>
// After:
<div className="px-5 py-8 text-center">
  <Icon className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
  <p className="text-xs text-muted-foreground">{t("...")}</p>
</div>
```

Note: The spec says "all 5 panel empty states" but the code contains exactly 4 panel empty states. The 4 listed icon assignments cover all of them.

### 3. Row affordance (`dashboard/page.tsx`)

For every clickable `<button>` in the 4 detail panels:
- Add `group` class to the button's className
- After the existing right-side `<span>`, append:
  ```tsx
  <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
  ```

Affected buttons:
1. Obligations panel row button (line 162-175)
2. Contracts panel row button (line 198-211)
3. Court deadlines panel row button (line 235-249)
4. Recent cases panel row button (line 270-284)

### 4. i18n keys

**en.json** — add before closing `}` of Dashboard object (after line 868):
```json
"errorTitle": "Could not load dashboard",
"errorSub": "Refresh the page to try again."
```

**pl.json** — same position:
```json
"errorTitle": "Nie można załadować pulpitu",
"errorSub": "Odśwież stronę, aby spróbować ponownie."
```

## Risks / Trade-offs
- Task 2 also modifies `dashboard/page.tsx` (changes `max-w-5xl` to `max-w-6xl`). My changes do not touch line 88, so no merge conflict expected.
- The spec mentions "5 panel empty states" but only 4 exist in the code with 4 icon assignments listed. Implementing exactly the 4 that exist.

## Success criteria satisfaction
- API failure shows error card with AlertTriangle — YES (error state + setError in catch)
- All panel "no data" states show icon above text — YES (4 empty states updated)
- Hovering panel rows reveals ChevronRight — YES (group + opacity transition on all 4 panel button types)
- Loading skeleton behavior unchanged — YES (no skeleton code modified)
- i18n keys exist in both en.json and pl.json — YES
