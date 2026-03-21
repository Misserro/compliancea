# Lead Notes — Plan 034

## Plan Overview
Extends the super admin panel with:
1. **Org Feature Flags** — static per-org feature toggles (contracts, legal_hub, template_editor, court_fee_calculator, policies, qa_cards). Backend enforcement via `requireOrgFeature()`. JWT carries `orgFeatures[]`.
2. **Platform S3 + Storage Policy** — super admin configures shared platform S3; sets per-org policy (`local` / `platform_s3` / `own_s3`); three-tier storage routing chain.
3. **Async Data Migration** — background job copies local files → S3; progress tracked in `migration_jobs` table.

## Concurrency Decision
- 3 concurrent task-teams max
- Tasks 1 and 3 start in parallel (no dependencies between them)
- Task 2 pipeline-spawned when Task 1 enters review/test
- Task 4 pipeline-spawned when Task 3 enters review/test
- Task 5 blocked until Tasks 3 AND 4 both complete

## Task Dependency Graph
```
Task 1 (Feature Flags DB/API) ──────────────→ Task 2 (Feature Flags UI)
Task 3 (Platform S3 + Policy) ──────────────→ Task 4 (Storage Routing)
Task 3 (done) + Task 4 (done) ─────────────→ Task 5 (Migration Job)
```

## Key Architectural Constraints
- **Feature flags are opt-out**: all 6 features enabled by default for new orgs; absence of row = enabled
- **Super admins bypass all feature checks**: check `isSuperAdmin` before `requireOrgFeature()`
- **JWT propagation**: `orgFeatures: string[]` added to JWT in `src/auth.ts` jwt() callback, same pattern as `permissions`
- **Storage key namespace**: `org-{id}/{prefix}/{filename}` — enforced identically for org S3 AND platform S3
- **`storage_backend` column wins**: when reading/downloading, always use the record's `storage_backend` column, NOT the org's current policy (files may have been stored under a different policy)
- **Non-destructive migration**: local files kept after S3 copy — only DB records updated
- **Platform credentials encrypted**: same AES-256-GCM + STORAGE_ENCRYPTION_KEY used for per-org S3 (lib/storage-crypto.js)
- **Migration is async**: use `setImmediate` or similar non-blocking kick-off; store progress in `migration_jobs` table; UI polls every 2s

## Key Files (existing)
- `lib/storage.js` — dual-mode storage driver (to be extended in Task 4)
- `lib/storage-crypto.js` — AES-256-GCM encryption for S3 credentials
- `lib/db.js` — all schema migrations and DB functions (Tasks 1, 3, 4, 5 all touch this)
- `src/lib/require-super-admin.ts` — pattern to mirror for `requireOrgFeature()`
- `src/auth.ts` — JWT callback (Task 1 adds `orgFeatures`)
- `src/app/(admin)/admin/page.tsx` — admin panel (Tasks 2, 3, 5 add sections)
- `src/components/admin/admin-org-list.tsx` — org list (Tasks 2, 3 add controls)
- `src/components/settings/storage-section.tsx` — org settings storage (Task 3 adds conditional)

## IMPORTANT: lib/db.js conflict risk
Tasks 1, 3, 4, and 5 ALL modify `lib/db.js`. Task executors must be aware of what the other tasks added to avoid conflicts. Lead will communicate cross-task DB function additions when approving plans.

## Decisions Made
- Feature list is static/predefined in code (not admin-configurable)
- Backend enforcement required (not just frontend hiding)
- Migration is non-destructive (keep local files)
- Org settings storage section shows read-only info when policy = platform_s3
- Opt-out model: features enabled by default, super admin disables selectively

## Execution Log
All 5 tasks completed. 0 incidents, 0 retries. Wall-clock ~22 minutes.

---

## Execution Complete

**Plan:** 034-admin-feature-flags-storage
**Tasks:** 5 completed, 0 skipped, 0 escalated

### Tasks Completed
- **Task 1**: org_features table, getOrgFeatures/setOrgFeature DB functions, requireOrgFeature() guard, JWT orgFeatures enrichment, admin API GET/PUT /api/admin/orgs/[id]/features
- **Task 2**: OrgFeatureFlags toggle component, admin-org-list expansion row, app-sidebar canAccessFeature() gating for contracts/legal_hub/policies
- **Task 3**: platform_settings table, getPlatformSettings/setPlatformSetting/deletePlatformSettings, storage_policy column on organizations, platform S3 admin API + test endpoint, PlatformStorageConfig UI, per-org storage policy dropdown, org settings read-only view for platform_s3 policy
- **Task 4**: lib/storage.js three-tier routing (getPlatformS3Config, resolveWriteBackend, resolveReadS3Config); putFile/getFile/deleteFile updated
- **Task 5**: migration_jobs table, createMigrationJob/updateMigrationJob/getLatestMigrationJob, migration-worker.ts async job, POST/GET migration APIs, StorageMigration UI with 2s polling, admin page integration

### Files Modified
- `lib/db.js` — org_features, platform_settings, migration_jobs tables; getAllOrganizations updated to SELECT storage_policy; 12 new DB functions
- `lib/db.d.ts` — type declarations for all new functions
- `lib/storage.js` — three-tier routing (getPlatformS3Config, resolveWriteBackend, resolveReadS3Config)
- `src/lib/db-imports.ts` — all new DB functions re-exported
- `src/lib/feature-flags.ts` (NEW) — FEATURES constant, requireOrgFeature guard, getOrgFeaturesFromDb
- `src/lib/migration-worker.ts` (NEW) — async migration logic
- `src/auth.ts` — orgFeatures added to JWT/session
- `src/app/api/admin/orgs/[id]/features/route.ts` (NEW)
- `src/app/api/admin/platform/storage/route.ts` (NEW)
- `src/app/api/admin/platform/storage/test/route.ts` (NEW)
- `src/app/api/admin/migrations/storage/route.ts` (NEW)
- `src/app/api/admin/migrations/storage/status/route.ts` (NEW)
- `src/app/api/admin/orgs/[id]/route.ts` — PATCH extended with storage_policy
- `src/app/(admin)/admin/page.tsx` — PlatformStorageConfig + StorageMigration sections added
- `src/components/admin/org-feature-flags.tsx` (NEW)
- `src/components/admin/platform-storage-config.tsx` (NEW)
- `src/components/admin/storage-migration.tsx` (NEW)
- `src/components/admin/admin-org-list.tsx` — OrgFeatureFlags expansion + storage policy dropdown
- `src/components/layout/app-sidebar.tsx` — canAccessFeature() gating
- `src/components/settings/storage-section.tsx` — read-only view for platform_s3 policy
- `src/app/api/org/storage/route.ts` — storagePolicy in GET response

### Decisions Made During Execution
- Feature flag undefined in JWT treated as "all enabled" (graceful fallback for stale sessions)
- Storage credential resolution for reads: org S3 first, then platform S3 — transparent to callers
- Both org_s3 and platform_s3 writes produce `storageBackend: 's3'` with identical key namespace
- Migration "no S3 configured" orgs counted in failed_files (visible to admin, not silently skipped)
- saveDb() called after each migrated file (sql.js persistence guarantee)

### Test Results
- Per-task tests: 5/5 PASS (reviewer + tester PASS on every task)
- Final gate (TypeScript + integration checks): PASS — zero errors, all sections wired

### Follow-up Items
- Consider adding a feature flag audit log (audit_log table already exists for this)
- Migration local file cleanup (delete after confirmed S3 copy) can be added as a separate admin action
- Per-org S3 credentials should not be deletable if storage_policy = 'own_s3' and files exist — consider a warning
