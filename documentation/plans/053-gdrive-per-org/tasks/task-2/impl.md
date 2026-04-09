# Task 2: Implementation Notes

## Files Changed

1. **`src/app/api/gdrive/settings/route.ts`** — 4 changes:
   - Replaced `getAppSetting`/`setAppSetting` imports with `getOrgSetting`/`setOrgSetting` from `@/lib/db-imports`
   - GET handler: reads all settings via `getOrgSetting(orgId, ...)` for `gdrive_service_account`, `gdrive_drive_id`, `gdrive_historical_cutoff`, `gdrive_enabled`; returns `historicalCutoff` (defaults to today YYYY-MM-DD) and `enabled` boolean in response
   - PATCH handler: writes via `setOrgSetting(orgId, ...)`; validates `historicalCutoff` as YYYY-MM-DD format; auto-sets `gdrive_enabled = "1"` when both credentials and driveId are present, `""` otherwise
   - Added helper `todayISO()` for default cutoff date

2. **`src/app/api/gdrive/status/route.ts`** — 1 change:
   - Passed `orgId` to `getGDriveStatus(orgId)` call (orgId was already available from session)

3. **`src/app/api/gdrive/scan/route.ts`** — 1 change:
   - Passed `orgId` to both `getGDriveStatus(orgId)` and `scanGDrive(orgId)` calls

4. **`src/components/settings/gdrive-section.tsx`** — 4 changes:
   - Added `useTranslations('Settings')` import and hook
   - Added `historicalCutoff` state (initialized to today YYYY-MM-DD)
   - Added date input for historical cutoff with translated label `t('historicalCutoff')` and help text `t('historicalCutoffHelp')`
   - Relabeled folder ID input to `t('driveIdLabel')`
   - Included `historicalCutoff` in PATCH payload and loaded from GET response

5. **`messages/en.json`** — Added 3 keys to Settings namespace:
   - `historicalCutoff`: "Historical cutoff date"
   - `historicalCutoffHelp`: "Contracts expiring before this date are marked historical (no obligations generated)"
   - `driveIdLabel`: "Shared Drive ID or Folder ID"

6. **`messages/pl.json`** — Added 3 matching Polish keys to Settings namespace:
   - `historicalCutoff`: "Data graniczna historycznych"
   - `historicalCutoffHelp`: "Umowy wygasające przed tą datą są oznaczane jako historyczne (bez generowania zobowiązań)"
   - `driveIdLabel`: "ID Shared Drive lub ID folderu"

## Build Status

`npm run build` passes with no TypeScript errors.

## Integration Notes for Task 3

- The `gdrive_enabled` flag is now auto-managed: set to `"1"` when both credentials and driveId exist, `""` otherwise. Task 3 can query `org_settings WHERE key = 'gdrive_enabled' AND value = '1'` to find all GDrive-enabled orgs.
- `gdrive_historical_cutoff` is stored per-org. Task 3 should read it via `getOrgSetting(orgId, 'gdrive_historical_cutoff')` when processing contracts to determine if they are historical.
