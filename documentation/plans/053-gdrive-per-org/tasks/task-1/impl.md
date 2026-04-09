# Task 1: Implementation Notes

## Files Changed

1. **`lib/db.js`** — 4 changes:
   - Added `{ name: "is_historical", def: "INTEGER NOT NULL DEFAULT 0" }` to `contractMetadataColumns` migration array
   - Added `"is_historical"` to `updateDocumentMetadata` `allowedFields` array
   - Added `d.is_historical` to both SELECT variants in `getContractsWithSummaries`
   - Added new `getOrgSetting(orgId, key)` singular helper function (queries `app_settings` for a single org+key)

2. **`lib/gdrive.js`** — Full org-scoping rewrite:
   - Import: replaced `getAppSetting` with `getOrgSetting, setOrgSetting` from `./db.js`
   - Removed module-level `lastSyncTime`, `cachedClient`, `cachedCredentialsHash`
   - Added `const clientCache = new Map()` for per-org client caching (key: orgId, value: { client, credHash })
   - `getDriveClient(orgId)` — reads `getOrgSetting(orgId, 'gdrive_service_account')`
   - `getDriveId(orgId)` — renamed from `getFolderId()`, reads `getOrgSetting(orgId, 'gdrive_drive_id')`
   - `getGDriveStatus(orgId)` — reads all settings per-org, `lastSync` from `getOrgSetting(orgId, 'gdrive_last_sync_time')`
   - `listFiles(orgId, folderId)` — orgId as first param, passed to getDriveClient/getDriveId
   - `downloadFile(orgId, fileId, mimeType)` — orgId as first param
   - `scanGDrive(orgId)` — scoped existing-docs query with `AND org_id = ?`, INSERT includes `org_id`, sync time persisted via `setOrgSetting`
   - `shouldSync(orgId)` — reads `getOrgSetting(orgId, 'gdrive_last_sync_time')` instead of process-local variable

3. **`src/lib/gdrive-imports.ts`** — Added `shouldSync` to re-exports

4. **`src/lib/types.ts`** — Added `is_historical: number` to `Document` interface; added `is_historical?: number` to `Contract` interface

5. **`src/lib/constants.ts`** — Added `GDRIVE_SETTINGS_KEYS` constant object with all 5 GDrive org_settings keys

6. **`src/lib/db-imports.ts`** — Added `getOrgSetting` to re-exports

7. **`lib/db.d.ts`** — Added type declaration for `getOrgSetting`

## INTEGRATION Notes for Task 2 and Task 3

- **`getOrgSetting(orgId, key)`** is now available from `lib/db.js` and `src/lib/db-imports.ts`. Returns `string | null`.
- **`scanGDrive(orgId)`** now requires `orgId` parameter. Task 3 must update `lib/maintenance.js` to loop orgs and pass orgId.
- **`getGDriveStatus(orgId)`** and **`shouldSync(orgId)`** also require orgId. Task 3 must update maintenance.js calls.
- **`GDRIVE_SETTINGS_KEYS`** exported from `src/lib/constants.ts` — Task 2 can use these for the settings API.
- The `folderId` field in `getGDriveStatus` return value is preserved for backward compatibility (callers expect it).
- `downloadFile` signature changed to `downloadFile(orgId, fileId, mimeType)` — orgId is now the first parameter.

## Build Status

`npm run build` passes with no TypeScript errors.
