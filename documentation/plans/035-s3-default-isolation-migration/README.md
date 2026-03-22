# Plan 035 — S3: Default Policy, Strict Isolation & Per-Org Migration

## Overview

Three interconnected improvements to the S3 storage system:

1. **Default storage policy = platform_s3** — New organizations start with `platform_s3` instead of `local`. Super admin sees a warning if platform S3 is not yet configured.

2. **Strict S3 isolation** — Replace the generic `'s3'` storage_backend tag with granular `'org_s3'` / `'platform_s3'` values. `getFile` and `deleteFile` route strictly to the bucket recorded at write time — no cross-bucket fallback for new files. Legacy `'s3'` records retain backward-compatible fallback behavior.

3. **Per-org migration (both directions)** — Super admin can trigger file migration for a specific org: local → platform S3, or own S3 → platform S3. Exposed via new per-org API endpoints and a migration panel in the admin org list.

## Scope

### In scope
- `organizations.storage_policy` default changed from `'local'` to `'platform_s3'` (new orgs only; existing orgs unchanged)
- `createOrganization` explicitly sets `storage_policy='platform_s3'`
- Fix pre-existing bug: `getAllOrganizations()` did not SELECT `storage_policy` (admin panel showed "local" for all orgs)
- Org creation API: warns if platform S3 not configured (non-blocking; org is still created)
- `putFile` returns `'org_s3'` / `'platform_s3'` instead of generic `'s3'`
- `getFile` / `deleteFile` route based on stored `storage_backend` value (strict per-tag routing)
- Legacy `storage_backend='s3'` continues to use existing fallback (org → platform)
- `migration_jobs` table extended: `org_id` (nullable) and `migration_type` columns
- Migration worker: per-org filtering + `own_s3 → platform_s3` transfer direction
- Per-org migration API: `POST` + `GET` at `/api/admin/migrations/storage/orgs/[orgId]`
- Admin panel: per-org migration panel in expandable org row area

### Out of scope
- Bulk-updating existing `storage_backend='s3'` records (transitional; cleared by migration runs)
- Deleting source files after migration (non-destructive only; existing policy)
- Changing storage policy for existing orgs (remains manual via admin panel dropdown)
- Migrating files for orgs on `local` policy directly without changing policy first
- Global migration changes (existing `POST /api/admin/migrations/storage` unchanged)

## Architecture Notes

### storage_backend tag semantics (after this plan)

| Value | Written by | Read/Delete routing |
|-------|------------|---------------------|
| `'local'` | `putFile` (local backend) | Local filesystem |
| `'org_s3'` | `putFile` (org S3 backend) | Org S3 credentials only |
| `'platform_s3'` | `putFile` (platform S3 backend) | Platform S3 credentials only |
| `'s3'` | Legacy (pre-Plan 035) | Fallback: org S3 → platform S3 (unchanged) |

### Storage isolation rule (`lib/storage.js`)

```
resolveReadConfig(orgId, storageBackend):
  'org_s3'     → getS3Config(orgId)          (org credentials; throw if null)
  'platform_s3'→ getPlatformS3Config()        (platform credentials; throw if null)
  's3'         → getS3Config(orgId) || getPlatformS3Config()  (legacy fallback)
  'local'      → null                         (local fs path used directly)
```

### migration_jobs extensions

```sql
ALTER TABLE migration_jobs ADD COLUMN org_id INTEGER;
ALTER TABLE migration_jobs ADD COLUMN migration_type TEXT DEFAULT 'local_to_platform_s3';
```

`org_id = NULL` = global migration (existing behavior). `migration_type` values:
- `'local_to_platform_s3'` — reads local files, writes to platform S3
- `'own_s3_to_platform_s3'` — reads from org S3, writes to platform S3

### Migration prerequisites

| Type | Org S3 required? | Platform S3 required? |
|------|-----------------|----------------------|
| `local_to_platform_s3` | No | Yes |
| `own_s3_to_platform_s3` | Yes (must have credentials) | Yes |

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/migrations/storage/orgs/[orgId]` | super admin | Trigger per-org migration job |
| GET | `/api/admin/migrations/storage/orgs/[orgId]` | super admin | Get latest migration job status for org |

## Tasks

### Task 1 — Default storage policy + getAllOrganizations fix + org creation warning

**Description**: Change the default storage policy for new organizations from `'local'` to `'platform_s3'`. Fix the pre-existing bug where `getAllOrganizations()` did not SELECT `storage_policy` (causing the admin panel dropdown to always show "local"). Add a non-blocking warning to the org creation API response and dialog when platform S3 is not configured.

**Files**:
- `lib/db.js` — `getAllOrganizations()`: add `o.storage_policy` to the SELECT clause; `createOrganization(name, slug)`: change INSERT to explicitly set `storage_policy = 'platform_s3'`; update ALTER TABLE comment to reflect new default
- `src/app/api/admin/orgs/route.ts` — POST handler: after creating org, call `getPlatformS3Config()`; if null, include `warning: "Platform S3 is not configured. Files will fail to upload until platform S3 is set up."` in the 201 response; GET handler: ensure `storagePolicy` is mapped from `org.storage_policy`
- `src/components/admin/create-org-dialog.tsx` — after successful POST, check `data.warning`; if present, display an amber/yellow banner below the success state (alongside the invite link section) before the user clicks Done

**Success criteria**:
- New org created via admin panel → admin panel dropdown shows `Platform S3` (not `Local`) for that org
- `getAllOrganizations()` returns `storage_policy` for every org → admin panel dropdown reflects actual policy for all existing orgs
- When platform S3 is not configured: creating an org succeeds (201) but the dialog shows a warning banner; when platform S3 is configured: no warning appears
- Existing orgs with `storage_policy='local'` continue to show "Local" (not incorrectly defaulted)

**Dependencies**: None

---

### Task 2 — Granular storage_backend tagging + strict read/delete isolation

**Description**: Replace the generic `'s3'` storage backend identifier with `'org_s3'` / `'platform_s3'` for all new file writes. Update `getFile` and `deleteFile` to route credentials based on the stored `storage_backend` value rather than always resolving via the fallback chain. Legacy `'s3'` records retain backward-compatible behavior.

**Files**:
- `lib/storage.js`:
  - `putFile`: change the returned `storageBackend` from `'s3'` to `'org_s3'` when backend type is `'org_s3'`, and to `'platform_s3'` when backend type is `'platform_s3'`
  - Add `resolveReadConfig(orgId, storageBackend)` function implementing the routing table in Architecture Notes
  - `getFile`: replace `resolveReadS3Config(orgId)` call with `resolveReadConfig(orgId, storageBackend)`; handle `'org_s3'` and `'platform_s3'` branches explicitly; keep `'s3'` branch unchanged (legacy fallback)
  - `deleteFile`: same routing change as `getFile`
  - Keep `resolveReadS3Config` for legacy `'s3'` path; remove its use from the new branches

**Success criteria**:
- Upload a file as an org with `own_s3` configured → DB record has `storage_backend='org_s3'`; file is stored in org's S3 bucket
- Upload a file as an org with `platform_s3` policy → DB record has `storage_backend='platform_s3'`; file is stored in platform S3 bucket under `org-{id}/` prefix
- Download an `'org_s3'` file: succeeds using org credentials; does not attempt platform S3
- Download a `'platform_s3'` file: succeeds using platform credentials; does not attempt org S3
- Legacy `'s3'` files: continue to download successfully via existing fallback behavior
- Org with `local` fallback: file stored as `storage_backend='local'`; no regression

**Dependencies**: None (can run in parallel with Task 1)

---

### Task 3 — Migration worker: per-org filtering + own_s3→platform_s3 direction

**Description**: Extend the migration infrastructure to support per-org scoping and a new transfer direction (own S3 → platform S3). Adds `org_id` and `migration_type` columns to `migration_jobs` and new worker functions.

**Files**:
- `lib/db.js`:
  - Add ALTER TABLE statements for `org_id INTEGER` and `migration_type TEXT DEFAULT 'local_to_platform_s3'` on `migration_jobs`
  - Add `createMigrationJobForOrg(orgId, migrationType)` — inserts a row with `org_id` set; returns job id
  - Add `getLatestMigrationJobForOrg(orgId)` — returns the most recent job for that org (by `created_at DESC LIMIT 1`); returns null if none
- `src/lib/migration-worker.ts`:
  - Add `collectLocalFilesForOrg(orgId)` — copy of `collectFilesToMigrate()` with `AND d.org_id = ?` / join filters per table; handles all three tables (documents, contract_documents, contract_invoices)
  - Add `collectOwnS3FilesForOrg(orgId)` — collects files with `storage_backend IN ('s3', 'org_s3')` for the org across all three tables
  - Add `transferS3File(storageKey, sourceConfig, targetConfig, targetBucket)` — reads object from source S3 using `GetObjectCommand`, writes to target S3 using `PutObjectCommand`, returns new storage key (same key path)
  - Export `runOrgMigration(jobId, orgId, type)`:
    - `type='local_to_platform_s3'`: uses `collectLocalFilesForOrg` + existing `putFile` routing (same logic as global migration but org-scoped)
    - `type='own_s3_to_platform_s3'`: uses `collectOwnS3FilesForOrg`, calls `transferS3File` for each, updates DB records to `storage_backend='platform_s3'`

**Success criteria**:
- Per-org `local_to_platform_s3` migration only processes files belonging to the target org (other orgs' local files untouched)
- Per-org `own_s3_to_platform_s3` migration: files appear in platform S3 under the same `org-{id}/prefix/filename` key; DB records updated to `storage_backend='platform_s3'`; source files in org S3 are preserved (non-destructive)
- Migration job row has `org_id` set for per-org jobs; global jobs have `org_id = NULL`
- `getLatestMigrationJobForOrg` returns the correct job and not a different org's job

**Dependencies**: Task 2 (for `'org_s3'` backend tag to query in `collectOwnS3FilesForOrg`)

---

### Task 4 — Per-org migration API endpoint

**Description**: New API route for triggering and polling per-org migration jobs. Validates prerequisites before starting.

**Files**:
- `src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts`:
  - `POST`: authenticate super admin; parse and validate `type` from body (`'local_to_platform_s3'` | `'own_s3_to_platform_s3'`); check prerequisites — for `local_to_platform_s3`: platform S3 must be configured; for `own_s3_to_platform_s3`: org S3 credentials must exist AND platform S3 must be configured; reject with 400 + descriptive message if not met; check for already-running job for this org (`getLatestMigrationJobForOrg`) and reject 409 if running/pending; create job with `createMigrationJobForOrg(orgId, type)`; kick off `runOrgMigration` via `setImmediate`; return `{jobId}`
  - `GET`: authenticate super admin; call `getLatestMigrationJobForOrg(orgId)`; return job status (shape matching existing global status endpoint) or `{status:'none'}` if no jobs

**Success criteria**:
- `POST /api/admin/migrations/storage/orgs/42` with `{"type":"local_to_platform_s3"}` → 200 `{jobId: N}` when platform S3 configured; migration starts async
- `POST` with `{"type":"own_s3_to_platform_s3"}` when org has no S3 credentials → 400 with message "Org S3 credentials are not configured"
- `POST` with `{"type":"own_s3_to_platform_s3"}` when platform S3 not configured → 400 with message "Platform S3 is not configured"
- `POST` when another job for same org is running → 409
- `GET /api/admin/migrations/storage/orgs/42` → returns job status; returns `{status:'none'}` if org has no migration history

**Dependencies**: Task 3

---

### Task 5 — Admin panel per-org migration UI

**Description**: Add a migration panel to the expandable org row area in the admin panel. Super admin can trigger per-org migrations, see live progress, and is warned if prerequisites are not met.

**Files**:
- `src/components/admin/org-migration-panel.tsx` (new):
  - Fetches migration status on mount via `GET /api/admin/migrations/storage/orgs/[orgId]`
  - Polls every 2s while status is `running` / `pending` (same pattern as `StorageMigration` component)
  - Shows "Migrate Local → Platform S3" button: enabled if platform S3 is configured; disabled with tooltip "Platform S3 not configured" if not
  - Shows "Migrate Own S3 → Platform S3" button: visible only when `storagePolicy='own_s3'`; enabled when org has S3 credentials AND platform S3 configured; disabled with tooltip if not
  - Displays progress bar, migrated/failed/skipped counts while running
  - Displays last migration summary (completed/failed) when idle
  - Props: `orgId: number`, `storagePolicy: string`, `platformConfigured: boolean`, `orgS3Configured: boolean`
- `src/components/admin/admin-org-list.tsx`:
  - Add `orgS3Configured: boolean` to the `Org` interface
  - Add `OrgMigrationPanel` to the expandable row area alongside existing `OrgFeatureFlags` and `OrgMembersPanel`
- `src/app/(admin)/admin/page.tsx`:
  - Fetch per-org S3 configuration presence (call `getOrgSettings(orgId)` for each org, check for `s3Bucket` key) to populate `orgS3Configured`; or add a DB helper `hasOrgS3Config(orgId)` returning boolean

**Success criteria**:
- Admin panel org row expandable area shows "Migrate Files" section with per-org migration options
- "Migrate Local → Platform S3" button triggers migration for that org only; progress shown in real time via polling
- "Migrate Own S3 → Platform S3" button is only visible for orgs with `own_s3` policy; disabled with tooltip when prerequisites not met
- Completed migration shows summary (N migrated, N failed, N skipped)
- While a migration is running for org A, org B's migration panel is independently usable

**Dependencies**: Task 4
