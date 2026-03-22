# Task 2 — Implementation Notes

## Changes made to `lib/storage.js`

### 1. `putFile` return value (line 146)
Changed `storageBackend: "s3"` to `storageBackend: backend.type`. Since `resolveWriteBackend()` already returns `type: 'org_s3'|'platform_s3'|'local'`, this passes the granular tag through to callers who store it in the DB.

### 2. New function: `resolveReadConfig(orgId, storageBackend)` (lines 102-119)
Routes S3 credential resolution based on the stored `storage_backend` value:
- `'org_s3'` — `getS3Config(orgId)` only; throws if null
- `'platform_s3'` — `getPlatformS3Config()` only; throws if null
- `'s3'` (legacy) — delegates to `resolveReadS3Config(orgId)` (org -> platform fallback, unchanged)
- `'local'` / unrecognized — returns null

### 3. `getFile` routing (line 166)
Changed condition from `storageBackend === "s3"` to `storageBackend !== "local"` so all S3 variants route through `resolveReadConfig`. The strict per-tag routing is handled inside `resolveReadConfig`.

### 4. `deleteFile` routing (lines 194-207)
Same condition change as `getFile`. Added try/catch around `resolveReadConfig` to preserve the original silent-skip behavior when credentials are missing (old code checked `if (s3Config)` and silently skipped).

## Preserved
- `resolveReadS3Config` — unchanged, still used internally by `resolveReadConfig` for legacy `'s3'` path.

## NOT modified (intentional)
- **`src/lib/migration-worker.ts` line 181** — checks `result.storageBackend === 's3'`. After this change, new uploads return `'org_s3'` or `'platform_s3'`, so the migration worker will not pick up newly-uploaded S3 files (only legacy ones). Task 3 must update this check to handle the new tags.
