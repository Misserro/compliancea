# Lead Notes — Plan 035: S3 Default Policy, Strict Isolation & Per-Org Migration

## Plan Overview

Three interconnected S3 storage improvements:
1. Default storage policy = platform_s3 for new orgs (+ fix getAllOrganizations bug)
2. Granular storage_backend tagging (org_s3/platform_s3 instead of generic s3) + strict read/delete routing
3. Per-org migration infrastructure — both local→platform_s3 and own_s3→platform_s3 directions

## Concurrency Decision

- **Slots:** 2 concurrent task-teams
- **Initial spawn:** Tasks 1 + 2 in parallel (both have no dependencies)
- **Sequence after:** Task 3 (after Task 2 done) → Task 4 (after Task 3) → Task 5 (after Task 4)
- **Pipeline spawning:** Task 3 can start planning while Task 2 is in review/test

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: no dependencies (parallel with Task 1)
- Task 3: depends on Task 2
- Task 4: depends on Task 3
- Task 5: depends on Task 4

## Key Architectural Constraints

1. **Backward compatibility is non-negotiable** — legacy `storage_backend='s3'` records must continue working. The fallback chain (org → platform) must be preserved for that value only.
2. **`putFile` return value change** — it now returns `'org_s3'` or `'platform_s3'` instead of `'s3'`. All callers store this value directly in the DB. No callers need changes since they use `result.storageBackend`.
3. **`resolveReadConfig(orgId, storageBackend)` is the new routing function** — takes BOTH org ID and stored backend tag. Replaces `resolveReadS3Config(orgId)` for new paths only.
4. **Migration is non-destructive** — source files always preserved. Only DB metadata (storage_backend, storage_key) gets updated.
5. **`migration_jobs.org_id` is nullable** — NULL = global migration (existing behavior preserved). Per-org jobs have org_id set.
6. **DB functions needed:** `createMigrationJobForOrg(orgId, type)`, `getLatestMigrationJobForOrg(orgId)`, `getAllOrganizations` must SELECT `storage_policy`, `hasOrgS3Config(orgId)` (for admin page).

## Critical Files

- `lib/db.js` — getAllOrganizations, createOrganization, migration_jobs ALTER TABLE, new job functions
- `lib/storage.js` — putFile return value, resolveReadConfig, getFile, deleteFile
- `src/lib/migration-worker.ts` — collectLocalFilesForOrg, collectOwnS3FilesForOrg, transferS3File, runOrgMigration
- `src/app/api/admin/orgs/route.ts` — POST warning, GET storagePolicy mapping
- `src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts` — new per-org migration API
- `src/components/admin/create-org-dialog.tsx` — warning banner
- `src/components/admin/org-migration-panel.tsx` — new component
- `src/components/admin/admin-org-list.tsx` — OrgMigrationPanel integration
- `src/app/(admin)/admin/page.tsx` — orgS3Configured per org

## Tech Stack (relevant)

- Next.js 15, React 19
- SQLite (sql.js) via lib/db.js — synchronous run/query/get functions
- @aws-sdk/client-s3 — GetObjectCommand, PutObjectCommand, DeleteObjectCommand
- TypeScript throughout src/
- lib/ files are CommonJS (ESM exports via `export function`)

## Decisions Made

- (2026-03-22) Task 1 and 2 run in parallel — no shared files
- (2026-03-22) `'s3'` legacy tag keeps old fallback behavior permanently (no forced migration of old records)
- (2026-03-22) `migration_jobs` org_id is nullable for backward compat with global migration
- (2026-03-22) Global migration API (`POST /api/admin/migrations/storage`) unchanged

## Execution Complete

**Plan:** 035-s3-default-isolation-migration
**Tasks:** 5 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: getAllOrganizations fix + createOrganization default + org creation warning
- Task 2: Granular storage_backend tags + strict read/delete isolation in storage.js
- Task 3: Migration worker extended — per-org filtering + own_s3→platform_s3 + line 181 fix
- Task 4: Per-org migration API (POST/GET /api/admin/migrations/storage/orgs/[orgId])
- Task 5: OrgMigrationPanel component + admin panel integration

### Files Modified
- `lib/db.js` — getAllOrganizations, createOrganization, migration_jobs ALTER TABLE, new job functions
- `lib/db.d.ts` — type declarations
- `lib/storage.js` — putFile return values, resolveReadConfig, getFile/deleteFile routing, new exports
- `lib/storage.d.ts` — type declarations
- `src/lib/db-imports.ts` — new DB function re-exports
- `src/lib/migration-worker.ts` — line 181 fix, 5 new functions
- `src/app/api/admin/orgs/route.ts` — storagePolicy in GET, platform S3 warning in POST
- `src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts` — new file
- `src/app/(admin)/admin/page.tsx` — platformConfigured + orgS3Configured
- `src/components/admin/admin-org-list.tsx` — OrgMigrationPanel integration
- `src/components/admin/create-org-dialog.tsx` — warning banner
- `src/components/admin/org-migration-panel.tsx` — new file
- `tests/unit/storage-driver-unit.test.ts` — stale test fixes
- `tests/integration/storage-config-api.test.ts` — stale test fixes
- `documentation/technology/architecture/database-schema.md` — updated
- `documentation/product/requirements/features.md` — updated

### Test Results
- Per-task tests: 5/5 passed (reviewer + tester PASS on each)
- Final gate (full suite): PASSED — 709/709 tests, TypeScript clean
- 8 stale tests fixed (mock + assertion updates)

### Git
- Commit: 1002d8a
- Pushed to origin/main
