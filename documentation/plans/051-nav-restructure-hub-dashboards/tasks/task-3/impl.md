# Task 3 Implementation Notes — Documents Hub route migration + /documents dashboard

## Files Changed

### Created
- `src/app/(app)/documents/library/page.tsx` — Existing documents library page moved here (verbatim copy from old `documents/page.tsx`, function renamed to `DocumentsLibraryPage`)
- `src/app/(app)/documents/ai-tools/page.tsx` — AI Tools page moved here (verbatim copy from old `document-tools/page.tsx`, function renamed to `DocumentAiToolsPage`)
- `documentation/plans/051-nav-restructure-hub-dashboards/tasks/task-3/redirects.json` — Redirect entries for Lead to consolidate into next.config.mjs

### Modified
- `src/app/(app)/documents/page.tsx` — Replaced documents library with new hub dashboard (fetches from `/api/dashboard`, displays KPI cards for total/processed/AI tools, by-type breakdown panel, quick-action links)
- `messages/en.json` — Added `DocumentsHub` i18n namespace (20 keys)
- `messages/pl.json` — Added `DocumentsHub` i18n namespace (20 keys, Polish translations)

### Deleted
- `src/app/(app)/document-tools/page.tsx` — Content moved to `documents/ai-tools/page.tsx`
- `src/app/(app)/ask/page.tsx` — Old redirect page; redirect now handled via next.config.mjs entries in redirects.json

## Redirects (to be consolidated by Lead)

Written to `tasks/task-3/redirects.json`:
- `/document-tools` -> `/documents/ai-tools` (permanent)
- `/ask` -> `/documents/ai-tools` (permanent)

**NOTE:** Until Lead consolidates redirects into next.config.mjs, the `/document-tools` and `/ask` URLs will 404. This is expected for the parallel task phase.

## Architecture Decisions

- **KpiCard pattern**: Replicated the exact KpiCard component from `dashboard/page.tsx` (local to file, same props interface, same styling classes). Did not extract to a shared component to avoid scope creep.
- **Permission gating**: Uses `canView('documents')` with the same pattern as the global dashboard.
- **i18n namespace**: Created `DocumentsHub` (separate from existing `Documents` namespace used by the library page) to avoid key collisions.
- **Dashboard API reuse**: Fetches from `/api/dashboard` and extracts `data.docs` — no new API routes created.

## INTEGRATION Notes

- Task 4 (sidebar): Should point "Documents" sub-items to `/documents/library` and `/documents/ai-tools`
- Task 5 (link sweep): The library page at `documents/library/page.tsx` line 446 still has `router.push("/obligations")` — this is a stale reference to be updated by Task 5's link sweep
- Task 5 (link sweep): The sidebar `app-sidebar.tsx` line 295 still references `/document-tools` — needs update to `/documents/ai-tools`

## GOTCHA

- The old `ask/page.tsx` used a Next.js server-side `redirect()` function. Now that the file is deleted, the `/ask` redirect depends on `next.config.mjs` being updated by Lead. Until that happens, `/ask` will 404.
