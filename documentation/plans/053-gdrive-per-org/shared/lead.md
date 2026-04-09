# Lead Notes — Plan 053: Per-Org Google Drive Integration

## Plan Overview

Refactor the existing single-tenant GDrive integration to be multi-tenant: each org independently connects its own Google Workspace Shared Drive, documents sync per-org, and contracts imported from Drive with past expiry dates are marked "historical" (skipping obligation extraction).

## Concurrency Decision

- **Max concurrent task-teams:** 2
- Task 1 runs alone first (foundational DB + lib changes)
- Tasks 2 and 3 run in parallel after Task 1 completes

## Task Dependency Graph

- Task 1: no dependencies — runs first
- Task 2: depends on Task 1 — settings API + UI
- Task 3: depends on Task 1 — maintenance cycle + historical badge
- Tasks 2 and 3 can run in parallel

## Key Architectural Constraints

1. **org_settings pattern**: All per-org config uses `getOrgSetting(orgId, key)` / `setOrgSetting(orgId, key, value)` — never `getAppSetting`/`setAppSetting` for org-specific GDrive data.
2. **CJS boundary**: `lib/` is pure CJS (CommonJS). `lib/maintenance.js` imports from `./db.js`, `./gdrive.js`, `./contracts.js` — all CJS. No ESM imports from `src/` in `lib/`.
3. **is_historical is AI-managed**: Set by processing pipeline, not manually editable. No user-facing toggle.
4. **All GDrive docs are contracts**: `doc_type` forced to `'contract'`, auto-tagger skipped.
5. **lastSyncTime**: Must be persisted per-org to DB (`org_settings`), not process-local variable.
6. **Drive client cache**: Must be a `Map` keyed by `orgId` (not module-level singleton).

## Critical Decisions

- Service account JSON stored unencrypted in org_settings — consistent with existing S3 credentials pattern (accepted tech debt, out of scope to fix here).
- No migration script for existing app_settings GDrive credentials — single-org admins re-enter after upgrade.
- Historical cutoff defaults to today when not yet set by admin.

## Execution Log

### Key Decision: app_settings vs org_settings table name
Both reviewer-3 and tester-3 initially flagged `app_settings` as a bug, expecting a table named `org_settings`. Executor-3 verified: there is no `org_settings` table — all org settings are stored in `app_settings` with an `org_id` column. The `getOrgSetting(orgId, key)` helper queries `app_settings WHERE org_id = ? AND key = ?`. This is correct and consistent with the entire codebase.

### Pre-existing failure noted
`tests/unit/court-fee.test.ts` has 1 pre-existing failure unrelated to plan 053 (court fee proportional calculation at boundary 20000.01 PLN). Not introduced by this plan.

## Execution Complete

**Plan:** 053-gdrive-per-org
**Tasks:** 3 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1 (GDrive engine refactor): Added is_historical column, getOrgSetting helper, full org-scoping of lib/gdrive.js, GDRIVE_SETTINGS_KEYS constants, types updated
- Task 2 (GDrive settings API + UI): Migrated all GDrive endpoints to per-org, added historicalCutoff field, relabeled driveId input, 3 new i18n keys EN+PL
- Task 3 (Maintenance cycle + historical badge): Per-org maintenance loop, processGDriveDocument auto-processing, historical flag logic, amber Historical badge on contract card and metadata view

### Files Modified
- `lib/db.js` — is_historical migration, getOrgSetting helper, allowedFields, SELECT
- `lib/gdrive.js` — full org-scoping (getDriveClient, getDriveId, getGDriveStatus, scanGDrive, shouldSync)
- `lib/maintenance.js` — per-org GDrive loop, processGDriveDocument, historical flag
- `src/lib/gdrive-imports.ts` — re-exports updated signatures
- `src/lib/types.ts` — is_historical on Document + Contract
- `src/lib/constants.ts` — GDRIVE_SETTINGS_KEYS
- `lib/db.d.ts` — getOrgSetting type declaration
- `src/app/api/gdrive/settings/route.ts` — per-org GET/PATCH, historicalCutoff, enabled
- `src/app/api/gdrive/status/route.ts` — pass orgId
- `src/app/api/gdrive/scan/route.ts` — pass orgId
- `src/components/settings/gdrive-section.tsx` — historicalCutoff date input, driveIdLabel
- `src/components/contracts/contract-card.tsx` — amber Historical badge
- `src/components/contracts/contract-metadata-display.tsx` — Historical note
- `messages/en.json` — 5 new i18n keys
- `messages/pl.json` — 5 new i18n keys

### Test Results
- Per-task tests: All passed (Task 1: 41 tests, Task 2: PASS, Task 3: PASS)
- Final gate (full suite): 1058/1059 passed — 1 pre-existing failure in court-fee.test.ts (unrelated to plan 053)

### Follow-up Items
- Pre-existing court-fee test failure (tests/unit/court-fee.test.ts:31) should be investigated separately
- Single-org deployments that had GDrive configured in app_settings (global keys) will need to re-enter credentials after upgrade (noted as out of scope)
