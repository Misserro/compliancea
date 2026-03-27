# Lead Notes — Plan 041

## Plan Overview
UI/UX improvements across three areas:
1. Design token refresh — indigo primary, dark navy sidebar (light mode), radius 0.75rem
2. Sidebar footer readability fix + dashboard max-width + active nav accent
3. Dashboard UX — error state, empty states with icons, row affordance (ChevronRight on hover)

## Concurrency Decision
3 tasks. Max 2 concurrent.
- Task 1: no dependencies — spawn immediately
- Task 2: depends on Task 1 — pipeline-spawn during Task 1 review/test phase
- Task 3: depends on Task 1 — pipeline-spawn during Task 1 review/test phase
- Tasks 2 and 3 run in parallel once Task 1 completes

## Task Dependency Graph
- Task 1: no dependencies
- Task 2: depends on Task 1
- Task 3: depends on Task 1

## Key Architectural Constraints
- All color tokens in `src/app/globals.css` — `:root` (light mode) and `.dark` blocks
- Sidebar uses `--sidebar-*` CSS vars; `bg-sidebar` maps to `--sidebar` CSS custom property
- Dark sidebar in light mode = update `:root` sidebar tokens (not just `.dark`)
- Sidebar footer uses `text-muted-foreground` (main app token) — incompatible with dark sidebar; must change to `text-sidebar-foreground/*` tokens
- `SidebarMenuButton` active state uses `data-active="true"` attribute — can be targeted with CSS attribute selector
- Dashboard error state: add `useState<boolean>` for error; set in `.catch()` block
- `AlertTriangle` is already imported in `dashboard/page.tsx`
- `CalendarCheck`, `FileCheck`, `ChevronRight` are NOT yet imported — executor must add
- Row affordance pattern: add `group` class to `<button>`, append `<ChevronRight className="... opacity-0 group-hover:opacity-100 transition-opacity">` after right-side span
- i18n: all new string keys go in both `messages/en.json` and `messages/pl.json`

## Execution Complete

**Plan:** 041-ui-ux-improvements
**Tasks:** 3 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: Updated `globals.css` with 14 `:root` token changes (indigo primary, dark navy sidebar, radius 0.75rem) and 5 `.dark` token changes
- Task 2: Fixed sidebar footer readability (4 files: app-sidebar.tsx, language-switcher.tsx, dashboard/page.tsx, globals.css active nav CSS rule)
- Task 3: Dashboard UX — error state, 4 icon+text empty states, ChevronRight row affordance, 2 new i18n keys

### Files Modified
- `src/app/globals.css` — design token refresh + active nav CSS rule
- `src/components/layout/app-sidebar.tsx` — footer text color fixes
- `src/components/layout/language-switcher.tsx` — footer text color fix
- `src/app/(app)/dashboard/page.tsx` — max-w-6xl + error state + empty states + row affordance
- `messages/en.json` — Dashboard.errorTitle, Dashboard.errorSub
- `messages/pl.json` — Dashboard.errorTitle, Dashboard.errorSub

### Test Results
- Per-task tests: 3/3 PASS
- Final gate (full suite): PASSED — all criteria verified, TypeScript clean

### Minor deviation
Spec said "5 empty states" — code had exactly 4. Executor correctly identified and documented this at planning time.

---

## Critical Decisions
- Sidebar dark navy applied in `:root` (light mode default) — user chose dark sidebar direction
- `.dark` mode sidebar tokens remain as-is (already dark)
- Only `.dark` primary/ring/accent updated for indigo; rest of `.dark` tokens unchanged
- Dashboard error state renders BELOW the KPI grid if `error && !loading`
- 5 empty states to update in dashboard/page.tsx — all follow same icon+text pattern
