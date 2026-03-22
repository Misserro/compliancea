# Task 4 — Per-org Migration API Endpoint

## Overview

Create `src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts` with POST (trigger) and GET (status) handlers for per-org migration jobs.

## Implementation Plan

### File to create

`src/app/api/admin/migrations/storage/orgs/[orgId]/route.ts`

### Imports

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { ensureDb } from "@/lib/server-utils";
import {
  createMigrationJobForOrg,
  getLatestMigrationJobForOrg,
  getOrgSettings,
  getPlatformSettings,
  saveDb,
} from "@/lib/db-imports";
import { runOrgMigration } from "@/lib/migration-worker";
```

### POST handler

1. Auth: `auth()` + `requireSuperAdmin(session)` — same pattern as `route.ts` in parent
2. `await ensureDb()`
3. Parse `orgId` from `params.orgId` (cast to number)
4. Parse `type` from request body JSON
5. Validate `type` is one of `'local_to_platform_s3'` or `'own_s3_to_platform_s3'` — 400 if not
6. Prerequisite checks:
   - Platform S3 check (both types need this): call `getPlatformSettings()`, build config object, check `s3Bucket` and `s3SecretEncrypted` — if missing, return 400 `{ error: "Platform S3 is not configured" }`
   - Org S3 check (only for `own_s3_to_platform_s3`): call `getOrgSettings(orgId)`, build config object, check `s3Bucket` and `s3SecretEncrypted` — if missing, return 400 `{ error: "Org S3 credentials are not configured" }`
7. Conflict check: `getLatestMigrationJobForOrg(orgId)` — if status is `'running'` or `'pending'`, return 409 `{ error: "Migration already in progress for this organization" }`
8. Create job: `createMigrationJobForOrg(orgId, type)` — returns jobId
9. `saveDb()`
10. `setImmediate(() => { runOrgMigration(jobId, orgId, type).catch(...) })`
11. Return 200 `{ jobId }`

### GET handler

1. Auth: same pattern
2. `await ensureDb()`
3. Parse `orgId` from `params.orgId`
4. Call `getLatestMigrationJobForOrg(orgId)`
5. If null: return `{ status: 'none' }`
6. Otherwise return same shape as existing status endpoint:
   ```json
   {
     "id": job.id,
     "status": job.status,
     "total": job.total_files,
     "migrated": job.migrated_files,
     "failed": job.failed_files,
     "skipped": job.skipped_files,
     "error": job.error,
     "startedAt": job.started_at,
     "completedAt": job.completed_at
   }
   ```

### Patterns followed from existing code

- `export const runtime = "nodejs"` at top level
- Auth guard: `const session = await auth(); const denied = requireSuperAdmin(session); if (denied) return denied;`
- `await ensureDb()` before any DB access
- `saveDb()` after writes
- `setImmediate` for async migration kickoff (non-blocking response)
- Platform S3 check: `getPlatformSettings()` → `Object.fromEntries()` → check `s3Bucket` + `s3SecretEncrypted` (same as `src/app/api/admin/orgs/route.ts` lines 145-149)
- Org S3 check: `getOrgSettings(orgId)` → `Object.fromEntries()` → check `s3Bucket` + `s3SecretEncrypted` (same as `lib/storage.js` `getS3Config`)

### Next.js route params

In Next.js 15, route params are accessed as `params` prop which is a Promise. Handler signature:
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
)
```

### Validation

- `orgId`: parse as integer via `parseInt`, reject NaN with 400
- `type`: must be exactly one of the two valid strings — reject with 400 otherwise

## Risk Assessment

- Low risk — follows established patterns exactly
- All DB functions (`createMigrationJobForOrg`, `getLatestMigrationJobForOrg`) already exist from Task 3
- `runOrgMigration` already exported from migration-worker.ts
- No new dependencies needed
