# Plan: GDrive Shared Drive Fix + Source Views

> **Execute:** `/uc:plan-execution 055`
> Created: 2026-04-09
> Status: Draft
> Source: Feature Mode

## Objective

Fix Google Drive file download failures on Shared Drives (missing `supportsAllDrives` flag on `files.get`/`files.export` calls), filter the Contracts tab to show only GDrive-sourced contracts, add "Google Drive" / "Uploaded" tabs to the Documents Library, and temporarily hide manual upload UI.

## Context

- **Architecture:** `documentation/technology/architecture/data-flow.md` (GDrive sync flow, Shared Drive requirements)
- **Architecture:** `documentation/technology/architecture/database-schema.md` (`documents.source`, `documents.storage_backend`)
- **Architecture:** `documentation/technology/architecture/api-endpoints.md` (documents and contracts API routes)
- **Plans:** Plan 053 (`053-gdrive-per-org`) — per-org GDrive integration; Plan 054 (`054-gdrive-document-classification`) — doc classification

## Tech Stack

- Google Drive API v3 (`googleapis`) — `files.list`, `files.get`, `files.export` with Shared Drive parameters
- Next.js 15 — App Router, React components
- SQLite (`lib/db.js`) — `getContractsWithSummaries`, `getAllDocuments`

## Scope

### In Scope

- Add `supportsAllDrives: true` to all `files.get` and `files.export` calls in `lib/gdrive.js`
- Filter Contracts tab to show only `source = 'gdrive'` documents
- Add optional `source` query param to `/api/documents` + `getAllDocuments`
- Add "Google Drive" / "Uploaded" tabs to Documents Library page
- Hide manual upload UI (`UploadSection`, `AddContractDialog`) without deleting code

### Out of Scope

- Re-enabling manual upload (temporary disable — future plan)
- Migrating existing S3/local contracts to GDrive
- Shared Drive membership setup (service account must be added as Shared Drive member by the user — this is a Google Workspace admin operation, not app code)
- Per-org settings toggle for upload enable/disable

## Success Criteria

- [ ] Files in a Shared Drive are downloaded and processed by the maintenance cycle
- [ ] Contracts tab shows only GDrive-sourced contracts; manually uploaded contracts are hidden there
- [ ] Documents Library shows "Google Drive" and "Uploaded" tabs; each tab shows only documents from that source
- [ ] Upload button and "Add Contract" dialog are not visible in the UI
- [ ] `npm run build` passes

## Task List

> Every task gets the full pipeline: planning -> impl -> review -> test.

### Task 1: Fix GDrive Shared Drive download failures

- **Description:** In `lib/gdrive.js`, all `drive.files.list()` calls already have `supportsAllDrives: true` and `includeItemsFromAllDrives: true`, but the download calls do not. Add `supportsAllDrives: true` to:
  - `driveClient.files.get({ fileId, alt: "media" }, ...)` (media download for PDF/DOCX)
  - `driveClient.files.get({ fileId, fields: "name" })` (metadata fetch for filename)
  - `driveClient.files.export({ fileId, mimeType: "application/pdf" }, ...)` (Google Docs export)

  Also audit whether `corpora: 'drive'` + `driveId` should be added to `listFilesRecursive`'s `files.list` call when the configured ID is a Shared Drive root — the executor should verify this via Google Drive API docs (query knowledge agent). If listing already works without it, skip to avoid over-engineering.

- **Files:** `lib/gdrive.js`
- **Patterns:** `documentation/technology/architecture/data-flow.md` (Shared Drive support section)
- **Success criteria:** After the fix, the maintenance cycle successfully downloads files from a Shared Drive. Specifically: `downloadFile` no longer throws for Shared Drive file IDs; `files.get` and `files.export` calls include `supportsAllDrives: true`; `npm run build` passes.
- **Dependencies:** None

### Task 2: Contracts GDrive filter + Documents source tabs + hide upload UI

- **Description:** Three cohesive changes across DB, API, and UI — all related to source-based document visibility:

  **DB layer (`lib/db.js`):**
  - `getContractsWithSummaries`: add `AND (d.source = 'gdrive' OR d.source IS NULL AND d.gdrive_file_id IS NOT NULL)` — actually, simplest is `AND d.source = 'gdrive'` since `scanGDrive` always sets `source = 'gdrive'` on insert. Verify this and use the clean discriminator.
  - `getAllDocuments(orgId, source?)`: add optional `source` parameter. When `source = 'gdrive'`, add `AND source = 'gdrive'`. When `source = 'uploaded'`, add `AND (source IS NULL OR source != 'gdrive')`. When absent or `'all'`, no filter (existing behavior).

  **API layer:**
  - `src/app/api/documents/route.ts`: read `?source` from `searchParams`, pass to `getAllDocuments(orgId, source)`.
  - `src/app/api/contracts/route.ts`: no change needed — filtering is in `getContractsWithSummaries`.

  **UI layer:**
  - `src/app/(app)/documents/library/page.tsx`: replace the current single document list with two tabs: "Google Drive" (fetches `?source=gdrive`) and "Uploaded" (fetches `?source=uploaded`). Use the existing Tabs component pattern from the codebase. Default to "Google Drive" tab. Each tab fetches independently when activated.
  - `src/components/documents/upload-section.tsx` or its render location in `library/page.tsx`: remove the `<UploadSection />` render call (do not delete the component — just stop rendering it).
  - `src/components/contracts/add-contract-dialog.tsx` or its render location: find where `AddContractDialog` is rendered (likely `src/app/(app)/contracts/page.tsx` or a contracts list component) and remove the trigger button/render. Do not delete the component file.
  - Add i18n keys for "Google Drive" and "Uploaded" tab labels in `messages/en.json` and `messages/pl.json`.

- **Files:** `lib/db.js`, `src/app/api/documents/route.ts`, `src/app/(app)/documents/library/page.tsx`, `src/components/contracts/add-contract-dialog.tsx` (parent render location), `messages/en.json`, `messages/pl.json`
- **Patterns:** `documentation/technology/architecture/database-schema.md` (documents.source field), `documentation/technology/architecture/data-flow.md`, `documentation/technology/architecture/api-endpoints.md`
- **Success criteria:** (1) `GET /api/contracts` returns only documents with `source = 'gdrive'`; (2) `GET /api/documents?source=gdrive` returns GDrive docs only, `?source=uploaded` returns non-GDrive docs only, no `?source` returns all; (3) Documents Library shows "Google Drive" and "Uploaded" tabs, each populated correctly; (4) No upload button visible anywhere in the UI; (5) `npm run build` passes.
- **Dependencies:** None (can run in parallel with Task 1)

## Documentation Changes

Documentation updated during Stage 4 Step 1 (already on disk):

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/data-flow.md` | Updated | Added Shared Drive support requirements: all `files.get`/`files.export` calls need `supportsAllDrives: true`; service account must be a Shared Drive member |

Additional documentation gaps identified (not yet addressed):

| File | Needed Change |
|------|---------------|
| `documentation/product/requirements/features.md` | Update GDrive sync section to reflect source-based Contracts/Documents filtering introduced in Plan 055 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Service account not added as Shared Drive member | Medium | High — files still won't download even after code fix | Document clearly: user must add service account email as Viewer member of the Shared Drive in Google Workspace admin. This is a setup step, not a code fix. |
| Existing manually uploaded contracts disappear from Contracts tab | Low (intentional) | Medium — users may be confused | Expected behavior per spec: existing S3/local contracts are hidden from Contracts tab, accessible via Documents Library > Uploaded tab. |
| `getAllDocuments` source filter breaks existing callers | Low | Medium | Only the Documents library API route calls `getAllDocuments` with the new param; all other callers omit it and get existing behavior. |
| Tasks 1 and 2 in parallel touch no shared files | None | None | Task 1 is `lib/gdrive.js` only; Task 2 never touches `lib/gdrive.js`. Safe to run in parallel. |
