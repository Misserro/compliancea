# Task 3 — Implementation Notes

## Changes Made

### 1. `lib/db.js`
- Added ALTER TABLE statements for `migration_jobs`: `org_id INTEGER` (nullable) and `migration_type TEXT DEFAULT 'local_to_platform_s3'`
- Added `createMigrationJobForOrg(orgId, migrationType)` — inserts a job row with org_id and migration_type set
- Added `getLatestMigrationJobForOrg(orgId)` — returns most recent job for a specific org (by created_at DESC LIMIT 1)

### 2. `lib/db.d.ts`
- Added type declarations for the two new DB functions

### 3. `lib/storage.js`
- Exported `getS3Config`, `getPlatformS3Config`, `getS3Client` (previously internal) — needed by migration worker for S3-to-S3 transfers

### 4. `lib/storage.d.ts`
- Added type declarations for the three newly exported functions

### 5. `src/lib/db-imports.ts`
- Re-exported `createMigrationJobForOrg` and `getLatestMigrationJobForOrg`

### 6. `src/lib/migration-worker.ts`
- **Bug fix (line 181):** Changed `result.storageBackend === "s3"` to `result.storageBackend !== "local"` in `runMigration()` — Task 2 changed `putFile` to return `'org_s3'`/`'platform_s3'` instead of `'s3'`, so the old check would mark all migrated files as "skipped"
- Added `MigrationS3File` interface for own-S3 file collection
- Added `collectLocalFilesForOrg(orgId)` — same queries as `collectFilesToMigrate()` but with `AND d.org_id = ?` filter
- Added `collectOwnS3FilesForOrg(orgId)` — collects files with `storage_backend IN ('s3', 'org_s3')` across all three tables
- Added `transferS3File(storageKey, sourceConfig, targetConfig)` — reads from source S3, writes to target S3 using same key; non-destructive
- Added `runOrgMigration(jobId, orgId, type)` — entry point for per-org migrations:
  - `local_to_platform_s3`: uses `collectLocalFilesForOrg` + `putFile` (same routing as global migration but org-scoped)
  - `own_s3_to_platform_s3`: uses `collectOwnS3FilesForOrg` + `transferS3File`; updates DB records to `storage_backend='platform_s3'`
- Widened `updateFileRecord` signature to accept `{ table, id, column? }` so it works for both `MigrationFile` and `MigrationS3File`

## TypeScript Build
- `npx tsc --noEmit` passes cleanly
