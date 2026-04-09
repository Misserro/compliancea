# Lead Notes — Plan 055: GDrive Shared Drive Fix + Source Views

## Plan Overview

Fix Google Drive Shared Drive download failures (`supportsAllDrives` missing on `files.get`/`files.export`), filter Contracts tab to GDrive-only, add source tabs to Documents Library, and hide manual upload UI.

## Concurrency Decision

2 tasks, both independent (no shared files). Running both in parallel as 2 concurrent task-teams.

## Task Dependency Graph

- Task 1: no dependencies (lib/gdrive.js only)
- Task 2: no dependencies (lib/db.js, API routes, UI — never touches lib/gdrive.js)

Both tasks are safe to run fully in parallel.

## Key Architectural Constraints

- `source = 'gdrive'` is the discriminator set by `scanGDrive` on insert — use it as the clean filter
- `supportsAllDrives: true` must be added to ALL `files.get` and `files.export` calls, not just some
- Do NOT delete upload components — only stop rendering them (future plan will re-enable)
- `getAllDocuments` callers that omit source param must get existing behavior (no regression)
- i18n keys must be added to both `messages/en.json` and `messages/pl.json`

## Decisions Made During Execution

- `listFilesRecursive` `files.list` call left unchanged — already has `supportsAllDrives: true` + `includeItemsFromAllDrives: true`; adding `corpora: 'drive'` + `driveId` would be over-engineering.
- `getContractsWithSummaries` uses `AND d.source = 'gdrive'` as clean discriminator (confirmed `scanGDrive` always sets this on insert).
- Documents Library tabs implemented with Button toggle pattern (matching existing codebase UI patterns) rather than a heavier tab component.
- `AddContractDialog` render removed from `contracts-tab.tsx` (not `contracts/page.tsx`).
- Polish i18n key: `Documents.sourceTab.uploaded = "Przesłane"`.

## Execution Complete

**Plan:** 055-gdrive-shared-drive-source-views
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: Added `supportsAllDrives: true` to `files.export`, `files.get` (media), and `files.get` (metadata) in `lib/gdrive.js`
- Task 2: Filtered `getContractsWithSummaries` to `source = 'gdrive'`; added optional source param to `getAllDocuments`; forwarded `?source` in documents API; added Google Drive/Uploaded tabs to Documents Library; hidden UploadSection and AddContractDialog renders; added i18n keys

### Files Modified
- `lib/gdrive.js` — modified (supportsAllDrives on download calls)
- `lib/db.js` — modified (source filter on contracts, source param on getAllDocuments)
- `src/app/api/documents/route.ts` — modified (?source query param)
- `src/app/(app)/documents/library/page.tsx` — modified (source tabs, UploadSection hidden)
- `src/components/contracts/contracts-tab.tsx` — modified (AddContractDialog render removed)
- `messages/en.json` — modified (Documents.sourceTab keys)
- `messages/pl.json` — modified (Documents.sourceTab keys)

### Test Results
- Per-task tests: 2/2 passed
- Final gate (full suite): PASS — npm run build clean, all 85 pages compiled

### Follow-up Items
- User must add service account email as Viewer member of the Shared Drive in Google Workspace admin (not a code change)
- Re-enabling manual upload UI is a future plan (components are preserved, just not rendered)
