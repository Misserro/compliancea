# Task 2 Implementation Notes

## Changes Made

### DB Layer — `lib/db.js`

1. **`getContractsWithSummaries(orgId)`**: Added `AND d.source = 'gdrive'` to WHERE clause in both orgId and no-orgId branches. Contracts tab now only shows GDrive-sourced contracts.

2. **`getAllDocuments(orgId, source?)`**: Added optional `source` parameter with three modes:
   - `'gdrive'`: filters `AND d.source = 'gdrive'`
   - `'uploaded'`: filters `AND (d.source IS NULL OR d.source != 'gdrive')`
   - absent/undefined: no filter (backward-compatible)

### API Layer — `src/app/api/documents/route.ts`

- Changed `GET()` to `GET(request: NextRequest)` to access search params.
- Reads `?source` query param and passes to `getAllDocuments(orgId, source)`.

### UI Layer

**`src/app/(app)/documents/library/page.tsx`**:
- Replaced type filter chips ("All"/"Policies") with source tabs ("Google Drive"/"Uploaded").
- Default tab is "Google Drive". Each tab fetches from `/api/documents?source={gdrive|uploaded}`.
- Removed `<UploadSection>` render and its import.
- Removed unused `handleStatusMessage` function and `typeFilter` state.
- `loadDocuments` now includes `sourceTab` in the fetch URL.

**`src/components/contracts/contracts-tab.tsx`**:
- Removed `AddContractDialog` render and "Add New Contract" button.
- Removed unused imports: `Plus`, `AddContractDialog`, `PERMISSION_LEVELS`, `useSession`.
- Removed `showAddDialog` state and `canEdit`/`permLevel` since they were only used by the add button.

### i18n

- Added `Documents.sourceTab.googleDrive` and `Documents.sourceTab.uploaded` to both `messages/en.json` and `messages/pl.json`.

## Files Changed

| File | Lines Changed |
|------|---------------|
| `lib/db.js` | `getAllDocuments` +source param, `getContractsWithSummaries` +gdrive filter |
| `src/app/api/documents/route.ts` | NextRequest import, ?source param |
| `src/app/(app)/documents/library/page.tsx` | Source tabs, removed UploadSection |
| `src/components/contracts/contracts-tab.tsx` | Removed AddContractDialog + add button |
| `messages/en.json` | +sourceTab keys |
| `messages/pl.json` | +sourceTab keys |

## Build Status

`npm run build` passes successfully.
