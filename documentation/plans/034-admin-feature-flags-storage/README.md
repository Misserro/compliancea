# Plan 034 — Admin: Feature Flags & Storage Management

## Overview

Extends the super admin panel with two independent subsystems:

1. **Org Feature Flags** — Super admin can toggle which product features each organization can access. Access is enforced at both the backend API layer and the frontend UI. Super admins always bypass all feature checks.

2. **Platform S3 & Storage Policy** — Super admin configures a shared platform-wide S3 bucket, sets per-org storage policies (`local` / `platform_s3` / `own_s3`), and can trigger an async data migration job to move existing local files to S3.

## Scope

### In scope
- `org_features` table + API for toggling features per org
- `requireOrgFeature()` backend guard + JWT enrichment with enabled features
- Super admin UI: feature toggle panel per org
- Frontend feature gating (sidebar, route entry points)
- `platform_settings` table + API for platform-wide S3 config (admin only)
- `storage_policy` column on `organizations` + admin UI to set policy per org
- Storage routing update: org S3 → platform S3 → local fallback chain
- Org settings: read-only "managed by platform" view when `storage_policy = platform_s3`
- `migration_jobs` table + async migration job (local → S3)
- Migration trigger API + progress polling API
- Admin panel migration UI: trigger button + progress display

### Out of scope
- Dynamic feature flag creation (predefined static list only)
- Feature flag audit log / history
- Usage quotas or metered access limits
- Deleting local files after migration (non-destructive copy only)
- Per-user feature overrides (feature flags are org-level; user permission levels are separate via Plan 031)

## Architecture Notes

### Feature list (static)
```
contracts | legal_hub | template_editor | court_fee_calculator | policies | qa_cards
```
`documents` is always enabled (core) and is not in the feature flag table.

### Storage policy chain (`lib/storage.js`)
```
1. Org has own_s3 configured → use org S3 credentials
2. Org policy = platform_s3 AND platform S3 configured → use platform S3 credentials (same org-namespaced key prefix: org-{id}/...)
3. Fallback → local filesystem
```

### JWT changes
`session.orgFeatures: string[]` — array of enabled feature keys for the active org. Populated by `jwt()` callback in `src/auth.ts` alongside existing `permissions`. Super admin sessions skip feature checks entirely.

### Feature enforcement layers
- **Backend**: `requireOrgFeature(feature)` utility (mirrors `requireSuperAdmin`) — called at top of feature-specific API route handlers
- **Frontend**: `useSession().data.orgFeatures` checked in sidebar items and page layout guards

## New DB Tables

See `documentation/technology/architecture/database-schema.md`:
- `org_features` — `(org_id, feature)` PK, `enabled INTEGER`, `updated_at`
- `platform_settings` — `key TEXT PK`, `value TEXT`, `updated_at`
- `migration_jobs` — status tracking for async migration runs
- `organizations.storage_policy` — new column: `'local'` | `'platform_s3'` | `'own_s3'`

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/orgs/[id]/features` | super admin | Get feature flags for org |
| PUT | `/api/admin/orgs/[id]/features` | super admin | Bulk update feature flags for org |
| GET | `/api/admin/platform/storage` | super admin | Get platform S3 config |
| PUT | `/api/admin/platform/storage` | super admin | Save platform S3 config |
| DELETE | `/api/admin/platform/storage` | super admin | Remove platform S3 config |
| POST | `/api/admin/platform/storage/test` | super admin | Test platform S3 connection |
| PATCH | `/api/admin/orgs/[id]` | super admin | Extended: include `storage_policy` field |
| POST | `/api/admin/migrations/storage` | super admin | Trigger migration job |
| GET | `/api/admin/migrations/storage/status` | super admin | Get current migration job status |

## Tasks

### Task 1 — Org Feature Flags: DB, API, and Backend Enforcement

**Description**: Build the database layer, admin API, and backend enforcement infrastructure for org-level feature flags.

**Files**:
- `lib/db.js` — add `org_features` table migration; add `getOrgFeatures(orgId)`, `setOrgFeature(orgId, feature, enabled)` DB functions
- `src/lib/feature-flags.ts` — define `FEATURES` constant array; `requireOrgFeature(feature)` guard function; `getOrgFeaturesFromDb(orgId)` helper
- `src/app/api/admin/orgs/[id]/features/route.ts` — GET + PUT handlers (protected by `requireSuperAdmin`)
- `src/auth.ts` — extend `jwt()` callback to populate `orgFeatures: string[]` on token; super admins get all features

**Success criteria**:
- `GET /api/admin/orgs/[id]/features` returns `{ contracts: true, legal_hub: true, ... }` for all 6 features
- `PUT /api/admin/orgs/[id]/features` with `{ contracts: false }` persists the change and is reflected in next GET
- A non-super-admin request to an API route protected by `requireOrgFeature('contracts')` for an org where `contracts = false` receives 403
- Super admin requests to the same route succeed regardless of feature setting
- JWT `orgFeatures` array reflects the org's enabled features after login

**Dependencies**: None (builds on existing `requireSuperAdmin` pattern)

---

### Task 2 — Org Feature Flags: Admin UI and Frontend Gating

**Description**: Add feature toggle panel to the super admin panel (per-org) and apply frontend feature gating to sidebar navigation and page entry points.

**Files**:
- `src/components/admin/org-feature-flags.tsx` — feature toggle card component (list of features with toggle switches); calls `PUT /api/admin/orgs/[id]/features`
- `src/app/(admin)/admin/page.tsx` — add "Features" section to org detail/expansion area (alongside existing member count)
- `src/components/layout/sidebar.tsx` (or equivalent sidebar file) — gate sidebar items using `session.orgFeatures`; hide disabled feature nav items for non-super-admin users
- `src/types/next-auth.d.ts` — add `orgFeatures: string[]` to Session type

**Success criteria**:
- Admin panel org row has a "Features" expandable section showing 6 toggles with current state
- Toggling a switch in the admin panel immediately updates the feature state (optimistic or with confirmation)
- A user whose org has `contracts = false` does not see "Contracts" in the sidebar
- A super admin always sees all sidebar items regardless of org feature settings
- Disabling a feature for org X does not affect org Y's sidebar

**Dependencies**: Task 1 must be complete (needs API and session type)

---

### Task 3 — Platform S3 Config and Per-Org Storage Policy (Admin Panel)

**Description**: Build the platform-wide S3 configuration (new admin section) and the per-org storage policy selector. Also update the org settings storage section to show read-only info when policy is `platform_s3`.

**Files**:
- `lib/db.js` — add `platform_settings` table migration; add `getPlatformSettings()`, `setPlatformSetting(key, value)`, `deletePlatformSettings()` DB functions; add `storage_policy` column to `organizations`; add `updateOrgStoragePolicy(orgId, policy)` function
- `src/app/api/admin/platform/storage/route.ts` — GET/PUT/DELETE handlers for platform S3 config (protected by `requireSuperAdmin`)
- `src/app/api/admin/platform/storage/test/route.ts` — POST handler to test platform S3 connection
- `src/components/admin/platform-storage-config.tsx` — form component: bucket, region, access key, secret, optional endpoint; test + save buttons
- `src/app/(admin)/admin/page.tsx` — add "Platform Storage" section to admin panel (above org list)
- `src/components/admin/admin-org-list.tsx` — add storage policy dropdown per org row (`local` / `platform_s3` / `own_s3`); calls `PATCH /api/admin/orgs/[id]` with `storage_policy`
- `src/app/api/admin/orgs/[id]/route.ts` — extend PATCH handler to accept and persist `storage_policy`
- `src/components/settings/storage-section.tsx` — add conditional: if org `storage_policy = 'platform_s3'`, render read-only info message instead of S3 config form

**Success criteria**:
- Admin panel has a "Platform Storage" section; filling in credentials and clicking "Test Connection" returns success/failure feedback
- Saving platform S3 credentials persists them (encrypted) in `platform_settings`
- Each org row in admin panel has a storage policy selector; changing it persists to DB
- Org with `storage_policy = 'platform_s3'` sees read-only storage section in org settings; cannot edit S3 credentials
- Org with `storage_policy = 'own_s3'` continues to see and use the existing S3 config form

**Dependencies**: Task 1 (for `requireSuperAdmin` pattern familiarity, no hard dependency)

---

### Task 4 — Storage Routing Update

**Description**: Update `lib/storage.js` to implement the three-tier routing chain: org S3 → platform S3 → local. Routing is based on the org's `storage_policy` and configured credentials.

**Files**:
- `lib/storage.js` — update `putFile`, `getFile`, `deleteFile` to resolve the effective storage backend using the policy chain; fetch platform S3 config when `storage_policy = 'platform_s3'`; org-namespaced key prefix (`org-{id}/...`) applied to platform S3 the same way as per-org S3
- `lib/db.js` — add `getOrgStoragePolicy(orgId)` helper if not already added in Task 3
- `src/lib/server-utils.ts` — verify `saveUploadedFile` passes through correctly with new routing (no logic changes expected, just verification)

**Success criteria**:
- Uploading a document for an org with `storage_policy = 'platform_s3'` (and platform S3 configured) stores the file in the platform bucket under `org-{orgId}/documents/` prefix
- Uploading a document for an org with `storage_policy = 'own_s3'` uses org-specific credentials (existing behaviour unchanged)
- Uploading a document for an org with `storage_policy = 'local'` stores to local filesystem (existing behaviour unchanged)
- Downloading a document correctly resolves backend regardless of where it was originally stored (reads `storage_backend` column)
- Cross-org isolation: org A cannot read org B's files even when both use platform S3 (key namespace enforces this)

**Dependencies**: Task 3 must be complete (platform S3 config + `storage_policy` column must exist in DB)

---

### Task 5 — Async Data Migration Job

**Description**: Build the full data migration pipeline: async background job, progress tracking, admin trigger API, status polling API, and admin panel UI with progress display.

**Files**:
- `lib/db.js` — add `migration_jobs` table migration; add `createMigrationJob()`, `updateMigrationJob(id, patch)`, `getLatestMigrationJob()` DB functions
- `src/lib/migration-worker.ts` — async migration logic: query all docs with `storage_backend = 'local'` (from `documents`, `contract_documents`, `contract_invoices` tables); for each: read file from local path, determine target S3 credentials (org policy), upload via `putFile`, update DB record `storage_backend` and `storage_key`; update job progress counters after each file; handles errors per-file without aborting entire job
- `src/app/api/admin/migrations/storage/route.ts` — POST to trigger migration (protected by `requireSuperAdmin`); rejects if a job is already running; creates `migration_jobs` row; kicks off `migration-worker` in background (using `setImmediate` or equivalent non-blocking pattern); returns `{ jobId }`
- `src/app/api/admin/migrations/storage/status/route.ts` — GET to poll latest job status; returns `{ status, total, migrated, failed, error, startedAt, completedAt }`
- `src/components/admin/storage-migration.tsx` — admin panel component: "Migrate Data to S3" button (disabled if no platform/org S3 configured); progress bar + file counts when job is running; completion/error summary when done; polls `/api/admin/migrations/storage/status` every 2s while running
- `src/app/(admin)/admin/page.tsx` — add migration component to admin panel (below Platform Storage section)

**Success criteria**:
- Clicking "Migrate Data to S3" in admin panel triggers the migration job; button is disabled while job is in progress
- Admin panel shows real-time progress: "X of Y files migrated" with percentage progress bar, updated every 2 seconds
- After migration: documents previously on local backend are accessible via S3 (download works); DB records show `storage_backend = 's3'` and `storage_key` set
- Local files are NOT deleted after migration (non-destructive copy)
- If a single file fails, migration continues; final summary shows failed file count
- If no S3 is configured (neither platform nor per-org), migration button is disabled with explanation tooltip
- Triggering migration while one is already running returns an error; existing job continues unaffected

**Dependencies**: Tasks 3 and 4 must be complete (platform S3 config and storage routing must exist)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| JWT refresh delay after feature toggle | Medium | Acceptable — feature flags are business access control, not security auth. Worst case: 15-minute lag until token refresh. |
| Migration job blocks Node.js event loop for large file counts | High | Use async iteration with `await` per file; never block synchronously. For very large datasets, consider chunked processing with progress saves. |
| Platform S3 credential leak if `platform_settings` encryption key rotated | Low | `STORAGE_ENCRYPTION_KEY` is the same key already used for per-org S3; no new risk surface. |
| Storage routing regression (existing files served incorrectly) | Medium | Task 4 explicitly tests all three backend modes; `storage_backend` column on each document record always wins — routing reads from record, not just org policy. |
| org_features opt-out model hides new features from existing orgs | Low | All features default to enabled; new features added to `FEATURES` constant are available to all orgs immediately unless super admin disables them. |

## Documentation Gaps (Updated)

| Gap | Document | Status |
|-----|----------|--------|
| `org_features` table | `database-schema.md` | Updated in Stage 4 Step 1 |
| `platform_settings` table | `database-schema.md` | Updated in Stage 4 Step 1 |
| `migration_jobs` table | `database-schema.md` | Updated in Stage 4 Step 1 |
| `organizations.storage_policy` column | `database-schema.md` | Updated in Stage 4 Step 1 |
| Org feature access control requirements | `features.md` | Updated in Stage 4 Step 1 |
| Platform S3 & migration requirements | `features.md` | Updated in Stage 4 Step 1 |
