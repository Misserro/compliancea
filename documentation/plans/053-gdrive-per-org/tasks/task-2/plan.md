# Task 2: Implementation Plan — GDrive Settings API + UI (Per-Org)

## Overview

Migrate GDrive settings endpoints and UI from global (`app_settings`) to per-org (`org_settings`). Add historical cutoff date field and enabled flag.

## Changes

### 1. `src/app/api/gdrive/settings/route.ts`

- Replace `getAppSetting`/`setAppSetting` imports with `getOrgSetting`/`setOrgSetting` from `@/lib/db-imports`
- GET handler: read `getOrgSetting(orgId, 'gdrive_service_account')`, `getOrgSetting(orgId, 'gdrive_drive_id')`, `getOrgSetting(orgId, 'gdrive_historical_cutoff')`, `getOrgSetting(orgId, 'gdrive_enabled')`
- GET response adds: `historicalCutoff` (defaults to today `YYYY-MM-DD` when null), `enabled` boolean
- PATCH handler: write credentials/driveId via `setOrgSetting(orgId, ...)`, validate and write `historicalCutoff`, auto-set `gdrive_enabled = "1"` when both credentials and driveId are provided
- PATCH response adds: `historicalCutoff`, `enabled`

### 2. `src/app/api/gdrive/status/route.ts`

- Pass `orgId` to `getGDriveStatus(orgId)` (already has `orgId` from session, just needs to pass it)

### 3. `src/app/api/gdrive/scan/route.ts`

- Pass `orgId` to `scanGDrive(orgId)` and `getGDriveStatus(orgId)`

### 4. `src/components/settings/gdrive-section.tsx`

- Add `useTranslations('Settings')` for i18n
- Add `historicalCutoff` state (default: today `YYYY-MM-DD`)
- Add date input for historical cutoff with label from `t('historicalCutoff')` and help text
- Relabel folder ID to `t('driveIdLabel')`
- Include `historicalCutoff` in PATCH payload
- Load `historicalCutoff` from GET response

### 5. i18n (`messages/en.json`, `messages/pl.json`)

Add to Settings namespace:
- `"historicalCutoff": "Historical cutoff date"` / `"Data graniczna historycznych"`
- `"historicalCutoffHelp": "Contracts expiring before this date are marked historical (no obligations generated)"` / Polish translation
- `"driveIdLabel": "Shared Drive ID or Folder ID"` / Polish translation

## Integration with Task 1

- Uses `getOrgSetting(orgId, key)` / `setOrgSetting(orgId, key, value)` from `@/lib/db-imports` (added by Task 1)
- `scanGDrive(orgId)` and `getGDriveStatus(orgId)` now require orgId (changed by Task 1)
- `GDRIVE_SETTINGS_KEYS` from `@/lib/constants` available but not strictly needed (using string literals for consistency with existing code patterns)
