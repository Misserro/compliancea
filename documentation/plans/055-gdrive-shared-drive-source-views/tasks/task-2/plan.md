# Task 2 Plan: Contracts GDrive filter + Documents source tabs + hide upload UI

## Summary

Three cohesive changes across DB, API, and UI to filter documents by source and hide manual upload.

## Changes

### 1. DB Layer — `lib/db.js`

**`getContractsWithSummaries(orgId)`** (line 2019):
- Add `AND d.source = 'gdrive'` to the WHERE clause in both branches (orgId and no-orgId).
- Verified: `scanGDrive` always sets `source = 'gdrive'` on insert (lib/gdrive.js:306,312,351,386). Safe discriminator.

**`getAllDocuments(orgId, source?)`** (line 1145):
- Add optional second parameter `source`.
- When `source === 'gdrive'`: append `AND d.source = 'gdrive'` to WHERE clause.
- When `source === 'uploaded'`: append `AND (d.source IS NULL OR d.source != 'gdrive')`.
- When absent/undefined: no filter (existing behavior preserved).
- Both orgId branches need the same source filter logic.

### 2. API Layer — `src/app/api/documents/route.ts`

- Import `NextRequest` (or use `Request`) to access search params.
- Change `GET()` to `GET(request)`.
- Read `source` from `request.nextUrl.searchParams.get('source')` or parse URL.
- Pass `source` as second argument to `getAllDocuments(orgId, source)`.
- Validate `source` is one of `'gdrive'`, `'uploaded'`, or absent.

**`src/app/api/contracts/route.ts`**: No changes needed — `getContractsWithSummaries` handles the filter internally.

### 3. UI Layer

**`src/app/(app)/documents/library/page.tsx`**:
- Replace the type filter chips ("All" / "Policies") with source tabs: "Google Drive" (default) and "Uploaded".
- Use simple button-based tabs (same pattern as current type filter chips, but switching data source).
- When tab changes, re-fetch with `?source=gdrive` or `?source=uploaded`.
- Each tab loads independently. `loadDocuments` takes an optional source parameter.
- Remove `<UploadSection>` render (line 332-337). Keep the import comment for future re-enable.
- Keep all existing functionality (search, status filter, actions, etc.) within each tab.

**`src/components/contracts/contracts-tab.tsx`**:
- Remove the `AddContractDialog` render (lines 123-130) and the "Add New Contract" button (lines 61-69).
- Remove unused imports: `Plus`, `AddContractDialog`, `showAddDialog` state.

**i18n — `messages/en.json` and `messages/pl.json`**:
- Add keys under `Documents.sourceTab`: `googleDrive`, `uploaded`.

## Files Changed

| File | Change |
|------|--------|
| `lib/db.js` | Add source filter to `getContractsWithSummaries`, add source param to `getAllDocuments` |
| `src/app/api/documents/route.ts` | Read `?source` query param, pass to `getAllDocuments` |
| `src/app/(app)/documents/library/page.tsx` | Source tabs, remove UploadSection render |
| `src/components/contracts/contracts-tab.tsx` | Remove AddContractDialog render and add button |
| `messages/en.json` | Add `Documents.sourceTab.googleDrive`, `Documents.sourceTab.uploaded` |
| `messages/pl.json` | Add `Documents.sourceTab.googleDrive`, `Documents.sourceTab.uploaded` |

## Risks

- `getAllDocuments` callers that omit source param get existing behavior (no regression).
- Existing manually uploaded contracts hidden from Contracts tab (intentional per spec).
