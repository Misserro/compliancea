# Task 1: GDrive Engine Refactor — Per-Org Foundation

## Implementation Plan

### 1. `lib/db.js` — DB migration + helpers

**Migration:** Add `is_historical` to `contractMetadataColumns` array:
```js
{ name: "is_historical", def: "INTEGER NOT NULL DEFAULT 0" }
```

**Add `getOrgSetting(orgId, key)` singular helper** (currently only `getOrgSettings` plural exists, which returns all settings as an array). The singular helper does a direct query for a single key — more efficient for gdrive.js which needs individual keys frequently:
```js
export function getOrgSetting(orgId, key) {
  const row = get(`SELECT value FROM app_settings WHERE org_id = ? AND key = ?`, [orgId, key]);
  return row ? row.value : null;
}
```

**`updateDocumentMetadata` allowedFields:** Add `"is_historical"` to the array (line 1373, after `"contract_type"`).

**`getContractsWithSummaries`:** Add `d.is_historical` to both SELECT variants (org-scoped at line 2008 and fallback at line 2026).

### 2. `lib/gdrive.js` — Full org-scoping refactor

**Imports:** Replace `getAppSetting` with `getOrgSetting, setOrgSetting` from `./db.js`.

**Remove module-level state:**
- Remove `let lastSyncTime = null`
- Remove `let cachedClient = null` and `let cachedCredentialsHash = null`
- Add `const clientCache = new Map()` for per-org client caching

**`getDriveClient(orgId)`:**
- Read `getOrgSetting(orgId, 'gdrive_service_account')` instead of `getAppSetting('gdriveServiceAccount')`
- Cache key: `${orgId}:${credentialsJson}` (reuse if same creds)
- Store in `clientCache` Map keyed by orgId

**`getDriveId(orgId)` (renamed from `getFolderId`):**
- Read `getOrgSetting(orgId, 'gdrive_drive_id')` instead of `getAppSetting('gdriveFolderId')`
- URL-stripping logic unchanged

**`getGDriveStatus(orgId)`:**
- Read all three keys from `getOrgSetting(orgId, ...)`
- `lastSync` from `getOrgSetting(orgId, 'gdrive_last_sync_time')`

**`listFiles(orgId)` / `downloadFile(fileId, mimeType, orgId)`:**
- Pass `orgId` through to `getDriveClient(orgId)`

**`scanGDrive(orgId)`:**
- Pass `orgId` to `getDriveClient`/`getDriveId`
- Existing-docs query: add `AND org_id = ?` with `[orgId]`
- INSERT: add `org_id` column with `orgId` value
- End of scan: `setOrgSetting(orgId, 'gdrive_last_sync_time', new Date().toISOString())` instead of `lastSyncTime = ...`

**`shouldSync(orgId)`:**
- Read `getOrgSetting(orgId, 'gdrive_last_sync_time')` instead of process-local `lastSyncTime`

### 3. `src/lib/gdrive-imports.ts`

Re-export `shouldSync` alongside existing `scanGDrive` and `getGDriveStatus` (signatures now take `orgId`).

### 4. `src/lib/types.ts`

- Add `is_historical: number;` to `Document` interface (after `contract_type`)
- Add `is_historical?: number;` to `Contract` interface (after `contract_type`)

### 5. `src/lib/constants.ts`

Add:
```ts
export const GDRIVE_SETTINGS_KEYS = {
  serviceAccount: 'gdrive_service_account',
  driveId: 'gdrive_drive_id',
  historicalCutoff: 'gdrive_historical_cutoff',
  lastSyncTime: 'gdrive_last_sync_time',
  enabled: 'gdrive_enabled',
} as const;
```

### 6. `lib/db.d.ts`

Add type declaration for new `getOrgSetting` function.

## File Change Order

1. `lib/db.js` (migration + helper + allowlist + SELECT)
2. `lib/gdrive.js` (full org-scoping)
3. `src/lib/gdrive-imports.ts` (re-export)
4. `src/lib/types.ts` (is_historical)
5. `src/lib/constants.ts` (GDRIVE_SETTINGS_KEYS)
6. `lib/db.d.ts` (type for getOrgSetting)

## Decision: getOrgSetting helper

The plan spec references `getOrgSetting(orgId, key)` but only `getOrgSettings` (plural, returns all keys) exists in db.js. Adding singular `getOrgSetting` to db.js as an export (+ db-imports.ts + db.d.ts) so Task 2/3 can also reuse it.

## Risk Notes

- Adding `getOrgSetting` singular to db.js is a net-new export. It queries `app_settings` (where org settings live per the existing schema). Must also add to `db-imports.ts` and `db.d.ts`.
- The `is_historical NOT NULL DEFAULT 0` migration uses the same ALTER TABLE pattern as all other migrations — safe for existing rows.
- `scanGDrive(orgId)` INSERT must include `org_id` — existing callers in maintenance.js pass no orgId today but Task 3 will update them. For now the function requires orgId.
- `downloadFile` signature changes to `downloadFile(orgId, fileId, mimeType)` — orgId becomes first param. No external callers outside gdrive.js.
- `listFiles` signature changes to `listFiles(orgId, folderId)` — orgId first. Only called from scanGDrive internally.
