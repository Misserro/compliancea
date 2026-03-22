# Task 4 — Implementation Report

## File Created

`src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts`

## What Was Implemented

### POST handler
- Auth: `auth()` + `requireSuperAdmin(session)`
- Parses `orgId` from route params (Next.js 15 async params), validates as integer
- Parses `type` from JSON body, validates against `['local_to_platform_s3', 'own_s3_to_platform_s3']`
- Prerequisite checks:
  - Platform S3: `getPlatformSettings()` → checks `s3Bucket` + `s3SecretEncrypted` → 400 "Platform S3 is not configured"
  - Org S3 (only for `own_s3_to_platform_s3`): `getOrgSettings(orgId)` → checks `s3Bucket` + `s3SecretEncrypted` → 400 "Org S3 credentials are not configured"
- Conflict check: `getLatestMigrationJobForOrg(orgId)` → 409 if running/pending
- Creates job via `createMigrationJobForOrg(orgId, type)`, calls `saveDb()`
- Kicks off `runOrgMigration` via `setImmediate` (non-blocking)
- Returns `{ jobId }`

### GET handler
- Auth: same pattern
- Parses and validates `orgId`
- Calls `getLatestMigrationJobForOrg(orgId)`
- Returns `{ status: 'none' }` if no job exists
- Otherwise returns same shape as existing global status endpoint: `{ id, status, total, migrated, failed, skipped, error, startedAt, completedAt }`

## Patterns Followed
- `export const runtime = "nodejs"` — matches existing migration routes
- Auth guard pattern — identical to `src/app/api/admin/migrations/storage/route.ts`
- Platform S3 check — same logic as `src/app/api/admin/orgs/route.ts` (lines 145-149)
- Org S3 check — same logic as `lib/storage.js` `getS3Config()`
- GET response shape — identical to `src/app/api/admin/migrations/storage/status/route.ts`
- `setImmediate` async kickoff — same as global migration POST handler

## Type Check
- No TypeScript errors in the new file (verified via `tsc --noEmit`)
