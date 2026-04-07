# Lead Notes — Plan 051: Navigation Restructure & Hub Dashboards

## Plan Overview

Restructure the app's navigation from flat hub groups to three collapsible category sections (Contract, Legal, Documents). Each category header links to a new hub dashboard page and has a chevron toggle. Routes are cleaned up to match the hierarchy. Old URLs redirect permanently.

## Concurrency Decision

Max 3 concurrent task-teams. Tasks 1, 2, 3 run in parallel (no dependencies). Task 4 starts after all three complete. Task 5 starts after Task 4 completes.

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies
- Task 3: no dependencies
- Task 4: depends on Tasks 1, 2, 3
- Task 5: depends on Tasks 1, 2, 3, 4

## Key Architectural Constraints

1. **Next.js App Router** — pages live in `src/app/(app)/`. Route groups use `(app)/` prefix. New pages must follow existing pattern.
2. **Sidebar is a single file** — `src/components/layout/app-sidebar.tsx` is the sole source of truth for nav. Task 4 rewrites it entirely.
3. **Collapsible primitives** — `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` are already exported from `src/components/ui/sidebar.tsx`. `src/components/ui/collapsible.tsx` provides the `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` primitives. Both need to be imported in `app-sidebar.tsx`.
4. **Hub dashboards reuse /api/dashboard** — the existing API endpoint already returns `docs`, `contracts`, `obligations`, and `legalHub` sections. New hub dashboards should fetch from this endpoint and filter the relevant section — do NOT create new API routes.
5. **Redirects in next.config.mjs** — permanent (308) redirects for all old routes. Specific paths must come before catch-all patterns.
6. **i18n** — both `messages/en.json` and `messages/pl.json` must be updated together. Sidebar keys live under the `"Sidebar"` namespace.
7. **Permission gating preserved** — `canView(resource)` and `canAccessFeature(feature)` checks must remain on the collapsible category wrappers in the new sidebar.
8. **Plan 043 absorption** — Tasks 3 and 5 of Plan 043 are superseded by Task 4 of this plan. The Policies item is already removed from the sidebar. The separator before "My Law Firm" will be implemented in Task 4 using `<SidebarSeparator />` inside the Legal collapsible sub-menu.

## New Route Mapping

| Old Route | New Route | Notes |
|---|---|---|
| `/legal-hub` | `/legal/cases` | Cases list |
| `/legal-hub/[id]` | `/legal/cases/[id]` | Case detail |
| `/legal-hub/templates` | `/legal/templates` | Templates |
| `/legal-hub/firm` | `/legal/firm` | Law firm admin |
| _(new)_ | `/legal` | Legal hub dashboard |
| `/contracts` | `/contracts/list` | Contracts list (moved) |
| `/contracts/new` | `/contracts/list/new` | New contract form (moved) |
| `/obligations` | `/contracts/obligations` | Obligations (moved) |
| _(new)_ | `/contracts` | Contracts hub dashboard |
| `/documents` | `/documents/library` | Doc library (moved) |
| `/document-tools` | `/documents/ai-tools` | AI tools (moved) |
| `/ask` | `/documents/ai-tools` | Was already redirecting here |
| _(new)_ | `/documents` | Documents hub dashboard |

## Dashboard Page Style Reference

Hub dashboards should follow the style of `src/app/(app)/dashboard/page.tsx`:
- KPI cards using the `KpiCard` component pattern (icon, label, value, sub)
- Detail panels with header + divider + item rows
- `p-6 max-w-6xl mx-auto space-y-8` outer wrapper
- Permission-gated sections
- Fetch from `/api/dashboard`, extract the relevant section

## Decisions Made

_(populated during execution)_

## Files Modified

_(populated during execution)_
