# Task 2 — Implementation Plan

## Goal
Replace generic `'s3'` storage_backend with granular `'org_s3'`/`'platform_s3'` tags. Add strict read/delete routing based on stored tag. Preserve legacy `'s3'` fallback.

## Changes (all in `lib/storage.js`)

### 1. `putFile` — return granular backend type
**Current (line 120):** `return { storageBackend: "s3", storageKey: key, localPath: null };`
**Change to:** `return { storageBackend: backend.type, storageKey: key, localPath: null };`

`resolveWriteBackend()` already returns `type: 'org_s3'|'platform_s3'|'local'`, so this is a one-line change.

### 2. Add `resolveReadConfig(orgId, storageBackend)` function
New function implementing the routing table:
- `'org_s3'` → `getS3Config(orgId)` only; throw if null ("Org S3 credentials not configured")
- `'platform_s3'` → `getPlatformS3Config()` only; throw if null ("Platform S3 not configured")
- `'s3'` → `resolveReadS3Config(orgId)` (existing fallback: org → platform)
- `'local'` → return `null`

### 3. `getFile` — route by storage_backend tag
**Current:** Only handles `'s3'` and local branches.
**Change:** Handle `'org_s3'`, `'platform_s3'`, and `'s3'` all as S3 reads, each using `resolveReadConfig()` for credential resolution. The condition becomes `storageBackend === 'org_s3' || storageBackend === 'platform_s3' || storageBackend === 's3'`.

### 4. `deleteFile` — same routing change as getFile
Mirror the `getFile` changes: use `resolveReadConfig()` instead of `resolveReadS3Config()`. Same condition expansion.

### 5. Keep `resolveReadS3Config` as-is
Still used internally by `resolveReadConfig` for the legacy `'s3'` path.

## NOT modified
- `migration-worker.ts` — line 181 checks `result.storageBackend === 's3'`. Task 3 will update this to handle new tags. Noted in impl.md.

## Risk assessment
- **Backward compat:** Legacy `'s3'` records flow through the same `resolveReadS3Config()` path — zero behavior change.
- **New writes:** `putFile` callers already store `result.storageBackend` directly in DB — no caller changes needed.
- **Error handling:** `resolveReadConfig` throws explicitly for misconfigured org_s3/platform_s3, giving clear diagnostics instead of silent fallback.
