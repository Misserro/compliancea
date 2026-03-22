# Task 5 — Implementation Report

## Files Created

### `src/components/admin/org-migration-panel.tsx`
New client component for per-org migration UI. Features:
- Expandable toggle (same pattern as OrgFeatureFlags/OrgMembersPanel)
- Fetches migration status on expand via `GET /api/admin/migrations/storage/orgs/{orgId}`
- Polls every 2s while status is running/pending (same setInterval pattern as StorageMigration)
- "Migrate Local to Platform S3" button: always shown; disabled with tooltip when platform S3 not configured
- "Migrate Own S3 to Platform S3" button: only rendered when `storagePolicy === 'own_s3'`; disabled with tooltip when org S3 or platform S3 not configured
- Progress bar with migrated/failed/skipped counts while running
- Completed summary with green banner and timestamp
- Failed summary with red banner and error details
- Retry hint when failed > 0
- Each instance manages its own interval ref (independent per org)

## Files Modified

### `src/components/admin/admin-org-list.tsx`
- Added `orgS3Configured: boolean` to `Org` interface
- Changed component signature to accept `platformConfigured: boolean` prop
- Imported and added `OrgMigrationPanel` in expandable row area (new `<tr>` below feature flags)
- Passes `orgId`, `storagePolicy`, `platformConfigured`, `orgS3Configured` to each panel

### `src/app/(admin)/admin/page.tsx`
- Imported `getOrgSettings` and `getPlatformSettings` from `@/lib/db-imports`
- Computes `platformConfigured` once from platform settings (checks `s3Bucket` + `s3SecretEncrypted`)
- Computes `orgS3Configured` per org from org settings (same key check)
- Added `orgS3Configured` to Org interface and mapping
- Passes `platformConfigured` to `AdminOrgList`

## No DB changes needed
Used existing `getOrgSettings(orgId)` and `getPlatformSettings()` — no new DB helper required.
